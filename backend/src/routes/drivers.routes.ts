import { Router } from "express";
import { withRole } from "../db";
import { requireAuth } from "../middleware/auth";

// Lista simples de motoristas, usada pelo frontend para preencher o
// seletor de "trocar motorista" de um veículo. Não precisa de requireRole
// explícito aqui: a RLS (drivers_select_staff / drivers_select_self, em
// 002_rls.sql) já decide sozinha quem vê o quê — staff vê todos, motorista
// vê só o próprio registro.
export const driversRouter = Router();
driversRouter.use(requireAuth);

driversRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT id, nome, telefone, cnh, documento FROM drivers ORDER BY nome`)
  );
  res.json(rows.rows);
});
