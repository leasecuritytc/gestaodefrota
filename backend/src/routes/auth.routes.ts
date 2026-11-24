import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db";
import { env } from "../env";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "E-mail ou senha em formato inválido." });
  }
  const { email, password } = parsed.data;

  // Esta consulta roda sem SET LOCAL app.role, então a RLS da tabela users
  // (users_select_admin) bloquearia qualquer SELECT comum. O login usa uma
  // função SQL SECURITY DEFINER só para esta checagem pontual — ver 004_auth.sql.
  const result = await pool.query(
    "SELECT id, email, password_hash, role, active FROM auth_lookup_user($1)",
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.active) {
    return res.status(401).json({ error: "Credenciais inválidas." });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciais inválidas." });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: "8h" }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});
