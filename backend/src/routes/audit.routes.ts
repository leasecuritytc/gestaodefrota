import { Router, Request, Response, NextFunction } from "express";
import { withRole, pool } from "../db";
import { requireAuth } from "../middleware/auth";

export const auditRouter = Router();
auditRouter.use(requireAuth);

/**
 * Quem pode LER o log de auditoria: superadmin sempre; admin só se um
 * superadmin já marcou acesso_auditoria=true para ele (ver
 * PATCH /api/users/:id/acesso-auditoria). gestor_base, leitor e motorista
 * nunca — mesmo que tenham criado eventos (todo papel autenticado GRAVA no
 * log, mas isso não dá direito de lê-lo depois).
 *
 * Checamos aqui (não só na RLS) para devolver uma mensagem clara em vez de
 * uma lista vazia sem explicação — a RLS (pode_ver_auditoria(), em
 * 010_auditoria_e_troca_motorista.sql) continua sendo a trava de verdade no
 * banco, esta checagem é só para a experiência da API.
 */
async function requireAcessoAuditoria(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: "Não autenticado." });
  }
  if (req.auth.role === "superadmin") {
    return next();
  }
  return res.status(403).json({ error: "A auditoria é restrita ao superadmin." });
}

auditRouter.use(requireAcessoAuditoria);

interface FiltroAuditoria {
  where: string;
  params: unknown[];
}

function montarFiltro(req: Request): FiltroAuditoria {
  const { desde, ate, acao, entidade, usuario_id } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (typeof desde === "string") {
    params.push(desde);
    conditions.push(`a.created_at >= $${params.length}`);
  }
  if (typeof ate === "string") {
    params.push(ate);
    conditions.push(`a.created_at <= $${params.length}`);
  }
  if (typeof acao === "string") {
    params.push(acao);
    conditions.push(`a.acao = $${params.length}`);
  }
  if (typeof entidade === "string") {
    params.push(entidade);
    conditions.push(`a.entidade = $${params.length}`);
  }
  if (typeof usuario_id === "string") {
    params.push(usuario_id);
    conditions.push(`a.user_id = $${params.length}`);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

// GET /api/audit?desde=2026-11-01&ate=2026-11-30&acao=trocar_motorista&entidade=vehicles&usuario_id=...
// Para reunião/assunto interno: filtre por período e por ação/entidade antes
// de exportar (ver /api/audit/export.csv), em vez de baixar o log inteiro.
auditRouter.get("/", async (req, res) => {
  const { where, params } = montarFiltro(req);
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT a.id, a.created_at, a.acao, a.entidade, a.entidade_id, a.detalhes,
              u.email AS usuario_email, u.full_name AS usuario_nome
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT 500`,
      params
    )
  );
  res.json(rows.rows);
});

function csvEscape(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const s = typeof valor === "string" ? valor : JSON.stringify(valor);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// GET /api/audit/export.csv — mesmos filtros de GET /, mas devolve um CSV
// pronto para abrir no Excel/Sheets, para levar a reuniões/assuntos internos.
// Erro comum: abrir o CSV direto no navegador em vez de baixar — o
// Content-Disposition abaixo já força o download com nome de arquivo.
auditRouter.get("/export.csv", async (req, res) => {
  const { where, params } = montarFiltro(req);
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT a.created_at, a.acao, a.entidade, a.entidade_id, a.detalhes,
              u.email AS usuario_email, u.full_name AS usuario_nome
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT 5000`,
      params
    )
  );

  const header = ["data_hora", "acao", "entidade", "entidade_id", "usuario_email", "usuario_nome", "detalhes"];
  const linhas = rows.rows.map((r) =>
    [
      r.created_at.toISOString(),
      r.acao,
      r.entidade,
      r.entidade_id,
      r.usuario_email,
      r.usuario_nome,
      r.detalhes,
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header.join(","), ...linhas].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="auditoria_${Date.now()}.csv"`);
  res.send(csv);
});
