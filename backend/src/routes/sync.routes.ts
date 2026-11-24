import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { syncVecChecklist } from "../adapters/vecAdapter";
import { syncBscIndicadores } from "../adapters/bscAdapter";

export const syncRouter = Router();
syncRouter.use(requireAuth, requireRole("superadmin", "admin"));

syncRouter.post("/vec", async (_req, res) => {
  res.json(await syncVecChecklist());
});

syncRouter.post("/bsc", async (_req, res) => {
  res.json(await syncBscIndicadores());
});
