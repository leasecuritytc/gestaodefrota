import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withRole, AppRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("superadmin", "admin"));

usersRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, (c) =>
    c.query(`SELECT id, email, full_name, role, active, created_at FROM users ORDER BY created_at`)
  );
  res.json(rows.rows);
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  full_name: z.string().min(1),
  role: z.enum(["superadmin", "admin", "gestor_base", "leitor"]),
});

// Hierarquia de criação: só superadmin cria superadmin ou admin.
// admin e superadmin podem criar gestor_base e leitor.
function podeCriarPapel(criador: AppRole, alvo: AppRole): boolean {
  if (criador === "superadmin") return true;
  if (criador === "admin") return alvo === "gestor_base" || alvo === "leitor";
  return false;
}

usersRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const u = parsed.data;
  if (!podeCriarPapel(req.auth!.role, u.role)) {
    return res
      .status(403)
      .json({ error: `Seu papel (${req.auth!.role}) não pode criar usuários com papel '${u.role}'.` });
  }

  const hash = await bcrypt.hash(u.password, 12);
  try {
    const result = await withRole(req.auth!.role, (c) =>
      c.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1,$2,$3,$4)
         RETURNING id, email, full_name, role, active, created_at`,
        [u.email, hash, u.full_name, u.role]
      )
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Já existe um usuário com esse e-mail." });
    }
    throw err;
  }
});

const updateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["superadmin", "admin", "gestor_base", "leitor"]).optional(),
});

usersRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (parsed.data.role && !podeCriarPapel(req.auth!.role, parsed.data.role)) {
    return res
      .status(403)
      .json({ error: `Seu papel (${req.auth!.role}) não pode atribuir o papel '${parsed.data.role}'.` });
  }
  const sets: string[] = [];
  const params: any[] = [];
  if (parsed.data.active !== undefined) {
    params.push(parsed.data.active);
    sets.push(`active = $${params.length}`);
  }
  if (parsed.data.role) {
    params.push(parsed.data.role);
    sets.push(`role = $${params.length}`);
  }
  if (!sets.length) {
    return res.status(400).json({ error: "Nada para atualizar." });
  }
  params.push(req.params.id);
  const result = await withRole(req.auth!.role, (c) =>
    c.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING id, email, full_name, role, active, created_at`,
      params
    )
  );
  if (!result.rows[0]) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  res.json(result.rows[0]);
});
