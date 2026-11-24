import { Router } from "express";
import { withRole } from "../db";
import { requireAuth } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/resumo", async (req, res) => {
  const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const porStatus = await c.query(
      `SELECT status, count(*)::int AS total FROM vehicles GROUP BY status`
    );
    const porBase = await c.query(
      `SELECT base, status, count(*)::int AS total FROM vehicles GROUP BY base, status ORDER BY base`
    );
    const porTipo = await c.query(
      `SELECT COALESCE(tipo, 'Não informado') AS tipo, count(*)::int AS total
       FROM vehicles GROUP BY tipo ORDER BY total DESC`
    );
    const manutencoesAbertas = await c.query(
      `SELECT count(*)::int AS total FROM maintenance_records WHERE status = 'Em andamento'`
    );
    const custoMes = await c.query(
      `SELECT COALESCE(sum(custo), 0)::numeric AS total
       FROM maintenance_records
       WHERE date_trunc('month', data_entrada) = date_trunc('month', CURRENT_DATE)`
    );
    return {
      por_status: porStatus.rows,
      por_base: porBase.rows,
      por_tipo: porTipo.rows,
      manutencoes_abertas: manutencoesAbertas.rows[0]?.total ?? 0,
      custo_mes_atual: custoMes.rows[0]?.total ?? 0,
    };
  });
  res.json(result);
});

// Relatórios detalhados (aba "Relatórios" do painel): resumo por base,
// manutenções por tipo/custo, custo mensal (6 meses) e ocorrências por
// tipo/status. Tudo calculado direto dos dados reais — nada estimado.
dashboardRouter.get("/relatorios", async (req, res) => {
  const result = await withRole(req.auth!.role, req.auth!.sub, async (c) => {
    const resumoPorBase = await c.query(
      `SELECT base,
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'Ativa')::int AS ativos,
              count(*) FILTER (WHERE status = 'Manutenção')::int AS manutencao,
              count(*) FILTER (WHERE status = 'Desmobilizado')::int AS desmobilizados,
              count(*) FILTER (WHERE status = 'Sem cooperado')::int AS sem_cooperado
       FROM vehicles GROUP BY base ORDER BY base`
    );
    const manutencaoPorTipo = await c.query(
      `SELECT tipo, count(*)::int AS total, COALESCE(sum(custo),0)::numeric AS custo
       FROM maintenance_records GROUP BY tipo ORDER BY total DESC`
    );
    const custoPorMes = await c.query(
      `SELECT to_char(date_trunc('month', data_entrada), 'YYYY-MM') AS mes,
              count(*)::int AS total, COALESCE(sum(custo),0)::numeric AS custo
       FROM maintenance_records
       WHERE data_entrada >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1 ORDER BY 1`
    );
    const ocorrenciasPorTipo = await c.query(
      `SELECT tipo, count(*)::int AS total FROM occurrences GROUP BY tipo ORDER BY total DESC`
    );
    const ocorrenciasPorStatus = await c.query(
      `SELECT status, count(*)::int AS total FROM occurrences GROUP BY status ORDER BY total DESC`
    );
    return {
      resumo_por_base: resumoPorBase.rows,
      manutencao_por_tipo: manutencaoPorTipo.rows,
      custo_por_mes: custoPorMes.rows,
      ocorrencias_por_tipo: ocorrenciasPorTipo.rows,
      ocorrencias_por_status: ocorrenciasPorStatus.rows,
    };
  });
  res.json(result);
});

// Evolução diária da frota, a partir dos snapshots importados (fleet_snapshots
// — ver 001_init.sql/003_seed_dados_reais.sql). Soma o total de todas as
// bases por dia, para dar a curva "Evolução" que o painel de referência
// mostra. Limitado aos últimos 90 dias para não crescer sem fim.
dashboardRouter.get("/evolucao", async (req, res) => {
  const rows = await withRole(req.auth!.role, req.auth!.sub, (c) =>
    c.query(
      `SELECT snapshot_date, sum(total)::int AS total
       FROM fleet_snapshots
       WHERE snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
       GROUP BY snapshot_date
       ORDER BY snapshot_date`
    )
  );
  res.json(rows.rows);
});
