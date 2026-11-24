import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const vehiclesRouter = Router();
vehiclesRouter.use(requireAuth);

vehiclesRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, (c) =>
    c.query(
      `SELECT id, placa, chassi, base, tipo, rentadora, transportadora, subregiao, status
       FROM vehicles ORDER BY base, placa`
    )
  );
  res.json(rows.rows);
});

const createSchema = z.object({
  placa: z.string().min(5).max(10),
  chassi: z.string().optional(),
  base: z.string().min(1),
  tipo: z.string().optional(),
  rentadora: z.string().optional(),
  transportadora: z.string().optional(),
  subregiao: z.string().optional(),
});

vehiclesRouter.post("/", requireRole("admin", "gestor_base"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const v = parsed.data;
  try {
    const result = await withRole(req.auth!.role, (c) =>
      c.query(
        `INSERT INTO vehicles (placa, chassi, base, tipo, rentadora, transportadora, subregiao)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [v.placa.toUpperCase(), v.chassi, v.base, v.tipo, v.rentadora, v.transportadora, v.subregiao]
      )
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Já existe um veículo com essa placa." });
    }
    throw err;
  }
});
