import express, { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Fotos do chassi de cada veículo (somente superadmin/admin). Ficam no banco (bytea).
export const chassiFotosRouter = Router();
chassiFotosRouter.use(requireAuth, requireRole("superadmin", "admin"));

const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);
const uuid = z.string().uuid();
const corpoImagem = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" });
const MAX_FOTOS = 5;

chassiFotosRouter.get("/foto/:id", h(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: "ID inválido." });
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) => c.query(`SELECT mime, dados FROM veiculo_fotos_chassi WHERE id = $1`, [req.params.id]));
  if (!r.rows[0]) return res.status(404).json({ error: "Foto não encontrada." });
  res.setHeader("Content-Type", r.rows[0].mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(r.rows[0].dados);
}));

chassiFotosRouter.delete("/foto/:id", h(async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(400).json({ error: "ID inválido." });
  const ok = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const r = await c.query(`DELETE FROM veiculo_fotos_chassi WHERE id = $1 RETURNING vehicle_id`, [req.params.id]);
    if (r.rowCount) await registrarAuditoria(c, req.auth!.sub, "foto_chassi_removida", "vehicles", r.rows[0].vehicle_id, { foto_id: req.params.id });
    return r.rowCount === 1;
  });
  if (!ok) return res.status(404).json({ error: "Foto não encontrada." });
  res.json({ ok: true });
}));

chassiFotosRouter.get("/:vid", h(async (req, res) => {
  if (!uuid.safeParse(req.params.vid).success) return res.status(400).json({ error: "ID inválido." });
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT f.id, f.created_at, f.tamanho, coalesce(u.full_name, u.email) AS enviado_por
               FROM veiculo_fotos_chassi f LEFT JOIN users u ON u.id = f.enviado_por WHERE f.vehicle_id = $1 ORDER BY f.created_at`, [req.params.vid]));
  res.json(r.rows);
}));

chassiFotosRouter.post("/:vid", corpoImagem, h(async (req, res) => {
  const vid = req.params.vid as string;
  const mime = (req.headers["content-type"] ?? "").split(";")[0];
  if (!uuid.safeParse(vid).success) return res.status(400).json({ error: "ID inválido." });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Envie uma imagem JPEG, PNG ou WebP." });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const v = await c.query(`SELECT placa FROM vehicles WHERE id = $1`, [vid]);
    if (!v.rows[0]) return { erro: 404, msg: "Veículo não encontrado." };
    const n = await c.query(`SELECT count(*)::int AS n FROM veiculo_fotos_chassi WHERE vehicle_id = $1`, [vid]);
    if (n.rows[0].n >= MAX_FOTOS) return { erro: 400, msg: `Limite de ${MAX_FOTOS} fotos por veículo. Remova uma antes de anexar outra.` };
    const r = await c.query(
      `INSERT INTO veiculo_fotos_chassi (vehicle_id, mime, tamanho, dados, enviado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [vid, mime, req.body.length, req.body, req.auth!.sub]
    );
    await registrarAuditoria(c, req.auth!.sub, "foto_chassi_anexada", "vehicles", vid, { placa: v.rows[0].placa });
    return { id: r.rows[0].id as string };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg });
  res.status(201).json({ id: out.id });
}));
