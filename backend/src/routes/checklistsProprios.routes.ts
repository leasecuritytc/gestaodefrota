import express, { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { PoolClient } from "pg";
import { env } from "../env";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Checklist PRÓPRIO (inspeção quinzenal) dos veículos das bases do escopo.
// A VEC fica só para consulta (/api/checklists); aqui nada é enviado a ela.
export const checklistsProprioRouter = Router();
checklistsProprioRouter.use(requireAuth);

const LEITURA = requireRole("superadmin", "admin", "gestor_base", "leitor");
const ESCRITA = requireRole("superadmin", "admin", "gestor_base");
const DIAS_VENCIMENTO = 15;

const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

function bases(): string[] {
  return env.vec.bases;
}

// Itens ativos, na ordem do formulário.
checklistsProprioRouter.get("/itens", LEITURA, h(async (req, res) => {
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT id, categoria, texto, critico, ordem FROM checklist_itens WHERE ativo ORDER BY ordem`)
  );
  res.json(r.rows);
}));

// Veículos do escopo com último checklist próprio, último da VEC (só leitura) e vencimento.
checklistsProprioRouter.get("/veiculos", LEITURA, h(async (req, res) => {
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT v.id, v.placa, v.base, v.tipo, v.status, v.chassi, v.rentadora, v.transportadora,
              u.ultimo_proprio, u.ultimo_km,
              (SELECT max(e.data_hora) FROM checklist_events e WHERE e.placa = v.placa) AS ultimo_vec,
              (SELECT vv.estado FROM vec_veiculos vv WHERE vv.placa = v.placa) AS estado_vec,
              (u.ultimo_proprio IS NULL OR u.ultimo_proprio < now() - ($2 || ' days')::interval) AS vencido,
              (SELECT x.id FROM checklist_execucoes x WHERE x.vehicle_id = v.id AND x.status = 'Rascunho'
                 ORDER BY x.data_hora DESC LIMIT 1) AS rascunho_id
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT max(x.data_hora) AS ultimo_proprio, max(x.km) AS ultimo_km
         FROM checklist_execucoes x WHERE x.vehicle_id = v.id AND x.status = 'Concluido'
       ) u ON true
       WHERE v.base = ANY($1) AND v.status <> 'Desmobilizado'
       ORDER BY v.base, v.placa`,
      [bases(), String(DIAS_VENCIMENTO)]
    )
  );
  res.json(r.rows);
}));

const filtroSchema = z.object({
  base: z.string().max(10).optional(),
  placa: z.string().max(10).optional(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["Rascunho", "Concluido"]).optional(),
});

checklistsProprioRouter.get("/", LEITURA, h(async (req, res) => {
  const p = filtroSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtros inválidos." });
  const f = p.data;
  const args: unknown[] = [bases()];
  const cond = ["x.base = ANY($1)"];
  if (f.base) { args.push(f.base); cond.push(`x.base = $${args.length}`); }
  if (f.placa) { args.push(`%${f.placa.toUpperCase()}%`); cond.push(`upper(v.placa) LIKE $${args.length}`); }
  if (f.de) { args.push(f.de); cond.push(`x.data_ref >= $${args.length}::date`); }
  if (f.ate) { args.push(f.ate); cond.push(`x.data_ref <= $${args.length}::date`); }
  if (f.status) { args.push(f.status); cond.push(`x.status = $${args.length}`); }
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT x.id, v.placa, x.base, x.data_hora, x.km, x.status, x.num_falhas, x.ocorrencia_id,
              coalesce(u.full_name, u.email) AS executor
       FROM checklist_execucoes x
       JOIN vehicles v ON v.id = x.vehicle_id
       LEFT JOIN users u ON u.id = x.executado_por
       WHERE ${cond.join(" AND ")}
       ORDER BY x.data_hora DESC
       LIMIT 300`,
      args
    )
  );
  res.json(r.rows);
}));

async function carregar(c: PoolClient, id: string) {
  const ex = await c.query(
    `SELECT x.id, x.vehicle_id, v.placa, x.base, x.data_hora, x.km, x.status, x.num_falhas, x.observacoes,
            x.ocorrencia_id, coalesce(u.full_name, u.email) AS executor
     FROM checklist_execucoes x JOIN vehicles v ON v.id = x.vehicle_id LEFT JOIN users u ON u.id = x.executado_por
     WHERE x.id = $1`,
    [id]
  );
  if (!ex.rows[0]) return null;
  const resp = await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id]);
  const fotos = await c.query(`SELECT id, item_id, mime, tamanho FROM checklist_fotos WHERE execucao_id = $1 ORDER BY created_at`, [id]);
  return { ...ex.rows[0], respostas: resp.rows, fotos: fotos.rows };
}

checklistsProprioRouter.get("/:id", LEITURA, h(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "ID inválido." });
  const out = await withRole(req.auth!.role, req.auth!.sub, (c) => carregar(c, req.params.id as string));
  if (!out) return res.status(404).json({ error: "Checklist não encontrado." });
  res.json(out);
}));

const criarSchema = z.object({ vehicle_id: z.string().uuid(), km: z.coerce.number().min(0).max(5_000_000).optional() });

checklistsProprioRouter.post("/", ESCRITA, h(async (req, res) => {
  const p = criarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Dados inválidos." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const v = await c.query(`SELECT id, base, status FROM vehicles WHERE id = $1`, [p.data.vehicle_id]);
    const veic = v.rows[0];
    if (!veic) return { erro: 404, msg: "Veículo não encontrado." };
    if (!bases().includes(veic.base)) return { erro: 400, msg: "Veículo fora das bases do escopo." };
    if (veic.status === "Desmobilizado") return { erro: 400, msg: "Veículo desmobilizado não recebe checklist." };
    const existente = await c.query(
      `SELECT id, status FROM checklist_execucoes WHERE vehicle_id = $1 AND data_ref = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [veic.id]
    );
    if (existente.rows[0]) return { erro: 409, msg: "Já existe checklist deste veículo hoje.", existente_id: existente.rows[0].id };
    const ins = await c.query(
      `INSERT INTO checklist_execucoes (vehicle_id, base, executado_por, km) VALUES ($1, $2, $3, $4) RETURNING id`,
      [veic.id, veic.base, req.auth!.sub, p.data.km ?? null]
    );
    return { id: ins.rows[0].id as string };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg, existente_id: (out as any).existente_id });
  res.status(201).json({ id: out.id });
}));

const salvarSchema = z.object({
  km: z.coerce.number().min(0).max(5_000_000).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  respostas: z.array(z.object({
    item_id: z.string().uuid(),
    resultado: z.enum(["OK", "FALHA", "NA"]),
    observacao: z.string().max(1000).nullable().optional(),
  })).max(200),
});

async function salvar(c: PoolClient, id: string, d: z.infer<typeof salvarSchema>) {
  await c.query(`UPDATE checklist_execucoes SET km = coalesce($2, km), observacoes = $3 WHERE id = $1`, [id, d.km ?? null, d.observacoes ?? null]);
  for (const r of d.respostas) {
    await c.query(
      `INSERT INTO checklist_respostas (execucao_id, item_id, resultado, observacao) VALUES ($1,$2,$3,$4)
       ON CONFLICT (execucao_id, item_id) DO UPDATE SET resultado = EXCLUDED.resultado, observacao = EXCLUDED.observacao`,
      [id, r.item_id, r.resultado, r.observacao?.trim() || null]
    );
  }
}

async function statusDe(c: PoolClient, id: string) {
  const r = await c.query(`SELECT status FROM checklist_execucoes WHERE id = $1`, [id]);
  return (r.rows[0]?.status as string | undefined) ?? null;
}

checklistsProprioRouter.put("/:id", ESCRITA, h(async (req, res) => {
  const id = req.params.id as string;
  const p = salvarSchema.safeParse(req.body);
  if (!z.string().uuid().safeParse(id).success || !p.success) return res.status(400).json({ error: "Dados inválidos." });
  const st = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const s = await statusDe(c, id);
    if (s === "Rascunho") await salvar(c, id, p.data);
    return s;
  });
  if (!st) return res.status(404).json({ error: "Checklist não encontrado." });
  if (st !== "Rascunho") return res.status(409).json({ error: "Checklist concluído não pode ser alterado." });
  res.json({ ok: true });
}));

// Conclui: valida tudo, grava imutável e, se houver falha CRÍTICA, abre ocorrência.
checklistsProprioRouter.post("/:id/concluir", ESCRITA, h(async (req, res) => {
  const id = req.params.id as string;
  const p = salvarSchema.safeParse(req.body);
  if (!z.string().uuid().safeParse(id).success || !p.success) return res.status(400).json({ error: "Dados inválidos." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const s = await statusDe(c, id);
    if (!s) return { erro: 404, msg: "Checklist não encontrado." };
    if (s !== "Rascunho") return { erro: 409, msg: "Checklist já concluído." };
    await salvar(c, id, p.data);

    const itens = (await c.query(`SELECT id, texto, critico FROM checklist_itens WHERE ativo`)).rows;
    const resp = new Map((await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id])).rows.map((r) => [r.item_id, r]));
    const faltando = itens.filter((i) => !resp.has(i.id));
    if (faltando.length) return { erro: 400, msg: `Faltam ${faltando.length} item(ns) sem resposta.` };
    const semObs = itens.filter((i) => resp.get(i.id).resultado === "FALHA" && (resp.get(i.id).observacao ?? "").trim().length < 5);
    if (semObs.length) return { erro: 400, msg: `Descreva a falha (mín. 5 caracteres) em: ${semObs.map((i) => i.texto).join("; ")}.` };

    const ex = (await c.query(`SELECT vehicle_id, km, data_hora FROM checklist_execucoes WHERE id = $1`, [id])).rows[0];
    if (ex.km == null) return { erro: 400, msg: "Informe a quilometragem." };
    const ant = await c.query(`SELECT max(km) AS km FROM checklist_execucoes WHERE vehicle_id = $1 AND status = 'Concluido'`, [ex.vehicle_id]);
    if (ant.rows[0].km != null && Number(ex.km) < Number(ant.rows[0].km))
      return { erro: 400, msg: `Quilometragem menor que a do último checklist (${Number(ant.rows[0].km)} km).` };

    const falhas = itens.filter((i) => resp.get(i.id).resultado === "FALHA");
    const criticas = falhas.filter((i) => i.critico);
    let ocorrenciaId: string | null = null;
    if (criticas.length) {
      const desc = `Checklist de ${new Date(ex.data_hora).toLocaleDateString("pt-BR")} — falha(s) crítica(s): ` +
        criticas.map((i) => `${i.texto} (${(resp.get(i.id).observacao ?? "").trim()})`).join("; ");
      const oc = await c.query(
        `INSERT INTO occurrences (vehicle_id, tipo, descricao, anexos) VALUES ($1, 'manutencao_solicitada', $2, $3) RETURNING id`,
        [ex.vehicle_id, desc.slice(0, 2000), JSON.stringify([{ origem: "checklist", execucao_id: id }])]
      );
      ocorrenciaId = oc.rows[0].id;
    }
    await c.query(
      `UPDATE checklist_execucoes SET status = 'Concluido', num_falhas = $2, ocorrencia_id = $3, concluido_em = now(), data_hora = now() WHERE id = $1`,
      [id, falhas.length, ocorrenciaId]
    );
    await registrarAuditoria(c, req.auth!.sub, "checklist_concluido", "checklist_execucoes", id, { falhas: falhas.length, criticas: criticas.length, ocorrencia_id: ocorrenciaId });
    return { ok: true, num_falhas: falhas.length, ocorrencia_id: ocorrenciaId };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg });
  res.json(out);
}));

// Fotos: o arquivo é escolhido no aparelho, reduzido no navegador e enviado cru (image/*).
const corpoImagem = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" });

checklistsProprioRouter.post("/:id/fotos", ESCRITA, corpoImagem, h(async (req, res) => {
  const id = req.params.id as string;
  const mime = (req.headers["content-type"] ?? "").split(";")[0];
  const itemId = typeof req.query.item_id === "string" ? req.query.item_id : null;
  if (!z.string().uuid().safeParse(id).success || (itemId && !z.string().uuid().safeParse(itemId).success))
    return res.status(400).json({ error: "Dados inválidos." });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Envie uma imagem JPEG, PNG ou WebP." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const s = await statusDe(c, id);
    if (!s) return { erro: 404, msg: "Checklist não encontrado." };
    if (s !== "Rascunho") return { erro: 409, msg: "Checklist concluído não aceita novas fotos." };
    const n = await c.query(`SELECT count(*)::int AS n FROM checklist_fotos WHERE execucao_id = $1`, [id]);
    if (n.rows[0].n >= 40) return { erro: 400, msg: "Limite de 40 fotos por checklist." };
    const r = await c.query(
      `INSERT INTO checklist_fotos (execucao_id, item_id, mime, tamanho, dados, enviado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [id, itemId, mime, req.body.length, req.body, req.auth!.sub]
    );
    return { id: r.rows[0].id as string };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg });
  res.status(201).json({ id: out.id });
}));

checklistsProprioRouter.get("/fotos/:fotoId", LEITURA, h(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.fotoId).success) return res.status(400).json({ error: "ID inválido." });
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT mime, dados FROM checklist_fotos WHERE id = $1`, [req.params.fotoId])
  );
  if (!r.rows[0]) return res.status(404).json({ error: "Foto não encontrada." });
  res.setHeader("Content-Type", r.rows[0].mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(r.rows[0].dados);
}));

checklistsProprioRouter.delete("/fotos/:fotoId", ESCRITA, h(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.fotoId).success) return res.status(400).json({ error: "ID inválido." });
  const ok = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const r = await c.query(
      `DELETE FROM checklist_fotos f USING checklist_execucoes x
       WHERE f.id = $1 AND x.id = f.execucao_id AND x.status = 'Rascunho' RETURNING f.id`,
      [req.params.fotoId]
    );
    return r.rowCount === 1;
  });
  if (!ok) return res.status(404).json({ error: "Foto não encontrada ou checklist já concluído." });
  res.json({ ok: true });
}));
