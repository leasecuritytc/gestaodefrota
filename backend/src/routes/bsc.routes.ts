import { Router } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../env";
import { withRole } from "../db";
import { autorParaPdf, pdfBsc } from "../exportPdf";
import { requireAuth, requireRole } from "../middleware/auth";
import { aplicarEscopo, normPlaca, refinarTabela, repararDeep } from "../bscEscopo";

export const bscRouter = Router();

function tokenValido(recebido: string | undefined): boolean {
  const esperado = env.bsc.ingestToken;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ingestSchema = z.object({
  pagina: z.string().min(1).max(80),
  linhas: z.array(z.string().max(2000)).max(5000),
  tabelas: z.array(z.array(z.array(z.string().max(500)).max(60)).max(2000)).max(40).default([]),
  numeros: z.array(z.object({ rotulo: z.string().max(200), valor: z.string().max(60) })).max(2000).default([]),
});

// Placas dos veículos das bases do escopo (plataforma + VEC, que já vem filtrada).
async function placasDoEscopo(): Promise<Set<string>> {
  const r = await withRole("superadmin", "", (c) =>
    c.query(`SELECT placa FROM vehicles WHERE base = ANY($1) UNION SELECT placa FROM vec_veiculos`, [env.vec.bases])
  );
  return new Set(r.rows.map((x) => normPlaca(x.placa)));
}

// Placas para o coletor filtrar tabelas por placa (autentica por token, como a ingestão).
bscRouter.get("/placas", async (req, res) => {
  if (!tokenValido(req.header("x-ingest-token"))) return res.status(401).json({ error: "Token inválido." });
  try {
    res.json({ bases: env.vec.bases, placas: [...(await placasDoEscopo())] });
  } catch (err: any) {
    console.error("BSC placas falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao ler as placas." });
  }
});

// Ingestão: chamada pelo coletor (sem login de usuário; autentica por token).
bscRouter.post("/ingest", async (req, res) => {
  if (!env.bsc.ingestToken) return res.status(503).json({ error: "Ingestão do BSC não configurada no servidor." });
  if (!tokenValido(req.header("x-ingest-token"))) return res.status(401).json({ error: "Token inválido." });
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido.", detalhes: parsed.error.flatten() });
  const { pagina } = parsed.data;
  try {
    // Escopo: só as bases vinculadas. O que é de outras bases nem chega a ser gravado.
    const { linhas, tabelas, numeros } = aplicarEscopo(repararDeep(parsed.data), await placasDoEscopo());
    const hash = createHash("sha256").update(JSON.stringify([linhas, tabelas])).digest("hex");
    const r = await withRole("superadmin", "", (c) =>
      c.query(
        `INSERT INTO bsc_snapshots (pagina, linhas, tabelas, numeros, hash)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (pagina, hash) DO NOTHING RETURNING id`,
        [pagina, JSON.stringify(linhas), JSON.stringify(tabelas), JSON.stringify(numeros), hash]
      )
    );
    res.json({ ok: true, novo: r.rowCount === 1 });
  } catch (err: any) {
    console.error("BSC ingest falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao gravar o retrato do BSC." });
  }
});

// Leitura: só superadmin/admin.
bscRouter.get("/", requireAuth, requireRole("superadmin", "admin"), async (req, res) => {
  try {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT DISTINCT ON (pagina) id, pagina, coletado_em, linhas, tabelas, numeros
       FROM bsc_snapshots ORDER BY pagina, coletado_em DESC`
    )
  );
  // Retratos antigos (gravados antes do escopo) também passam pelo filtro.
  const placas = await placasDoEscopo();
  const paginas = rows.rows
    .map((p) => ({ ...p, ...aplicarEscopo(repararDeep({ linhas: p.linhas, tabelas: p.tabelas, numeros: p.numeros }), placas) }))
    .filter((p) => p.tabelas.length > 0);
  res.json({ configurado: Boolean(env.bsc.ingestToken), bases: env.vec.bases, paginas });
  } catch (err: any) {
    console.error("BSC leitura falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao ler os dados do BSC." });
  }
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pesquisaSchema = z.object({
  de: z.string().regex(ISO).optional(),
  ate: z.string().regex(ISO).optional(),
  pagina: z.string().max(80).optional(),
  placa: z.string().max(10).optional(),
  base: z.string().max(10).optional(),
});
type Pesquisa = z.infer<typeof pesquisaSchema>;

// Pesquisa os retratos do BSC: o mais recente de cada página dentro do período,
// já no escopo das bases e refinado por página, placa e base.
async function pesquisarBsc(role: string, userId: string, f: Pesquisa) {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.de) { args.push(f.de); cond.push(`(coletado_em AT TIME ZONE 'America/Sao_Paulo')::date >= $${args.length}::date`); }
  if (f.ate) { args.push(f.ate); cond.push(`(coletado_em AT TIME ZONE 'America/Sao_Paulo')::date <= $${args.length}::date`); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = await withRole(role as any, userId, async (c) => ({
    snaps: (await c.query(`SELECT DISTINCT ON (pagina) id, pagina, coletado_em, linhas, tabelas, numeros FROM bsc_snapshots ${where} ORDER BY pagina, coletado_em DESC`, args)).rows,
    todas: (await c.query(`SELECT DISTINCT pagina FROM bsc_snapshots ORDER BY pagina`)).rows.map((r: any) => r.pagina as string),
  }));
  const placasEscopo = await placasDoEscopo();
  let refino: Set<string> | undefined;
  if (f.placa) refino = new Set([normPlaca(f.placa)]);
  if (f.base) {
    const r = await withRole("superadmin", "", (c) => c.query(`SELECT placa FROM vehicles WHERE upper(base) = upper($1)`, [f.base]));
    const daBase = new Set(r.rows.map((x: any) => normPlaca(x.placa)));
    refino = refino ? new Set([...refino].filter((p) => daBase.has(p))) : daBase;
  }
  const refinar = Boolean(f.placa || f.base);
  const paginas = rows.snaps
    .filter((p: any) => !f.pagina || p.pagina === f.pagina)
    .map((p: any) => {
      const r = aplicarEscopo(repararDeep({ linhas: p.linhas, tabelas: p.tabelas, numeros: p.numeros }), placasEscopo);
      if (!refinar) return { id: p.id, pagina: p.pagina, coletado_em: p.coletado_em, ...r };
      const tabelas = r.tabelas.map((t) => refinarTabela(t, { placas: refino, base: f.placa ? undefined : f.base })).filter((t): t is string[][] => !!t && t.length > 1);
      return { id: p.id, pagina: p.pagina, coletado_em: p.coletado_em, linhas: r.linhas.filter((l) => /^(Atualização|Coletado)/.test(l)), tabelas, numeros: [] as { rotulo: string; valor: string }[] };
    })
    .filter((p: any) => p.tabelas.length > 0 || p.numeros.length > 0);
  return { paginas, todasPaginas: rows.todas };
}

// Pesquisa (tela): sem datas, devolve o último retrato de cada página.
bscRouter.get("/pesquisa", requireAuth, requireRole("superadmin", "admin"), async (req, res) => {
  const p = pesquisaSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtros inválidos." });
  if (p.data.de && p.data.ate && p.data.de > p.data.ate) return res.status(400).json({ error: "A data inicial não pode ser depois da final." });
  try {
    const r = await pesquisarBsc(req.auth!.role, req.auth!.sub, p.data);
    res.json({ configurado: Boolean(env.bsc.ingestToken), bases: env.vec.bases, paginas: r.paginas, todas_paginas: r.todasPaginas });
  } catch (err: any) {
    console.error("BSC pesquisa falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao pesquisar o BSC." });
  }
});

// PDF do BSC: usa exatamente os mesmos filtros da pesquisa (período obrigatório).
bscRouter.get("/pdf", requireAuth, requireRole("superadmin", "admin"), async (req, res) => {
  const p = pesquisaSchema.safeParse(req.query);
  if (!p.success || !p.data.de || !p.data.ate) return res.status(400).json({ error: "Informe a data inicial e a final e pesquise antes de baixar." });
  const f = p.data;
  if (f.de! > f.ate!) return res.status(400).json({ error: "A data inicial não pode ser depois da final." });
  try {
    const aut = await withRole(req.auth!.role, req.auth!.sub, (c) => autorParaPdf(c, req.auth!.sub));
    if ("erro" in aut) return res.status(409).json({ error: aut.erro, code: "perfil_incompleto" });
    const r = await pesquisarBsc(req.auth!.role, req.auth!.sub, f);
    if (!r.paginas.length) return res.status(404).json({ error: "Não há dados do BSC para esses filtros. Ajuste a pesquisa." });
    const filtro = [f.pagina ? `página ${f.pagina}` : "", f.base ? `base ${f.base}` : "", f.placa ? `placa ${f.placa.toUpperCase()}` : ""].filter(Boolean).join(" · ");
    const doc = pdfBsc({ autor: aut.autor, de: f.de!, ate: f.ate!, bases: env.vec.bases, paginas: r.paginas as any, filtro });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bsc_${f.de}_${f.ate}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    doc.pipe(res); doc.end();
  } catch (err: any) {
    console.error("BSC pdf falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao gerar o PDF do BSC." });
  }
});
