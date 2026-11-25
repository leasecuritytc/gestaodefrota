import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";

// Cadastro do próprio admin. As informações aparecem no cabeçalho/rodapé dos relatórios em PDF.
export const perfilRouter = Router();
perfilRouter.use(requireAuth, requireRole("superadmin", "admin"));

export interface Perfil { nome: string; email: string; cargo: string; telefone: string; empresa: string; matricula: string }

export function perfilCompleto(p: Perfil): string[] {
  const falta: string[] = [];
  if (p.nome.trim().length < 5 || !/\s/.test(p.nome.trim())) falta.push("nome completo");
  if (p.cargo.trim().length < 2) falta.push("cargo/função");
  if (p.empresa.trim().length < 2) falta.push("empresa");
  if (p.telefone.replace(/\D/g, "").length < 10) falta.push("telefone com DDD");
  return falta;
}

export async function carregarPerfil(c: import("pg").PoolClient, userId: string): Promise<Perfil | null> {
  const r = await c.query(`SELECT full_name, email, cargo, telefone, empresa, matricula FROM users WHERE id = $1`, [userId]);
  const u = r.rows[0];
  if (!u) return null;
  return { nome: u.full_name ?? "", email: u.email, cargo: u.cargo ?? "", telefone: u.telefone ?? "", empresa: u.empresa ?? "", matricula: u.matricula ?? "" };
}

perfilRouter.get("/", async (req, res) => {
  const p = await withRole(req.auth!.role, req.auth!.sub, (c) => carregarPerfil(c, req.auth!.sub));
  if (!p) return res.status(404).json({ error: "Usuário não encontrado." });
  res.json({ ...p, faltando: perfilCompleto(p) });
});

const schema = z.object({
  nome: z.string().trim().min(5, "Informe o nome completo.").max(120),
  cargo: z.string().trim().min(2, "Informe o cargo ou função.").max(80),
  empresa: z.string().trim().min(2, "Informe a empresa.").max(120),
  telefone: z.string().trim().max(30).refine((v) => v.replace(/\D/g, "").length >= 10, "Informe o telefone com DDD."),
  matricula: z.string().trim().max(40).optional().default(""),
});

perfilRouter.put("/", async (req, res) => {
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos." });
  if (!/\s/.test(p.data.nome)) return res.status(400).json({ error: "Informe o nome completo (nome e sobrenome)." });
  await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    await c.query(
      `UPDATE users SET full_name = $2, cargo = $3, empresa = $4, telefone = $5, matricula = nullif($6, '') WHERE id = $1`,
      [req.auth!.sub, p.data.nome, p.data.cargo, p.data.empresa, p.data.telefone, p.data.matricula]
    );
    await registrarAuditoria(c, req.auth!.sub, "perfil_atualizado", "users", req.auth!.sub, { cargo: p.data.cargo, empresa: p.data.empresa });
  });
  res.json({ ok: true });
});
