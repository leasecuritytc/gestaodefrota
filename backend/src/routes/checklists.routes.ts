import { Router } from "express";
import { z } from "zod";
import { withRole } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { autorParaPdf, pdfChecklistsVec } from "../exportPdf";

export const checklistsRouter = Router();
checklistsRouter.use(requireAuth, requireRole("superadmin", "admin"));

const filtroSchema = z.object({
  q: z.string().max(40).optional(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  falhas: z.enum(["1"]).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

// Lista de checklists (inspeções) sincronizados da VEC + totais do filtro.
checklistsRouter.get("/", async (req, res) => {
  const p = filtroSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Filtros inválidos." });
  const f = p.data;
  const cond: string[] = [];
  const args: unknown[] = [];
  if (f.q) {
    args.push(`%${f.q.toUpperCase()}%`);
    cond.push(`(upper(placa) LIKE $${args.length} OR upper(coalesce(svc,'')) LIKE $${args.length} OR upper(coalesce(motorista,'')) LIKE $${args.length})`);
  }
  if (f.de) {
    args.push(f.de);
    cond.push(`data_hora >= $${args.length}::date`);
  }
  if (f.ate) {
    args.push(f.ate);
    cond.push(`data_hora < ($${args.length}::date + 1)`);
  }
  if (f.falhas) cond.push(`num_falhas > 0`);
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  try {
    const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
      const totais = await c.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE num_falhas > 0)::int AS com_falhas,
                coalesce(sum(num_falhas),0)::int AS falhas,
                count(DISTINCT placa)::int AS veiculos,
                max(data_hora) AS ultimo
         FROM checklist_events ${where}`,
        args
      );
      const linhas = await c.query(
        `SELECT id, placa, tipo_formulario, data_hora, svc, unidade, transportadora, rentadora,
                subregiao, motorista, usuario_vec, num_falhas
         FROM checklist_events ${where}
         ORDER BY data_hora DESC
         LIMIT ${f.limite}`,
        args
      );
      return { totais: totais.rows[0], linhas: linhas.rows };
    });
    res.json(out);
  } catch (err) {
    console.error("[checklists] erro:", err);
    res.status(500).json({ error: "Falha ao ler os checklists." });
  }
});

// PDF dos checklists da VEC por período (de/ate obrigatórios). Mesmo cabeçalho/rodapé dos relatórios.
checklistsRouter.get("/pdf", async (req, res) => {
  const p = filtroSchema.extend({ de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: "Escolha a data inicial e a final." });
  const f = p.data;
  if (f.de > f.ate) return res.status(400).json({ error: "A data inicial não pode ser depois da final." });
  const cond = [`data_hora >= $1::date`, `data_hora < ($2::date + 1)`];
  const args: unknown[] = [f.de, f.ate];
  if (f.q) { args.push(`%${f.q.toUpperCase()}%`); cond.push(`(upper(placa) LIKE $${args.length} OR upper(coalesce(svc,'')) LIKE $${args.length} OR upper(coalesce(motorista,'')) LIKE $${args.length})`); }
  if (f.falhas) cond.push(`num_falhas > 0`);
  const where = `WHERE ${cond.join(" AND ")}`;
  const LIM = 400;
  const out = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const aut = await autorParaPdf(c, req.auth!.sub);
    if ("erro" in aut) return { erro: aut.erro };
    const totais = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE num_falhas > 0)::int AS com_falhas, coalesce(sum(num_falhas),0)::int AS falhas, count(DISTINCT placa)::int AS veiculos FROM checklist_events ${where}`, args)).rows[0];
    const linhas = (await c.query(`SELECT data_hora, placa, svc, tipo_formulario, motorista, num_falhas FROM checklist_events ${where} ORDER BY data_hora DESC LIMIT ${LIM}`, args)).rows;
    const porVeiculo = (await c.query(`SELECT placa, count(*)::int AS total, coalesce(sum(num_falhas),0)::int AS falhas FROM checklist_events ${where} GROUP BY placa HAVING sum(num_falhas) > 0 ORDER BY sum(num_falhas) DESC LIMIT 10`, args)).rows;
    return { autor: aut.autor, totais, linhas, porVeiculo };
  });
  if ("erro" in out) return res.status(409).json({ error: out.erro, code: "perfil_incompleto" });
  const filtro = [f.q ? `busca "${f.q}"` : "", f.falhas ? "só com falhas" : ""].filter(Boolean).join(", ");
  const doc = pdfChecklistsVec({ autor: out.autor, de: f.de, ate: f.ate, filtro, totais: out.totais, linhas: out.linhas, porVeiculo: out.porVeiculo, truncado: out.totais.total > out.linhas.length });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="checklists_vec_${f.de}_${f.ate}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  doc.pipe(res); doc.end();
});
