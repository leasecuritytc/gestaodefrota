import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { withRole, AppRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";
import { gerarToken } from "../tokens";
import { enviarEmail, linkConvite } from "../email";

const CONVITE_VALIDADE_DIAS = 7;

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("superadmin", "admin"));

usersRouter.get("/", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT id, email, full_name, role, active, email_confirmado, ativado_em, acesso_auditoria, created_at
       FROM users ${req.auth!.role === "superadmin" ? "" : "WHERE role <> 'superadmin'"} ORDER BY created_at`
    )
  );
  res.json(req.auth!.role === "superadmin" ? rows.rows : rows.rows.map(({ acesso_auditoria, ...r }: any) => r));
});

// Admin não enxerga nem altera superadmin.
async function alvoEhSuperadmin(req: any, id: string): Promise<boolean> {
  if (req.auth.role === "superadmin") return false;
  const r = await withRole(req.auth.role, req.auth.sub, (c) => c.query(`SELECT role FROM users WHERE id = $1`, [id]));
  return r.rows[0]?.role === "superadmin";
}

const ALL_ROLES = ["superadmin", "admin", "gestor_base", "leitor", "motorista"] as const;

// Sem campo de senha: quem cria o usuário NUNCA define a senha dele — a
// pessoa convidada é quem escolhe, ao abrir o link de ativação (ver
// POST /api/auth/ativar-conta). Isso evita que uma senha inicial circule
// por e-mail/WhatsApp em texto puro, e também evita que o criador "saiba"
// a senha de quem ele cadastrou.
const createSchema = z
  .object({
    email: z.string().email(),
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

  // Senha-placeholder: um hash de um valor aleatório que ninguém nunca vai
  // digitar — o login (auth.routes.ts) compara com bcrypt normalmente, e
  // como a senha real é outra coisa completamente diferente, a comparação
  // SEMPRE falha até a pessoa ativar a conta e definir a senha de verdade.
  // Mais simples e mais seguro do que permitir password_hash nulo no banco.
  const senhaPlaceholder = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const userRow = await c.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1,$2,$3,$4)
         RETURNING id, email, full_name, role, active, created_at`,
        [u.email, senhaPlaceholder, u.full_name, u.role]
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

      // Convite de ativação: token de uso único, válido por
      // CONVITE_VALIDADE_DIAS. Só o hash vai pro banco (ver tokens.ts) —
      // o token "cru" só existe aqui, pra montar o link.
      const { token, hash: tokenHash } = gerarToken();
      const expiraEm = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000);
      await c.query(`SELECT criar_token_usuario($1, 'convite', $2, $3)`, [
        user.id,
        tokenHash,
        expiraEm.toISOString(),
      ]);
      const link = linkConvite(token);

      await registrarAuditoria(c, req.auth!.sub, "criar_usuario", "users", user.id, {
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        placa_atual: u.placa_atual ?? null,
      });

      return { user, link, expiraEm };
    });

    // E-mail enviado FORA da transação acima: se o envio falhar, o usuário
    // e o convite já foram criados de verdade — não queremos desfazer o
    // cadastro só porque o SMTP engasgou. Por isso o link também volta na
    // resposta (quem está criando o usuário pode repassar na mão).
    const emailResultado = await enviarEmail(
      result.user.email,
      "Você foi convidado para a plataforma GESTÃO DE FROTA",
      `Olá, ${result.user.full_name}. Para ativar sua conta e definir sua senha, acesse: ${result.link}\n` +
        `Este link expira em ${CONVITE_VALIDADE_DIAS} dias.`,
      `<p>Olá, ${result.user.full_name}.</p>` +
        `<p>Para ativar sua conta e definir sua senha, acesse o link abaixo:</p>` +
        `<p><a href="${result.link}">${result.link}</a></p>` +
        `<p>Este link expira em ${CONVITE_VALIDADE_DIAS} dias.</p>`
    );

    res.status(201).json({
      ...result.user,
      convite: {
        link: result.link,
        expira_em: result.expiraEm,
        email_enviado: emailResultado.enviado,
        ...(emailResultado.enviado ? {} : { aviso: emailResultado.motivo }),
      },
    });
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

// POST /api/users/:id/reenviar-convite — gera um novo link de ativação
// (ex.: o anterior expirou, ou o e-mail nunca chegou). Só faz sentido para
// quem ainda não ativou a conta — depois disso, o caminho certo é
// "esqueci minha senha" (POST /api/auth/esqueci-senha), não reenviar
// convite.
usersRouter.post("/:id/reenviar-convite", async (req, res) => {
  if (await alvoEhSuperadmin(req, String(req.params.id))) return res.status(404).json({ error: "Usuário não encontrado." });
  try {
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const userRow = await c.query(
        `SELECT id, email, full_name, ativado_em FROM users WHERE id = $1`,
        [req.params.id]
      );
      const user = userRow.rows[0];
      if (!user) {
        throw Object.assign(new Error("Usuário não encontrado."), { httpStatus: 404 });
      }
      if (user.ativado_em) {
        throw Object.assign(
          new Error(
            "Este usuário já ativou a conta. Para ele recuperar acesso, use 'esqueci minha senha' (POST /api/auth/esqueci-senha), não reenviar convite."
          ),
          { httpStatus: 400 }
        );
      }
      const { token, hash: tokenHash } = gerarToken();
      const expiraEm = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000);
      await c.query(`SELECT criar_token_usuario($1, 'convite', $2, $3)`, [
        user.id,
        tokenHash,
        expiraEm.toISOString(),
      ]);
      const link = linkConvite(token);
      await registrarAuditoria(c, req.auth!.sub, "reenviar_convite", "users", user.id, {
        email: user.email,
      });
      return { user, link, expiraEm };
    });

    const emailResultado = await enviarEmail(
      result.user.email,
      "Novo link de ativação — GESTÃO DE FROTA",
      `Acesse para ativar sua conta: ${result.link}\nEste link expira em ${CONVITE_VALIDADE_DIAS} dias.`,
      `<p><a href="${result.link}">${result.link}</a></p><p>Expira em ${CONVITE_VALIDADE_DIAS} dias.</p>`
    );
    res.json({
      link: result.link,
      expira_em: result.expiraEm,
      email_enviado: emailResultado.enviado,
      ...(emailResultado.enviado ? {} : { aviso: emailResultado.motivo }),
    });
  } catch (err: any) {
    if (err.httpStatus) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    throw err;
  }
});

const updateSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(ALL_ROLES).optional(),
});

usersRouter.patch("/:id", async (req, res) => {
  if (await alvoEhSuperadmin(req, String(req.params.id))) return res.status(404).json({ error: "Usuário não encontrado." });
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
  const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const updated = await c.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING id, email, full_name, role, active, created_at`,
      params
    );
    if (updated.rows[0]) {
      await registrarAuditoria(c, req.auth!.sub, "atualizar_usuario", "users", req.params.id, {
        email: updated.rows[0].email,
        alteracoes: parsed.data,
      });
    }
    return updated;
  });
  if (!result.rows[0]) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  res.json(result.rows[0]);
});

// PATCH /api/users/:id/acesso-auditoria — só superadmin concede ou revoga o
// acesso de um admin ao log de auditoria (nunca o próprio admin se concede;
// nunca gestor_base/leitor/motorista, mesmo que a flag seja marcada manualmente
// no banco — pode_ver_auditoria() em 010_auditoria_e_troca_motorista.sql só
// considera essa flag quando o papel atual já é 'admin').
const acessoAuditoriaSchema = z.object({ acesso_auditoria: z.boolean() });

usersRouter.patch(
  "/:id/acesso-auditoria",
  requireRole("superadmin"),
  async (req, res) => {
    const parsed = acessoAuditoriaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const updated = await c.query(
        `UPDATE users SET acesso_auditoria = $1 WHERE id = $2
         RETURNING id, email, full_name, role, acesso_auditoria`,
        [parsed.data.acesso_auditoria, req.params.id]
      );
      if (updated.rows[0]) {
        await registrarAuditoria(
          c,
          req.auth!.sub,
          parsed.data.acesso_auditoria ? "conceder_acesso_auditoria" : "revogar_acesso_auditoria",
          "users",
          req.params.id,
          { email: updated.rows[0].email }
        );
      }
      return updated;
    });
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }
    if (result.rows[0].role !== "admin") {
      return res.json({
        ...result.rows[0],
        aviso:
          "Este usuário não tem papel 'admin' — a flag foi salva, mas só tem efeito quando o papel for 'admin'.",
      });
    }
    res.json(result.rows[0]);
  }
);
