import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);

maintenanceRouter.get("/", async (req, res) => {
  const { status, base } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  if (typeof status === "string") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (typeof base === "string") {
    params.push(base);
    conditions.push(`base = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await withRole(req.auth!.role, (c) =>
    c.query(
      `SELECT id, placa, base, tipo, descricao, oficina, data_entrada, data_saida,
              custo, status, source, ingested_at
       FROM maintenance_records
       ${where}
       ORDER BY data_entrada DESC`,
      params
    )
  );
  res.json(rows.rows);
});

const createSchema = z.object({
  placa: z.string().min(5).max(10),
  base: z.string().min(1),
  tipo: z.enum(["Preventiva", "Corretiva", "Outros"]),
  descricao: z.string().optional(),
  oficina: z.string().optional(),
  data_entrada: z.string(), // ISO date
  data_saida: z.string().optional(),
  custo: z.number().min(0).default(0),
});

maintenanceRouter.post("/", requireRole("admin", "gestor_base"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const m = parsed.data;
  if (m.data_saida && m.data_saida < m.data_entrada) {
    return res
      .status(400)
      .json({ error: "Data de saída não pode ser anterior à data de entrada." });
  }
  const result = await withRole(req.auth!.role, (c) =>
    c.query(
      `INSERT INTO maintenance_records
         (placa, base, tipo, descricao, oficina, data_entrada, data_saida, custo, status, source, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               CASE WHEN $7 IS NOT NULL THEN 'Concluída' ELSE 'Em andamento' END,
               'manual', gen_random_uuid()::text)
       RETURNING *`,
      [
        m.placa.toUpperCase(),
        m.base,
        m.tipo,
        m.descricao ?? null,
        m.oficina ?? null,
        m.data_entrada,
        m.data_saida ?? null,
        m.custo,
      ]
    )
  );
  res.status(201).json(result.rows[0]);
});
