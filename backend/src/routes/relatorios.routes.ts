import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import { PoolClient } from "pg";
import { z } from "zod";
import { env } from "../env";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { registrarAuditoria } from "../audit";
import { carregarPerfil, perfilCompleto } from "./perfil.routes";
import { gerarPdf, RelatorioDados, RelatorioReg } from "../relatorioPdf";

const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const dia = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const gerarSchema = z.object({
  tipo: z.enum(["semanal", "quinzenal", "mensal", "bimestral", "semestral", "anual", "personalizado"]),
  ano: z.coerce.number().int().min(2024).max(2100).optional(),
  periodo: z.coerce.number().int().min(1).max(12).optional(), // mês (1-12), bimestre (1-6) ou semestre (1-2)
  data: data.optional(),                                      // semanal: qualquer dia da semana desejada
  quinzena: z.coerce.number().int().min(1).max(2).optional(), // quinzenal: 1ª (1–15) ou 2ª (16–fim)
  de: data.optional(), ate: data.optional(),                  // personalizado
});
type GerarIn = z.infer<typeof gerarSchema>;

const fmtBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isoDe = (d: Date) => d.toISOString().slice(0, 10);

export function calcularPeriodo(g: GerarIn): { ini: string; fim: string; titulo: string } | string {
  const { tipo, ano, periodo } = g;
  if (tipo === "personalizado") {
    if (!g.de || !g.ate) return "Informe a data inicial e a final.";
    if (g.de > g.ate) return "A data inicial não pode ser depois da final.";
    if ((Date.parse(g.ate) - Date.parse(g.de)) / 86_400_000 > 366) return "O período personalizado pode ter no máximo 366 dias.";
    return { ini: g.de, fim: g.ate, titulo: `Relatório de ${fmtBR(g.de)} a ${fmtBR(g.ate)}` };
  }
  if (tipo === "semanal") {
    if (!g.data) return "Escolha uma data da semana.";
    const d = new Date(g.data + "T00:00:00Z");
    const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
    const seg = new Date(d.getTime() - dow * 86_400_000), dom = new Date(seg.getTime() + 6 * 86_400_000);
    return { ini: isoDe(seg), fim: isoDe(dom), titulo: `Relatório semanal — ${fmtBR(isoDe(seg))} a ${fmtBR(isoDe(dom))}` };
  }
  if (!ano) return "Informe o ano.";
  if (tipo === "anual") return { ini: dia(ano, 1, 1), fim: dia(ano, 12, 31), titulo: `Relatório anual — ${ano}` };
  if (periodo == null) return "Informe o período.";
  if (tipo === "quinzenal") {
    if (periodo < 1 || periodo > 12) return "Mês inválido.";
    if (!g.quinzena) return "Escolha a quinzena.";
    const [i, f] = g.quinzena === 1 ? [1, 15] : [16, ultimoDia(ano, periodo)];
    return { ini: dia(ano, periodo, i), fim: dia(ano, periodo, f), titulo: `Relatório quinzenal — ${g.quinzena}ª quinzena de ${NOMES_MES[periodo - 1]}/${ano}` };
  }
  if (tipo === "mensal") {
    if (periodo < 1 || periodo > 12) return "Mês inválido.";
    return { ini: dia(ano, periodo, 1), fim: dia(ano, periodo, ultimoDia(ano, periodo)), titulo: `Relatório mensal — ${NOMES_MES[periodo - 1]}/${ano}` };
  }
  if (tipo === "bimestral") {
    if (periodo < 1 || periodo > 6) return "Bimestre inválido (1 a 6).";
    const m1 = periodo * 2 - 1, m2 = periodo * 2;
    return { ini: dia(ano, m1, 1), fim: dia(ano, m2, ultimoDia(ano, m2)), titulo: `Relatório bimestral — ${periodo}º bimestre/${ano} (${NOMES_MES[m1 - 1].slice(0, 3)}–${NOMES_MES[m2 - 1].slice(0, 3)})` };
  }
  if (periodo < 1 || periodo > 2) return "Semestre inválido (1 ou 2).";
  const m1 = periodo === 1 ? 1 : 7, m2 = periodo === 1 ? 6 : 12;
  return { ini: dia(ano, m1, 1), fim: dia(ano, m2, ultimoDia(ano, m2)), titulo: `Relatório semestral — ${periodo}º semestre/${ano}` };
}

const num = (v: unknown) => Number(v ?? 0);

async function coletar(c: PoolClient, ini: string, fim: string): Promise<RelatorioDados> {
  const bases = env.vec.bases;
  const q = async (sql: string, args: unknown[] = []) => (await c.query(sql, args)).rows;

  const porStatus = await q(`SELECT status, count(*)::int AS total FROM vehicles WHERE base = ANY($1) GROUP BY status ORDER BY total DESC`, [bases]);
  const porBase = await q(
    `SELECT base, count(*)::int AS total,
            count(*) FILTER (WHERE status = 'Ativa')::int AS ativos,
            count(*) FILTER (WHERE status = 'Manutenção')::int AS manutencao,
            count(*) FILTER (WHERE status = 'Desmobilizado')::int AS desmobilizados,
            count(*) FILTER (WHERE status = 'Sem cooperado')::int AS sem_cooperado
       FROM vehicles WHERE base = ANY($1) GROUP BY base ORDER BY base`, [bases]);
  const porTipo = await q(`SELECT coalesce(nullif(btrim(tipo), ''), 'Não informado') AS tipo, count(*)::int AS total FROM vehicles WHERE base = ANY($1) GROUP BY 1 ORDER BY total DESC`, [bases]);
  const evolucao = await q(
    `SELECT to_char(snapshot_date, 'YYYY-MM-DD') AS data, sum(total)::int AS total FROM fleet_snapshots
      WHERE base = ANY($1) AND snapshot_date BETWEEN $2::date AND $3::date GROUP BY snapshot_date ORDER BY snapshot_date`, [bases, ini, fim]);

  const mTot = (await q(`SELECT count(*)::int AS total, coalesce(sum(custo),0)::numeric AS custo FROM maintenance_records WHERE base = ANY($1) AND data_entrada BETWEEN $2::date AND $3::date`, [bases, ini, fim]))[0];
  const mTipo = await q(`SELECT tipo, count(*)::int AS total, coalesce(sum(custo),0)::numeric AS custo FROM maintenance_records WHERE base = ANY($1) AND data_entrada BETWEEN $2::date AND $3::date GROUP BY tipo ORDER BY total DESC`, [bases, ini, fim]);
  const mMes = await q(`SELECT to_char(date_trunc('month', data_entrada), 'YYYY-MM') AS mes, count(*)::int AS total, coalesce(sum(custo),0)::numeric AS custo FROM maintenance_records WHERE base = ANY($1) AND data_entrada BETWEEN $2::date AND $3::date GROUP BY 1 ORDER BY 1`, [bases, ini, fim]);
  const mBase = await q(`SELECT base, count(*)::int AS total, coalesce(sum(custo),0)::numeric AS custo FROM maintenance_records WHERE base = ANY($1) AND data_entrada BETWEEN $2::date AND $3::date GROUP BY base ORDER BY base`, [bases, ini, fim]);
  const mTop = await q(`SELECT placa, count(*)::int AS total, coalesce(sum(custo),0)::numeric AS custo FROM maintenance_records WHERE base = ANY($1) AND data_entrada BETWEEN $2::date AND $3::date GROUP BY placa HAVING sum(custo) > 0 ORDER BY sum(custo) DESC LIMIT 5`, [bases, ini, fim]);
  const mAbertas = (await q(`SELECT count(*)::int AS n FROM maintenance_records WHERE base = ANY($1) AND status = 'Em andamento'`, [bases]))[0].n;

  const oTipo = await q(`SELECT o.tipo, count(*)::int AS total FROM occurrences o JOIN vehicles v ON v.id = o.vehicle_id WHERE v.base = ANY($1) AND (o.data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY o.tipo ORDER BY total DESC`, [bases, ini, fim]);
  const oStatus = await q(`SELECT o.status, count(*)::int AS total FROM occurrences o JOIN vehicles v ON v.id = o.vehicle_id WHERE v.base = ANY($1) AND (o.data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY o.status ORDER BY total DESC`, [bases, ini, fim]);

  const iTot = (await q(
    `SELECT count(*)::int AS concluidas, count(*) FILTER (WHERE num_falhas > 0)::int AS com_falhas, coalesce(sum(num_falhas),0)::int AS total_falhas, count(DISTINCT vehicle_id)::int AS veiculos
       FROM checklist_execucoes WHERE status = 'Concluido' AND base = ANY($1) AND (coalesce(concluido_em, data_hora) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date`, [bases, ini, fim]))[0];
  const iBase = await q(
    `SELECT base, count(*)::int AS concluidas, count(*) FILTER (WHERE num_falhas > 0)::int AS com_falhas
       FROM checklist_execucoes WHERE status = 'Concluido' AND base = ANY($1) AND (coalesce(concluido_em, data_hora) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date GROUP BY base ORDER BY base`, [bases, ini, fim]);
  const ativos = (await q(`SELECT count(*)::int AS n FROM vehicles WHERE base = ANY($1) AND status <> 'Desmobilizado'`, [bases]))[0].n;
  const vencidas = (await q(
    `SELECT count(*)::int AS n FROM vehicles v WHERE v.base = ANY($1) AND v.status <> 'Desmobilizado'
        AND NOT EXISTS (SELECT 1 FROM checklist_execucoes x WHERE x.vehicle_id = v.id AND x.status = 'Concluido' AND x.data_hora >= now() - interval '15 days')`, [bases]))[0].n;

  return {
    bases,
    frota: { total: porStatus.reduce((a, s) => a + s.total, 0), por_status: porStatus, por_base: porBase, por_tipo: porTipo },
    evolucao,
    manutencoes: {
      total: mTot.total, custo: num(mTot.custo), abertas_agora: mAbertas,
      por_tipo: mTipo.map((r) => ({ ...r, custo: num(r.custo) })), por_mes: mMes.map((r) => ({ ...r, custo: num(r.custo) })),
      por_base: mBase.map((r) => ({ ...r, custo: num(r.custo) })), top_veiculos: mTop.map((r) => ({ ...r, custo: num(r.custo) })),
    },
    ocorrencias: { total: oTipo.reduce((a, o) => a + o.total, 0), por_tipo: oTipo, por_status: oStatus },
    inspecoes: { concluidas: iTot.concluidas, com_falhas: iTot.com_falhas, total_falhas: iTot.total_falhas, veiculos_inspecionados: iTot.veiculos, veiculos_ativos: ativos, vencidas_agora: vencidas, por_base: iBase },
  };
}

function paraRegistro(r: any): RelatorioReg {
  return {
    id: r.id, tipo: r.tipo, periodo_inicio: r.periodo_inicio, periodo_fim: r.periodo_fim, titulo: r.titulo,
    gerado_em: new Date(r.gerado_em).toISOString(), dados: r.dados, autor: r.autor,
  };
}

function enviarPdf(res: Response, rel: RelatorioReg, baixar: boolean) {
  const nome = `${rel.titulo.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${baixar ? "attachment" : "inline"}; filename="${nome}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const doc = gerarPdf(rel);
  doc.pipe(res);
  doc.end();
}

const SEL = `SELECT r.id, r.tipo, to_char(r.periodo_inicio,'YYYY-MM-DD') AS periodo_inicio, to_char(r.periodo_fim,'YYYY-MM-DD') AS periodo_fim,
                    r.titulo, r.dados, r.autor, r.gerado_em, r.link_token, r.link_expira_em`;

// ===== Área do admin =====
export const relatoriosRouter = Router();
relatoriosRouter.use(requireAuth, requireRole("superadmin", "admin"));

relatoriosRouter.get("/", h(async (req, res) => {
  const r = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(`SELECT r.id, r.tipo, to_char(r.periodo_inicio,'YYYY-MM-DD') AS periodo_inicio, to_char(r.periodo_fim,'YYYY-MM-DD') AS periodo_fim, r.titulo, r.gerado_em,
                    coalesce(r.autor->>'nome', '') AS autor_nome, (r.link_token IS NOT NULL AND (r.link_expira_em IS NULL OR r.link_expira_em > now())) AS link_ativo, r.link_expira_em
               FROM relatorios r ORDER BY r.gerado_em DESC LIMIT 60`));
  res.json(r.rows);
}));

relatoriosRouter.post("/", h(async (req, res) => {
  const p = gerarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Dados inválidos." });
  const per = calcularPeriodo(p.data);
  if (typeof per === "string") return res.status(400).json({ error: per });
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const perfil = await carregarPerfil(c, req.auth!.sub);
    if (!perfil) return { erro: 404, msg: "Usuário não encontrado." };
    const falta = perfilCompleto(perfil);
    if (falta.length) return { erro: 409, msg: `Complete seu cadastro antes de gerar o primeiro relatório. Faltam: ${falta.join(", ")}.`, code: "perfil_incompleto" };
    const dados = await coletar(c, per.ini, per.fim);
    const ins = await c.query(
      `INSERT INTO relatorios (tipo, periodo_inicio, periodo_fim, titulo, dados, autor, gerado_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [p.data.tipo, per.ini, per.fim, per.titulo, JSON.stringify(dados), JSON.stringify(perfil), req.auth!.sub]
    );
    await registrarAuditoria(c, req.auth!.sub, "relatorio_gerado", "relatorios", ins.rows[0].id, { tipo: p.data.tipo, periodo: `${per.ini} a ${per.fim}` });
    return { id: ins.rows[0].id as string, titulo: per.titulo };
  });
  if ("erro" in out) return res.status(out.erro as number).json({ error: out.msg, code: (out as any).code });
  res.status(201).json(out);
}));

relatoriosRouter.get("/:id/pdf", h(async (req, res) => {
  const id = req.params.id as string;
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: "ID inválido." });
  const row = await withRole(req.auth!.role, req.auth!.sub, async (c) => (await c.query(`${SEL} FROM relatorios r WHERE r.id = $1`, [id])).rows[0]);
  if (!row) return res.status(404).json({ error: "Relatório não encontrado." });
  enviarPdf(res, paraRegistro(row), req.query.baixar === "1");
}));

const linkSchema = z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) });

relatoriosRouter.post("/:id/link", h(async (req, res) => {
  const id = req.params.id as string;
  const p = linkSchema.safeParse(req.body ?? {});
  if (!z.string().uuid().safeParse(id).success || !p.success) return res.status(400).json({ error: "Dados inválidos." });
  const token = crypto.randomBytes(32).toString("base64url");
  const r = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const u = await c.query(
      `UPDATE relatorios SET link_token = $2, link_expira_em = now() + ($3 || ' days')::interval, link_criado_em = now() WHERE id = $1 RETURNING link_expira_em`,
      [id, token, String(p.data.dias)]
    );
    if (!u.rows[0]) return null;
    await registrarAuditoria(c, req.auth!.sub, "relatorio_link_criado", "relatorios", id, { dias: p.data.dias });
    return u.rows[0];
  });
  if (!r) return res.status(404).json({ error: "Relatório não encontrado." });
  res.json({ url: `${env.frontendBaseUrl}/api/public/relatorios/${token}.pdf`, expira_em: r.link_expira_em });
}));

relatoriosRouter.delete("/:id/link", h(async (req, res) => {
  const id = req.params.id as string;
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: "ID inválido." });
  await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    await c.query(`UPDATE relatorios SET link_token = NULL, link_expira_em = NULL WHERE id = $1`, [id]);
    await registrarAuditoria(c, req.auth!.sub, "relatorio_link_revogado", "relatorios", id, null);
  });
  res.json({ ok: true });
}));

// ===== Link público (sem login): só quem tem o token longo e ainda válido =====
export const relatoriosPublicoRouter = Router();
const tentativas = new Map<string, { n: number; ate: number }>();

relatoriosPublicoRouter.get("/:token", h(async (req, res) => {
  const ip = String(req.ip ?? "?");
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (t && t.ate > agora && t.n >= 120) return res.status(429).send("Muitas tentativas. Aguarde um minuto.");
  if (!t || t.ate <= agora) tentativas.set(ip, { n: 1, ate: agora + 60_000 }); else t.n++;

  const token = String(req.params.token).replace(/\.pdf$/i, "");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(404).send("Link inválido ou expirado.");
  const row = await withRole("superadmin", "", async (c) =>
    (await c.query(`${SEL} FROM relatorios r WHERE r.link_token = $1 AND (r.link_expira_em IS NULL OR r.link_expira_em > now())`, [token])).rows[0]
  );
  if (!row) return res.status(404).send("Link inválido ou expirado.");
  enviarPdf(res, paraRegistro(row), false);
}));
