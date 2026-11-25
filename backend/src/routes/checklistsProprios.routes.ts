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
              u.ultimo_proprio, u.ultimo_km, u.km_pos_ref,
              kr.km AS km_ref, kr.definido_em AS km_ref_em, vv2.km AS km_vec, vv2.sincronizado_em AS km_vec_em,
              (SELECT max(e.data_hora) FROM checklist_events e WHERE e.placa = v.placa) AS ultimo_vec,
              (SELECT vv.estado FROM vec_veiculos vv WHERE vv.placa = v.placa) AS estado_vec,
              (u.ultimo_proprio IS NULL OR u.ultimo_proprio < now() - ($2 || ' days')::interval) AS vencido,
              (SELECT x.id FROM checklist_execucoes x WHERE x.vehicle_id = v.id AND x.status = 'Rascunho'
                 ORDER BY x.data_hora DESC LIMIT 1) AS rascunho_id
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT max(x.data_hora) AS ultimo_proprio, max(x.km) AS ultimo_km,
                max(x.km) FILTER (WHERE kr0.definido_em IS NULL OR coalesce(x.concluido_em, x.data_hora) > kr0.definido_em) AS km_pos_ref
         FROM checklist_execucoes x
         LEFT JOIN veiculo_km_referencia kr0 ON kr0.vehicle_id = x.vehicle_id
         WHERE x.vehicle_id = v.id AND x.status = 'Concluido'
       ) u ON true
       LEFT JOIN veiculo_km_referencia kr ON kr.vehicle_id = v.id
       LEFT JOIN vec_veiculos vv2 ON vv2.placa = v.placa
       WHERE v.base = ANY($1) AND v.status <> 'Desmobilizado'
       ORDER BY v.base, v.placa`,
      [bases(), String(DIAS_VENCIMENTO)]
    )
  );
  res.json(r.rows.map((x) => {
    const cand: { valor: number; fonte: KmFonte }[] = [];
    if (x.km_ref != null) cand.push({ valor: Number(x.km_ref), fonte: "referencia" });
    if (x.km_pos_ref != null) cand.push({ valor: Number(x.km_pos_ref), fonte: "checklist" });
    if (x.km_ref == null && x.km_vec != null) cand.push({ valor: Number(x.km_vec), fonte: "vec" });
    const m = cand.length ? cand.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
    const { km_pos_ref, km_ref, km_ref_em, km_vec, km_vec_em, ...resto } = x;
    return { ...resto, km_minimo: m?.valor ?? null, km_fonte: m?.fonte ?? null, km_ref: km_ref != null ? Number(km_ref) : null, km_vec: km_vec != null ? Number(km_vec) : null };
  }));
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
      `SELECT x.id, v.placa, x.base, x.data_hora, x.km, x.status, x.num_falhas, x.ocorrencia_id, x.km_corrigido_em,
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
            x.ocorrencia_id, x.edicoes, x.executado_por, x.km_original, x.km_observacao, x.km_corrigido_em, coalesce(u.full_name, u.email) AS executor
     FROM checklist_execucoes x JOIN vehicles v ON v.id = x.vehicle_id LEFT JOIN users u ON u.id = x.executado_por
     WHERE x.id = $1`,
    [id]
  );
  if (!ex.rows[0]) return null;
  const resp = await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id]);
  const fotos = await c.query(`SELECT id, item_id, tipo, mime, tamanho FROM checklist_fotos WHERE execucao_id = $1 ORDER BY created_at`, [id]);
  const kmInfo = await kmMinimoInfo(c, ex.rows[0].vehicle_id, id);
  const hist = await c.query(
    `SELECT e.numero, e.motivo, e.observacoes, e.editado_em, coalesce(u.full_name, u.email) AS editado_por, e.antes, e.depois
       FROM checklist_edicoes e LEFT JOIN users u ON u.id = e.editado_por WHERE e.execucao_id = $1 ORDER BY e.numero`, [id]);
  return { ...ex.rows[0], historico_edicoes: hist.rows, edicoes_restantes: 3 - Number(ex.rows[0].edicoes ?? 0), km_minimo: kmInfo?.valor ?? null, km_fonte: kmInfo?.fonte ?? null, km_fonte_data: kmInfo?.data ?? null, respostas: resp.rows, fotos: fotos.rows };
}

checklistsProprioRouter.get("/:id", LEITURA, h(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "ID inválido." });
  const out = await withRole(req.auth!.role, req.auth!.sub, (c) => carregar(c, req.params.id as string));
  if (!out) return res.status(404).json({ error: "Checklist não encontrado." });
  res.json(out);
}));

// Piso de quilometragem do veículo. Fontes, da mais forte para a mais fraca:
//  1) km de referência definido por admin (vale sobre VEC e checklists anteriores a ele);
//  2) maior km de checklist próprio concluído; 3) km da VEC (só leitura).
// Sem referência, vale o maior entre checklist e VEC.
type KmFonte = "referencia" | "checklist" | "vec";
interface KmInfo { valor: number; fonte: KmFonte; data: string | null }

async function kmMinimoInfo(c: PoolClient, vehicleId: string, excluirId?: string): Promise<KmInfo | null> {
  const ref = (await c.query(`SELECT km, definido_em FROM veiculo_km_referencia WHERE vehicle_id = $1`, [vehicleId])).rows[0];
  const chk = (await c.query(
    `SELECT km, coalesce(concluido_em, data_hora) AS em FROM checklist_execucoes
      WHERE vehicle_id = $1 AND status = 'Concluido' AND km IS NOT NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)
        AND ($3::timestamptz IS NULL OR coalesce(concluido_em, data_hora) > $3::timestamptz)
      ORDER BY km DESC LIMIT 1`,
    [vehicleId, excluirId ?? null, ref?.definido_em ?? null]
  )).rows[0];
  const cand: KmInfo[] = [];
  if (ref) cand.push({ valor: Number(ref.km), fonte: "referencia", data: ref.definido_em });
  if (chk) cand.push({ valor: Number(chk.km), fonte: "checklist", data: chk.em });
  if (!ref) {
    const vec = (await c.query(
      `SELECT vv.km, vv.sincronizado_em FROM vec_veiculos vv JOIN vehicles v ON v.placa = vv.placa
        WHERE v.id = $1 AND vv.km IS NOT NULL`, [vehicleId]
    )).rows[0];
    if (vec) cand.push({ valor: Number(vec.km), fonte: "vec", data: vec.sincronizado_em });
  }
  if (!cand.length) return null;
  return cand.reduce((a, b) => (b.valor > a.valor ? b : a));
}

const NOME_FONTE: Record<KmFonte, string> = { referencia: "km de referência definido pelo admin", checklist: "último checklist", vec: "VEC" };
const msgKm = (i: KmInfo) =>
  `Quilometragem menor que a já registrada (${i.valor.toLocaleString("pt-BR")} km — fonte: ${NOME_FONTE[i.fonte]}` +
  `${i.data ? ` em ${new Date(i.data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}). ` +
  `Confira o odômetro. Se o valor registrado estiver errado, peça a um admin para corrigir.`;

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
    if (p.data.km != null) {
      const min = await kmMinimoInfo(c, veic.id);
      if (min && p.data.km < min.valor) return { erro: 400, msg: msgKm(min) };
    }
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

async function salvar(c: PoolClient, id: string, d: z.infer<typeof salvarSchema>): Promise<string | null> {
  if (d.km != null) {
    const v = await c.query(`SELECT vehicle_id FROM checklist_execucoes WHERE id = $1`, [id]);
    const min = await kmMinimoInfo(c, v.rows[0].vehicle_id, id);
    if (min && d.km < min.valor) return msgKm(min);
  }
  await c.query(`UPDATE checklist_execucoes SET km = coalesce($2, km), observacoes = $3 WHERE id = $1`, [id, d.km ?? null, d.observacoes ?? null]);
  for (const r of d.respostas) {
    await c.query(
      `INSERT INTO checklist_respostas (execucao_id, item_id, resultado, observacao) VALUES ($1,$2,$3,$4)
       ON CONFLICT (execucao_id, item_id) DO UPDATE SET resultado = EXCLUDED.resultado, observacao = EXCLUDED.observacao`,
      [id, r.item_id, r.resultado, r.observacao?.trim() || null]
    );
  }
  return null;
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
    if (s === "Rascunho") {
      const e = await salvar(c, id, p.data);
      if (e) return "ERRO:" + e;
    }
    return s;
  });
  if (!st) return res.status(404).json({ error: "Checklist não encontrado." });
  if (st.startsWith("ERRO:")) return res.status(400).json({ error: st.slice(5) });
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
    const eSalvar = await salvar(c, id, p.data);
    if (eSalvar) return { erro: 400, msg: eSalvar };

    const itens = (await c.query(`SELECT id, texto, critico FROM checklist_itens WHERE ativo`)).rows;
    const resp = new Map((await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id])).rows.map((r) => [r.item_id, r]));
    const faltando = itens.filter((i) => !resp.has(i.id));
    if (faltando.length) return { erro: 400, msg: `Faltam ${faltando.length} item(ns) sem resposta.` };
    const semObs = itens.filter((i) => resp.get(i.id).resultado === "FALHA" && (resp.get(i.id).observacao ?? "").trim().length < 5);
    if (semObs.length) return { erro: 400, msg: `Descreva a falha (mín. 5 caracteres) em: ${semObs.map((i) => i.texto).join("; ")}.` };

    const ex = (await c.query(`SELECT vehicle_id, km, data_hora FROM checklist_execucoes WHERE id = $1`, [id])).rows[0];
    if (ex.km == null) return { erro: 400, msg: "Informe a quilometragem." };
    const min = await kmMinimoInfo(c, ex.vehicle_id, id);
    if (min && Number(ex.km) < min.valor) return { erro: 400, msg: msgKm(min) };
    const odo = await c.query(`SELECT count(*)::int AS n FROM checklist_fotos WHERE execucao_id = $1 AND tipo = 'odometro'`, [id]);
    if (odo.rows[0].n < 1) return { erro: 400, msg: "Anexe a foto do odômetro (painel mostrando a quilometragem) para concluir." };

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

// ===== Quilometragem: detalhe e correções (somente admin / superadmin) =====
const ADMIN = requireRole("superadmin", "admin");
const uuid = z.string().uuid();
const refSchema = z.object({ km: z.coerce.number().min(0).max(5_000_000), observacao: z.string().trim().min(10, "Descreva o motivo (mín. 10 caracteres).").max(1000) });
const corrSchema = refSchema;

checklistsProprioRouter.get("/veiculos/:vid/km", LEITURA, h(async (req, res) => {
  const vid = req.params.vid as string;
  if (!uuid.safeParse(vid).success) return res.status(400).json({ error: "ID inválido." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const v = await c.query(`SELECT id, placa FROM vehicles WHERE id = $1`, [vid]);
    if (!v.rows[0]) return null;
    const info = await kmMinimoInfo(c, vid);
    const ref = (await c.query(
      `SELECT r.km, r.observacao, r.definido_em, u.full_name AS definido_por FROM veiculo_km_referencia r LEFT JOIN users u ON u.id = r.definido_por WHERE r.vehicle_id = $1`, [vid])).rows[0] ?? null;
    const ult = (await c.query(
      `SELECT id, km, coalesce(concluido_em, data_hora) AS em, km_original, km_observacao FROM checklist_execucoes
        WHERE vehicle_id = $1 AND status = 'Concluido' AND km IS NOT NULL ORDER BY coalesce(concluido_em, data_hora) DESC LIMIT 1`, [vid])).rows[0] ?? null;
    const vec = (await c.query(`SELECT km, sincronizado_em FROM vec_veiculos WHERE placa = $1`, [v.rows[0].placa])).rows[0] ?? null;
    return { placa: v.rows[0].placa, minimo: info, referencia: ref, ultimo_checklist: ult, vec };
  });
  if (!out) return res.status(404).json({ error: "Veículo não encontrado." });
  res.json(out);
}));

checklistsProprioRouter.put("/veiculos/:vid/km-referencia", ADMIN, h(async (req, res) => {
  const vid = req.params.vid as string;
  const p = refSchema.safeParse(req.body);
  if (!uuid.safeParse(vid).success) return res.status(400).json({ error: "ID inválido." });
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  const ok = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const v = await c.query(`SELECT id FROM vehicles WHERE id = $1`, [vid]);
    if (!v.rows[0]) return false;
    const antes = (await c.query(`SELECT km FROM veiculo_km_referencia WHERE vehicle_id = $1`, [vid])).rows[0];
    await c.query(
      `INSERT INTO veiculo_km_referencia (vehicle_id, km, observacao, definido_por, definido_em) VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (vehicle_id) DO UPDATE SET km = EXCLUDED.km, observacao = EXCLUDED.observacao, definido_por = EXCLUDED.definido_por, definido_em = now()`,
      [vid, p.data.km, p.data.observacao, req.auth!.sub]
    );
    await registrarAuditoria(c, req.auth!.sub, "km_referencia_definido", "vehicles", vid, { km_anterior: antes ? Number(antes.km) : null, km_novo: p.data.km, observacao: p.data.observacao });
    return true;
  });
  if (!ok) return res.status(404).json({ error: "Veículo não encontrado." });
  res.json({ ok: true });
}));

checklistsProprioRouter.delete("/veiculos/:vid/km-referencia", ADMIN, h(async (req, res) => {
  const vid = req.params.vid as string;
  const obs = z.string().trim().min(5).max(1000).safeParse(req.body?.observacao);
  if (!uuid.safeParse(vid).success) return res.status(400).json({ error: "ID inválido." });
  if (!obs.success) return res.status(400).json({ error: "Informe o motivo da remoção (mín. 5 caracteres)." });
  await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const antes = (await c.query(`DELETE FROM veiculo_km_referencia WHERE vehicle_id = $1 RETURNING km`, [vid])).rows[0];
    await registrarAuditoria(c, req.auth!.sub, "km_referencia_removido", "vehicles", vid, { km_removido: antes ? Number(antes.km) : null, observacao: obs.data });
  });
  res.json({ ok: true });
}));

// Corrige o km de um checklist JÁ concluído (o valor original fica guardado).
checklistsProprioRouter.put("/:id/km-corrigir", ADMIN, h(async (req, res) => {
  const id = req.params.id as string;
  const p = corrSchema.safeParse(req.body);
  if (!uuid.safeParse(id).success) return res.status(400).json({ error: "ID inválido." });
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const ex = (await c.query(`SELECT status, km, km_original FROM checklist_execucoes WHERE id = $1`, [id])).rows[0];
    if (!ex) return { erro: 404, msg: "Checklist não encontrado." };
    if (ex.status !== "Concluido") return { erro: 409, msg: "Só checklists concluídos precisam de correção; rascunhos podem ser editados direto." };
    await c.query(
      `UPDATE checklist_execucoes SET km_original = coalesce(km_original, km), km = $2, km_corrigido_por = $3, km_corrigido_em = now(), km_observacao = $4 WHERE id = $1`,
      [id, p.data.km, req.auth!.sub, p.data.observacao]
    );
    await registrarAuditoria(c, req.auth!.sub, "km_checklist_corrigido", "checklist_execucoes", id, { km_anterior: ex.km != null ? Number(ex.km) : null, km_novo: p.data.km, observacao: p.data.observacao });
    return { ok: true };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg });
  res.json(out);
}));

// ===== Edição de checklist concluído: máx. 3 vezes, cada uma com motivo e observações =====
const MAX_EDICOES = 3;
const editarSchema = salvarSchema.extend({
  motivo: z.string().trim().min(10, "Descreva o motivo da edição (mín. 10 caracteres).").max(1000),
  observacoes_edicao: z.string().trim().min(5, "Preencha as observações da edição (mín. 5 caracteres).").max(2000),
});

checklistsProprioRouter.post("/:id/editar", ESCRITA, h(async (req, res) => {
  const id = req.params.id as string;
  if (!uuid.safeParse(id).success) return res.status(400).json({ error: "ID inválido." });
  const p = editarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const ex = (await c.query(`SELECT * FROM checklist_execucoes WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!ex) return { erro: 404, msg: "Checklist não encontrado." };
    if (ex.status !== "Concluido") return { erro: 409, msg: "Este checklist ainda é rascunho: edite e conclua normalmente." };
    const ehAdmin = ["superadmin", "admin"].includes(req.auth!.role);
    if (!ehAdmin && ex.executado_por !== req.auth!.sub) return { erro: 403, msg: "Só quem executou a inspeção (ou um admin) pode editá-la." };
    if (Number(ex.edicoes) >= MAX_EDICOES) return { erro: 409, msg: `Limite de ${MAX_EDICOES} edições atingido para esta inspeção.` };

    const itens = (await c.query(`SELECT id, texto, critico FROM checklist_itens WHERE ativo`)).rows;
    const ids = new Set(itens.map((i) => i.id));
    if (p.data.respostas.some((r) => !ids.has(r.item_id))) return { erro: 400, msg: "Há item inexistente ou inativo na lista." };
    const antesResp = (await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id])).rows;
    const antes = { km: ex.km != null ? Number(ex.km) : null, observacoes: ex.observacoes, num_falhas: ex.num_falhas, respostas: antesResp };

    // valida o resultado final (respostas enviadas sobrepõem as existentes)
    const final = new Map<string, { resultado: string; observacao: string | null }>(antesResp.map((r) => [r.item_id, r]));
    for (const r of p.data.respostas) final.set(r.item_id, { resultado: r.resultado, observacao: r.observacao?.trim() || null });
    const faltando = itens.filter((i) => !final.has(i.id));
    if (faltando.length) return { erro: 400, msg: `Faltam ${faltando.length} item(ns) sem resposta.` };
    const semObs = itens.filter((i) => final.get(i.id)!.resultado === "FALHA" && (final.get(i.id)!.observacao ?? "").length < 5);
    if (semObs.length) return { erro: 400, msg: `Descreva a falha (mín. 5 caracteres) em: ${semObs.map((i) => i.texto).join("; ")}.` };
    const novoKm = p.data.km ?? (ex.km != null ? Number(ex.km) : null);
    if (novoKm == null) return { erro: 400, msg: "Informe a quilometragem." };
    if (p.data.km != null && Number(p.data.km) !== Number(ex.km)) {
      const min = await kmMinimoInfo(c, ex.vehicle_id, id);
      if (min && p.data.km < min.valor) return { erro: 400, msg: msgKm(min) };
    }
    const mudou = p.data.respostas.some((r) => {
      const a = antesResp.find((x) => x.item_id === r.item_id);
      return !a || a.resultado !== r.resultado || (a.observacao ?? "") !== (r.observacao?.trim() ?? "");
    }) || novoKm !== (ex.km != null ? Number(ex.km) : null) || (p.data.observacoes ?? null) !== (ex.observacoes ?? null);
    if (!mudou) return { erro: 400, msg: "Nenhuma alteração foi feita. Altere algum campo antes de salvar a edição." };

    for (const r of p.data.respostas) {
      await c.query(
        `INSERT INTO checklist_respostas (execucao_id, item_id, resultado, observacao) VALUES ($1,$2,$3,$4)
         ON CONFLICT (execucao_id, item_id) DO UPDATE SET resultado = EXCLUDED.resultado, observacao = EXCLUDED.observacao`,
        [id, r.item_id, r.resultado, r.observacao?.trim() || null]
      );
    }
    const falhas = itens.filter((i) => final.get(i.id)!.resultado === "FALHA");
    const criticas = falhas.filter((i) => i.critico);
    let ocorrenciaId: string | null = ex.ocorrencia_id;
    if (criticas.length) {
      const desc = `Checklist de ${new Date(ex.data_hora).toLocaleDateString("pt-BR")} (editado) — falha(s) crítica(s): ` +
        criticas.map((i) => `${i.texto} (${(final.get(i.id)!.observacao ?? "").trim()})`).join("; ");
      if (ocorrenciaId) await c.query(`UPDATE occurrences SET descricao = $2 WHERE id = $1`, [ocorrenciaId, desc.slice(0, 2000)]);
      else {
        const oc = await c.query(
          `INSERT INTO occurrences (vehicle_id, tipo, descricao, anexos) VALUES ($1, 'manutencao_solicitada', $2, $3) RETURNING id`,
          [ex.vehicle_id, desc.slice(0, 2000), JSON.stringify([{ origem: "checklist", execucao_id: id }])]
        );
        ocorrenciaId = oc.rows[0].id;
      }
    }
    const numero = Number(ex.edicoes) + 1;
    const depoisResp = (await c.query(`SELECT item_id, resultado, observacao FROM checklist_respostas WHERE execucao_id = $1`, [id])).rows;
    const depois = { km: novoKm, observacoes: p.data.observacoes ?? null, num_falhas: falhas.length, respostas: depoisResp };
    await c.query(
      `UPDATE checklist_execucoes SET km = $2, observacoes = $3, num_falhas = $4, ocorrencia_id = $5, edicoes = $6 WHERE id = $1`,
      [id, novoKm, p.data.observacoes ?? null, falhas.length, ocorrenciaId, numero]
    );
    await c.query(
      `INSERT INTO checklist_edicoes (execucao_id, numero, motivo, observacoes, editado_por, antes, depois) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, numero, p.data.motivo, p.data.observacoes_edicao, req.auth!.sub, JSON.stringify(antes), JSON.stringify(depois)]
    );
    await registrarAuditoria(c, req.auth!.sub, "checklist_editado", "checklist_execucoes", id, { numero, motivo: p.data.motivo, observacoes: p.data.observacoes_edicao, falhas_antes: antes.num_falhas, falhas_depois: falhas.length });
    return { ok: true, numero, restantes: MAX_EDICOES - numero, num_falhas: falhas.length, ocorrencia_id: ocorrenciaId };
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
  const tipo = req.query.tipo === "odometro" ? "odometro" : itemId ? "item" : "geral";
  if (tipo === "odometro" && itemId) return res.status(400).json({ error: "Dados inválidos." });
  if (!z.string().uuid().safeParse(id).success || (itemId && !z.string().uuid().safeParse(itemId).success))
    return res.status(400).json({ error: "Dados inválidos." });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Envie uma imagem JPEG, PNG ou WebP." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const s = await statusDe(c, id);
    if (!s) return { erro: 404, msg: "Checklist não encontrado." };
    if (s !== "Rascunho") return { erro: 409, msg: "Checklist concluído não aceita novas fotos." };
    if (tipo === "odometro") await c.query(`DELETE FROM checklist_fotos WHERE execucao_id = $1 AND tipo = 'odometro'`, [id]); // mantém só a mais recente
    const n = await c.query(`SELECT count(*)::int AS n FROM checklist_fotos WHERE execucao_id = $1`, [id]);
    if (n.rows[0].n >= 40) return { erro: 400, msg: "Limite de 40 fotos por checklist." };
    const r = await c.query(
      `INSERT INTO checklist_fotos (execucao_id, item_id, tipo, mime, tamanho, dados, enviado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id, itemId, tipo, mime, req.body.length, req.body, req.auth!.sub]
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
