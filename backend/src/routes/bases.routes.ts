import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Cadastro de bases: leitura liberada para todo staff autenticado (precisa
// popular seletores em várias telas), escrita (criar/editar/desativar)
// restrita a admin e superadmin — decisão do dono do projeto, 24/11/2026.
// RLS em 013_bases.sql já garante isso no banco; requireRole aqui é a
// primeira camada, com mensagens de erro mais explícitas.
export const basesRouter = Router();
basesRouter.use(requireAuth);

basesRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT id, codigo, nome, cidade, estado, ativa, created_at, updated_at
       FROM bases ORDER BY ativa DESC, codigo`
    )
  );
  res.json(rows.rows);
});

const baseSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(120),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(2).optional(),
});

basesRouter.post("/", requireRole("superadmin", "admin"), async (req, res) => {
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const b = parsed.data;
  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const row = await c.query(
        `INSERT INTO bases (codigo, nome, cidade, estado)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [b.codigo.toUpperCase(), b.nome, b.cidade ?? null, b.estado?.toUpperCase() ?? null]
      );
      await registrarAuditoria(c, req.auth!.sub, "criar_base", "bases", row.rows[0].id, {
        codigo: row.rows[0].codigo,
        nome: row.rows[0].nome,
      });
      return row.rows[0];
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Já existe uma base com esse código." });
    }
    throw err;
  }
});

const updateSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  cidade: z.string().max(120).nullable().optional(),
  estado: z.string().max(2).nullable().optional(),
  ativa: z.boolean().optional(),
});

basesRouter.patch("/:id", requireRole("superadmin", "admin"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const campos = parsed.data;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: "Nada para atualizar." });
  }

  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const atual = await c.query(`SELECT * FROM bases WHERE id = $1`, [req.params.id]);
      if (!atual.rows[0]) {
        throw Object.assign(new Error("Base não encontrada."), { httpStatus: 404 });
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
        `UPDATE bases SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i} RETURNING *`,
        valores
      );
      await registrarAuditoria(c, req.auth!.sub, "editar_base", "bases", req.params.id, campos);
      return row.rows[0];
    });
    res.json(result);
  } catch (err: any) {
    if (err.httpStatus) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    throw err;
  }
});
