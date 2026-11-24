import { Router } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../env";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

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

// Ingestão: chamada pelo coletor (sem login de usuário; autentica por token).
bscRouter.post("/ingest", async (req, res) => {
  if (!env.bsc.ingestToken) return res.status(503).json({ error: "Ingestão do BSC não configurada no servidor." });
  if (!tokenValido(req.header("x-ingest-token"))) return res.status(401).json({ error: "Token inválido." });
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido.", detalhes: parsed.error.flatten() });
  const { pagina, linhas, tabelas, numeros } = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify([linhas, tabelas])).digest("hex");
  try {
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
  res.json({ configurado: Boolean(env.bsc.ingestToken), paginas: rows.rows });
  } catch (err: any) {
    console.error("BSC leitura falhou:", err?.code, err?.message);
    res.status(500).json({ error: "Falha ao ler os dados do BSC." });
  }
});
