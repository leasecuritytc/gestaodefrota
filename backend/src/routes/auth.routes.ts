import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool, withRole } from "../db";
import { env } from "../env";
import { hashToken, gerarToken } from "../tokens";
import { enviarEmail, linkRedefinirSenha } from "../email";
import { registrarAuditoria } from "../audit";

const REDEFINICAO_VALIDADE_HORAS = 1;

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

/**
 * Grava uma linha de auditoria para uma ação que acontece ANTES de existir
 * login (ativação de conta, redefinição de senha) — aqui já sabemos o
 * user_id (o token acabou de provar isso), mas não temos uma sessão
 * autenticada com app.role definido, que é o que a política
 * audit_insert (002_rls.sql) exige. Buscamos o papel atual do próprio
 * usuário só para abrir uma transação com esse papel e gravar o evento —
 * nunca para decidir nada além disso.
 */
async function registrarAuditoriaSemSessao(
  userId: string,
  acao: string,
  detalhes: Record<string, unknown>
): Promise<void> {
  // SELECT direto em "users" seria barrado pela RLS (só papel privilegiado
  // lê essa tabela, e aqui não há sessão/app.role nenhum ainda) — por isso
  // a mesma função SECURITY DEFINER usada no login automático acima.
  const userRow = await pool.query(`SELECT role FROM auth_lookup_user_por_id($1)`, [userId]);
  const role = userRow.rows[0]?.role;
  if (!role) return; // não deveria acontecer, mas nunca derruba o fluxo principal por causa do log
  await withRole(role, userId, (c) => registrarAuditoria(c, userId, acao, "users", userId, detalhes));
}

// POST /api/auth/ativar-conta — primeiro acesso de quem foi convidado
// (ver POST /api/users). Define a senha de verdade e confirma o e-mail.
const ativarContaSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
  email_recuperacao: z.string().email().optional(),
});

authRouter.post("/ativar-conta", async (req, res) => {
  const parsed = ativarContaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { token, password, email_recuperacao } = parsed.data;

  const consumo = await pool.query(`SELECT consumir_token_usuario($1, 'convite') AS user_id`, [
    hashToken(token),
  ]);
  const userId: string | null = consumo.rows[0]?.user_id ?? null;
  if (!userId) {
    return res.status(400).json({
      error: "Link de ativação inválido, já usado ou expirado. Peça um novo convite a quem te cadastrou.",
    });
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(`SELECT definir_senha_usuario($1, $2, $3, true)`, [
    userId,
    hash,
    email_recuperacao ?? null,
  ]);
  await registrarAuditoriaSemSessao(userId, "ativar_conta", {});

  const userRow = await pool.query(`SELECT id, email, role FROM auth_lookup_user_por_id($1)`, [userId]);
  const user = userRow.rows[0];
  const jwtToken = jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.jwtSecret, {
    expiresIn: "8h",
  });
  res.json({ ativado: true, login_automatico: true, token: jwtToken, user });
});

// POST /api/auth/esqueci-senha — SEMPRE responde com a mesma mensagem
// genérica, exista ou não o e-mail, para não revelar quais e-mails têm
// conta na plataforma (enumeração de contas). O e-mail de verdade só sai
// se a conta existir, estiver ativa e já tiver sido ativada.
const esqueciSenhaSchema = z.object({ email: z.string().email() });

authRouter.post("/esqueci-senha", async (req, res) => {
  const parsed = esqueciSenhaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const respostaGenerica = {
    mensagem:
      "Se este e-mail tiver uma conta ativa na plataforma, um link de redefinição de senha foi enviado.",
  };

  const row = await pool.query(`SELECT id, email, active, ativado_em FROM localizar_usuario_para_recuperacao($1)`, [
    parsed.data.email,
  ]);
  const user = row.rows[0];
  if (!user || !user.active || !user.ativado_em) {
    // Conta não existe, está desativada, ou nunca foi ativada (nesse caso o
    // caminho certo é reenviar o CONVITE, não redefinir senha) — resposta
    // idêntica à do caminho de sucesso, de propósito.
    return res.json(respostaGenerica);
  }

  const { token, hash: tokenHash } = gerarToken();
  const expiraEm = new Date(Date.now() + REDEFINICAO_VALIDADE_HORAS * 60 * 60 * 1000);
  await pool.query(`SELECT criar_token_usuario($1, 'redefinicao_senha', $2, $3)`, [
    user.id,
    tokenHash,
    expiraEm.toISOString(),
  ]);
  const link = linkRedefinirSenha(token);
  await enviarEmail(
    user.email,
    "Redefinição de senha — GESTÃO DE FROTA",
    `Para redefinir sua senha, acesse: ${link}\nEste link expira em ${REDEFINICAO_VALIDADE_HORAS} hora(s). ` +
      `Se você não pediu isso, ignore este e-mail.`,
    `<p>Para redefinir sua senha, acesse:</p><p><a href="${link}">${link}</a></p>` +
      `<p>Expira em ${REDEFINICAO_VALIDADE_HORAS} hora(s). Se você não pediu isso, ignore este e-mail.</p>`
  );
  await registrarAuditoriaSemSessao(user.id, "solicitar_redefinicao_senha", {});

  res.json(respostaGenerica);
});

// POST /api/auth/redefinir-senha — segunda etapa, com o token recebido por
// e-mail.
const redefinirSenhaSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
});

authRouter.post("/redefinir-senha", async (req, res) => {
  const parsed = redefinirSenhaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const consumo = await pool.query(`SELECT consumir_token_usuario($1, 'redefinicao_senha') AS user_id`, [
    hashToken(parsed.data.token),
  ]);
  const userId: string | null = consumo.rows[0]?.user_id ?? null;
  if (!userId) {
    return res.status(400).json({
      error: "Link de redefinição inválido, já usado ou expirado. Solicite um novo em 'esqueci minha senha'.",
    });
  }
  const hash = await bcrypt.hash(parsed.data.password, 12);
  await pool.query(`SELECT definir_senha_usuario($1, $2, NULL, false)`, [userId, hash]);
  await registrarAuditoriaSemSessao(userId, "redefinir_senha", {});
  res.json({ redefinida: true });
});
