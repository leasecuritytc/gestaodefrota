import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withRole, AppRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("superadmin", "admin"));

usersRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT id, email, full_name, role, active, created_at FROM users ORDER BY created_at`)
  );
  res.json(rows.rows);
});

const ALL_ROLES = ["superadmin", "admin", "gestor_base", "leitor", "motorista"] as const;

const createSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12),
    full_name: z.string().min(1),
    role: z.enum(ALL_ROLES),
    // Só usados quando role === 'motorista':
    telefone: z.string().min(8).optional(),
    documento: z.string().optional(),
    cnh: z.string().optional(),
    placa_atual: z.string().optional(), // atribui o motorista a um veículo já na criação
  })
  .refine((v) => v.role !== "motorista" || !!v.telefone, {
    message: "telefone é obrigatório para o papel 'motorista'.",
    path: ["telefone"],
  });

// Hierarquia de criação: só superadmin cria superadmin ou admin.
// admin e superadmin podem criar gestor_base, leitor e motorista.
function podeCriarPapel(criador: AppRole, alvo: AppRole): boolean {
  if (criador === "superadmin") return true;
  if (criador === "admin") return alvo === "gestor_base" || alvo === "leitor" || alvo === "motorista";
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
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const userRow = await c.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1,$2,$3,$4)
         RETURNING id, email, full_name, role, active, created_at`,
        [u.email, hash, u.full_name, u.role]
      );
      const user = userRow.rows[0];

      // Papel 'motorista' sempre vem com um registro em "drivers" ligado por
      // user_id — é essa ligação que a RLS usa para restringir o motorista
      // ao próprio veículo e às próprias ocorrências (ver 002_rls.sql).
      if (u.role === "motorista") {
        const driverRow = await c.query(
          `INSERT INTO drivers (nome, documento, cnh, telefone, user_id)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id`,
          [u.full_name, u.documento ?? null, u.cnh ?? null, u.telefone, user.id]
        );
        const driverId = driverRow.rows[0].id;

        if (u.placa_atual) {
          const vehicleRow = await c.query(`SELECT id FROM vehicles WHERE placa = $1`, [
            u.placa_atual.toUpperCase(),
          ]);
          if (!vehicleRow.rows[0]) {
            throw Object.assign(new Error("placa_atual não encontrada"), { httpStatus: 400 });
          }
          await c.query(`UPDATE vehicles SET motorista_atual_id = $1 WHERE id = $2`, [
            driverId,
            vehicleRow.rows[0].id,
          ]);
          await c.query(
            `INSERT INTO vehicle_driver_history (vehicle_id, driver_id) VALUES ($1, $2)`,
            [vehicleRow.rows[0].id, driverId]
          );
        }
      }
      return user;
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Já existe um usuário com esse e-mail." });
    }
    if (err.httpStatus === 400) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

const updateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(ALL_ROLES).optional(),
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
  const result = await withRole(req.auth!.role, req.auth!.sub, (c) =>
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
