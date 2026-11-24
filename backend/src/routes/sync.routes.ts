import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { syncVec } from "../adapters/vecAdapter";
import { isVecConfigurado } from "../adapters/vecClient";
import { withRole } from "../db";
import { syncBscIndicadores } from "../adapters/bscAdapter";
import { syncGoogleSheets } from "../adapters/googleSheetsAdapter";

export const syncRouter = Router();
syncRouter.use(requireAuth, requireRole("superadmin", "admin"));

syncRouter.post("/vec", async (_req, res) => {
  res.json(await syncVec("manual"));
});

// Situação da integração VEC: configurada? últimas sincronizações.
syncRouter.get("/vec/status", async (req, res) => {
  const logs = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT iniciado_em, finalizado_em, origem, ok, veiculos, checklists, erro
       FROM vec_sync_log ORDER BY iniciado_em DESC LIMIT 10`
    )
  );
  res.json({ configurado: isVecConfigurado(), ultimas: logs.rows });
});

syncRouter.post("/bsc", async (_req, res) => {
  res.json(await syncBscIndicadores());
});

// Puxa sob demanda os dados das planilhas Google configuradas
// (GOOGLE_SHEETS_SPREADSHEET_IDS). Responde 200 com { synced: 0, skipped }
// quando não há credencial configurada ainda — nunca inventa dado.
syncRouter.post("/google-sheets", async (_req, res) => {
  res.json(await syncGoogleSheets());
});
