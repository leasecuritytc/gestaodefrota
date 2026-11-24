import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { syncVecChecklist } from "../adapters/vecAdapter";
import { syncBscIndicadores } from "../adapters/bscAdapter";
import { syncGoogleSheets } from "../adapters/googleSheetsAdapter";

export const syncRouter = Router();
syncRouter.use(requireAuth, requireRole("superadmin", "admin"));

syncRouter.post("/vec", async (_req, res) => {
  res.json(await syncVecChecklist());
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
