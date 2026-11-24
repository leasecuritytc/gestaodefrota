import { Router } from "express";
import { withRole } from "../db";
import { requireAuth } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/resumo", async (req, res) => {
  const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const porStatus = await c.query(
      `SELECT status, count(*)::int AS total FROM vehicles GROUP BY status`
    );
    const porBase = await c.query(
      `SELECT base, status, count(*)::int AS total FROM vehicles GROUP BY base, status ORDER BY base`
    );
    const manutencoesAbertas = await c.query(
      `SELECT count(*)::int AS total FROM maintenance_records WHERE status = 'Em andamento'`
    );
    const custoMes = await c.query(
      `SELECT COALESCE(sum(custo), 0)::numeric AS total
       FROM maintenance_records
       WHERE date_trunc('month', data_entrada) = date_trunc('month', CURRENT_DATE)`
    );
    return {
      por_status: porStatus.rows,
      por_base: porBase.rows,
      manutencoes_abertas: manutencoesAbertas.rows[0]?.total ?? 0,
      custo_mes_atual: custoMes.rows[0]?.total ?? 0,
    };
  });
  res.json(result);
});
