import { Router } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../env";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { aplicarEscopo, normPlaca, repararDeep } from "../bscEscopo";

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
