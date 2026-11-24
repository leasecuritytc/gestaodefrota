import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const occurrencesRouter = Router();
occurrencesRouter.use(requireAuth);

const TIPOS = [
  "manutencao_solicitada",
  "sinistro",
  "avaria",
  "acidente",
  "multa",
  "outro",
] as const;

// GET /api/occurrences
// Staff vê tudo (RLS libera); motorista só vê as próprias (RLS restringe
// sozinho — a query é a mesma para todo mundo, quem filtra é o banco).
occurrencesRouter.get("/", async (req, res) => {
  const { status, tipo } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  if (typeof status === "string") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (typeof tipo === "string") {
    params.push(tipo);
    conditions.push(`tipo = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT o.id, o.vehicle_id, v.placa, o.driver_id, o.tipo, o.descricao, o.local,
              o.data_hora, o.anexos, o.status, o.maintenance_id, o.resolved_at, o.created_at
       FROM occurrences o
       JOIN vehicles v ON v.id = o.vehicle_id
       ${where}
       ORDER BY o.data_hora DESC`,
      params
    )
  );
  res.json(rows.rows);
});

const createSchema = z.object({
  placa: z.string().min(5).max(10),
  tipo: z.enum(TIPOS),
  descricao: z.string().min(1),
  local: z.string().optional(),
  data_hora: z.string().optional(), // ISO; default = agora
});

// POST /api/occurrences
// Qualquer papel autenticado pode reportar. Para o motorista, a RLS
// (occurrences_write_motorista) só permite se driver_id/vehicle_id forem os
// dele mesmo — por isso aqui resolvemos o driver_id do próprio motorista
// quando for ele quem está postando; staff pode registrar em nome de
// qualquer veículo (sem vincular um motorista específico, se não souber qual).
occurrencesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const o = parsed.data;

  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const vehicleRow = await c.query(`SELECT id FROM vehicles WHERE placa = $1`, [
        o.placa.toUpperCase(),
      ]);
      if (!vehicleRow.rows[0]) {
        throw Object.assign(new Error("Veículo (placa) não encontrado."), { httpStatus: 404 });
      }
      const vehicleId = vehicleRow.rows[0].id;

      let driverId: string | null = null;
      if (req.auth!.role === "motorista") {
        const driverRow = await c.query(`SELECT id FROM drivers WHERE user_id = $1`, [
          req.auth!.sub,
        ]);
        driverId = driverRow.rows[0]?.id ?? null;
      }

      const insert = await c.query(
        `INSERT INTO occurrences (vehicle_id, driver_id, tipo, descricao, local, data_hora)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
         RETURNING *`,
        [vehicleId, driverId, o.tipo, o.descricao, o.local ?? null, o.data_hora ?? null]
      );
      return insert.rows[0];
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.httpStatus === 404) {
      return res.status(404).json({ error: err.message });
    }
    // Violação de RLS (motorista tentando reportar veículo que não é o dele)
    // chega aqui como erro de permissão do Postgres.
    if (err.code === "42501") {
      return res
        .status(403)
        .json({ error: "Você só pode reportar ocorrências do veículo que dirige hoje." });
    }
    throw err;
  }
});

const updateStatusSchema = z.object({
  status: z.enum(["em_analise", "aprovada", "rejeitada", "resolvida"]),
  maintenance_id: z.string().uuid().optional(),
});

// PATCH /api/occurrences/:id — só staff decide o encaminhamento.
occurrencesRouter.patch(
  "/:id",
  requireRole("superadmin", "admin", "gestor_base"),
  async (req, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { status, maintenance_id } = parsed.data;
    const resolved = status === "resolvida" || status === "rejeitada";

    const result = await withRole(req.auth!.role, req.auth!.sub, (c) =>
      c.query(
        `UPDATE occurrences
         SET status = $1,
             maintenance_id = COALESCE($2, maintenance_id),
             resolved_by = CASE WHEN $3 THEN $4 ELSE resolved_by END,
             resolved_at = CASE WHEN $3 THEN now() ELSE resolved_at END
         WHERE id = $5
         RETURNING *`,
        [status, maintenance_id ?? null, resolved, req.auth!.sub, req.params.id]
      )
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Ocorrência não encontrada." });
    }
    res.json(result.rows[0]);
  }
);
