import { useEffect, useState } from "react";
import { api, mensagemErro } from "../api";
import { BarraEmpilhadaHorizontal, BarraVertical, LinhaEvolucao } from "../components/Charts";

interface Resumo {
  por_status: { status: string; total: number }[];
  por_base: { base: string; status: string; total: number }[];
  por_tipo: { tipo: string; total: number }[];
  manutencoes_abertas: number;
  custo_mes_atual: string;
}

interface PontoEvolucao {
  snapshot_date: string;
  total: number;
}

const ORDEM_STATUS = ["Ativa", "Manutenção", "Desmobilizado", "Sem cooperado"];

type Aba = "visao_geral" | "evolucao";

export default function DashboardPage() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [evolucao, setEvolucao] = useState<PontoEvolucao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("visao_geral");

  useEffect(() => {
    api
      .get<Resumo>("/dashboard/resumo")
      .then((r) => setResumo(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar o painel.")));
    api
      .get<PontoEvolucao[]>("/dashboard/evolucao")
      .then((r) => setEvolucao(r.data))
      .catch(() => setEvolucao([]));
  }, []);

  const totalVeiculos = resumo?.por_status.reduce((acc, s) => acc + s.total, 0) ?? 0;
  const porStatusMapa = Object.fromEntries((resumo?.por_status ?? []).map((s) => [s.status, s.total]));
  const custoFormatado = resumo
    ? Number(resumo.custo_mes_atual).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

  const bases = Array.from(new Set(resumo?.por_base.map((b) => b.base) ?? [])).sort();
  const dadosPorBase = bases.map((base) => ({
    grupo: base,
    series: Object.fromEntries(
      (resumo?.por_base ?? []).filter((b) => b.base === base).map((b) => [b.status, b.total])
    ),
  }));

  return (
    <>
      <div className="hero-painel">
        <div className="hero-painel-conteudo">
          <h1>Painel</h1>
          <p className="descricao-pagina">Visão geral da frota RodaCoop, atualizada em tempo real.</p>
        </div>
      </div>

      {erro && <div className="erro">{erro}</div>}
      {!resumo && !erro && <p className="carregando">Carregando...</p>}

      {resumo && (
        <>
          <div className="abas">
            <button className={aba === "visao_geral" ? "ativo" : ""} onClick={() => setAba("visao_geral")}>
              Visão geral
            </button>
            <button className={aba === "evolucao" ? "ativo" : ""} onClick={() => setAba("evolucao")}>
              Evolução
            </button>
          </div>

          <div className="cards-resumo">
            <div className="card-stat card-stat-navy">
              <div className="valor">{totalVeiculos}</div>
              <div className="rotulo">Veículos</div>
            </div>
            <div className="card-stat card-stat-success">
              <div className="valor">{porStatusMapa["Ativa"] ?? 0}</div>
              <div className="rotulo">
                Ativos
                {totalVeiculos > 0 && (
                  <span className="rotulo-sub">
                    {Math.round(((porStatusMapa["Ativa"] ?? 0) / totalVeiculos) * 100)}% da frota
                  </span>
                )}
              </div>
            </div>
            <div className="card-stat card-stat-warning">
              <div className="valor">{porStatusMapa["Manutenção"] ?? 0}</div>
              <div className="rotulo">Manutenção</div>
            </div>
            <div className="card-stat card-stat-muted">
              <div className="valor">{porStatusMapa["Desmobilizado"] ?? 0}</div>
              <div className="rotulo">Desmobilizados</div>
            </div>
            <div className="card-stat card-stat-danger">
              <div className="valor">{porStatusMapa["Sem cooperado"] ?? 0}</div>
              <div className="rotulo">Sem cooperado</div>
            </div>
          </div>

          {aba === "visao_geral" && (
            <>
              <div className="grade-2col">
                <div className="painel">
                  <h2>Veículos por base e status</h2>
                  <BarraEmpilhadaHorizontal dados={dadosPorBase} seriesOrdem={ORDEM_STATUS} />
                </div>
                <div className="painel">
                  <h2>Veículos por tipo</h2>
                  <BarraVertical dados={(resumo.por_tipo ?? []).map((t) => ({ rotulo: t.tipo, valor: t.total }))} />
                </div>
              </div>

              <div className="cards-resumo cards-resumo-secundarios">
                <div className="card-stat">
                  <div className="valor">{resumo.manutencoes_abertas}</div>
                  <div className="rotulo">Manutenções em andamento</div>
                </div>
                <div className="card-stat">
                  <div className="valor">{custoFormatado}</div>
                  <div className="rotulo">Custo de manutenção (mês atual)</div>
                </div>
              </div>
            </>
          )}

          {aba === "evolucao" && (
            <div className="painel">
              <h2>Evolução diária da frota</h2>
              {evolucao === null && <p className="carregando">Carregando...</p>}
              {evolucao && (
                <LinhaEvolucao pontos={evolucao.map((p) => ({ data: p.snapshot_date, valor: p.total }))} />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
