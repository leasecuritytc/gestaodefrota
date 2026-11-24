import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const checklistsRouter = Router();
checklistsRouter.use(requireAuth, requireRole("superadmin", "admin"));

const filtroSchema = z.object({
  q: z.string().max(40).optional(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  falhas: z.enum(["1"]).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

// Lista de checklists (inspeções) sincronizados da VEC + totais do filtro.
checklistsRouter.get("/", async (req, res) => {
  const p = filtroSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtros inválidos." });
  const f = p.data;
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.q) {
    args.push(`%${f.q.toUpperCase()}%`);
    cond.push(`(upper(placa) LIKE $${args.length} OR upper(coalesce(svc,'')) LIKE $${args.length} OR upper(coalesce(motorista,'')) LIKE $${args.length})`);
  }
  if (f.de) {
    args.push(f.de);
    cond.push(`data_hora >= $${args.length}::date`);
  }
  if (f.ate) {
    args.push(f.ate);
    cond.push(`data_hora < ($${args.length}::date + 1)`);
  }
  if (f.falhas) cond.push(`num_falhas > 0`);
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  try {
    const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const totais = await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE num_falhas > 0)::int AS com_falhas,
                coalesce(sum(num_falhas),0)::int AS falhas,
                count(DISTINCT placa)::int AS veiculos,
                max(data_hora) AS ultimo
         FROM checklist_events ${where}`,
        args
      );
      const linhas = await c.query(
        `SELECT id, placa, tipo_formulario, data_hora, svc, unidade, transportadora, rentadora,
                subregiao, motorista, usuario_vec, num_falhas
         FROM checklist_events ${where}
         ORDER BY data_hora DESC
         LIMIT ${f.limite}`,
        args
      );
      return { totais: totais.rows[0], linhas: linhas.rows };
    });
    res.json(out);
  } catch (err) {
    console.error("[checklists] erro:", err);
    res.status(500).json({ error: "Falha ao ler os checklists." });
  }
});
