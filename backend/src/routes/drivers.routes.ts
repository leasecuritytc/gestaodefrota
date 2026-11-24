import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Lista simples de motoristas, usada pelo frontend para preencher o
// seletor de "trocar motorista" de um veículo. Não precisa de requireRole
// explícito aqui: a RLS (drivers_select_staff / drivers_select_self, em
// 002_rls.sql) já decide sozinha quem vê o quê — staff vê todos, motorista
// vê só o próprio registro.
export const driversRouter = Router();
driversRouter.use(requireAuth);

driversRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT id, nome, telefone, cnh, documento, active FROM drivers ORDER BY nome`)
  );
  res.json(rows.rows);
});

// Cadastro de motorista SEM login (sem conta de usuário) — para quem só
// precisa aparecer como "motorista atual" de um veículo, sem nunca acessar
// a plataforma. Quando o motorista também precisa de login, o cadastro
// continua sendo feito por /api/users (role='motorista'), que já cria o
// registro em drivers ligado por user_id (ver users.routes.ts).
// Decisão do dono do projeto (24/11/2026): CRUD de motorista é
// admin/superadmin.
const createSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(8).optional(),
  documento: z.string().optional(),
  cnh: z.string().optional(),
});

driversRouter.post("/", requireRole("superadmin", "admin"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const row = await c.query(
      `INSERT INTO drivers (nome, documento, cnh, telefone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [d.nome, d.documento ?? null, d.cnh ?? null, d.telefone ?? null]
    );
    await registrarAuditoria(c, req.auth!.sub, "criar_motorista", "drivers", row.rows[0].id, {
      nome: row.rows[0].nome,
    });
    return row.rows[0];
  });
  res.status(201).json(result);
});

const updateSchema = z.object({
  nome: z.string().min(1).optional(),
  telefone: z.string().nullable().optional(),
  documento: z.string().nullable().optional(),
  cnh: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

driversRouter.patch("/:id", requireRole("superadmin", "admin"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campos = parsed.data;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar." });
  }

  try {
    const resultado = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const atual = await c.query(`SELECT * FROM drivers WHERE id = $1`, [req.params.id]);
      if (!atual.rows[0]) {
        throw Object.assign(new Error("Motorista não encontrado."), { httpStatus: 404 });
      }
      const sets: string[] = [];
      const valores: unknown[] = [];
      let i = 1;
      for (const [campo, valor] of Object.entries(campos)) {
        sets.push(`${campo} = $${i}`);
        valores.push(valor);
        i++;
      }
      valores.push(req.params.id);
      const row = await c.query(
        `UPDATE drivers SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
        valores
      );
      await registrarAuditoria(c, req.auth!.sub, "editar_motorista", "drivers", req.params.id, campos);
      return row.rows[0];
    });
    res.json(resultado);
  } catch (err: any) {
    if (err.httpStatus) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    throw err;
  }
});
