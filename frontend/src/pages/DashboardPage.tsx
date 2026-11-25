import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";
import OperationalMap from "../components/OperationalMap";
import { BarraEmpilhadaHorizontal, BarraVertical, LinhaEvolucao, Rosca } from "../components/Charts";

interface Relatorios {
  resumo_por_base: {
    base: string;
    total: number;
    ativos: number;
    manutencao: number;
    desmobilizados: number;
    sem_cooperado: number;
  }[];
  manutencao_por_tipo: { tipo: string; total: number; custo: string }[];
  custo_por_mes: { mes: string; total: number; custo: string }[];
  ocorrencias_por_tipo: { tipo: string; total: number }[];
  ocorrencias_por_status: { status: string; total: number }[];
}

const NOMES_OCORRENCIA: Record<string, string> = {
  manutencao_solicitada: "Manutenção solicitada",
  sinistro: "Sinistro",
  avaria: "Avaria",
  acidente: "Acidente",
  multa: "Multa",
  outro: "Outro",
};

const brl = (v: string | number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

type Aba = "visao_geral" | "evolucao" | "relatorios";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [evolucao, setEvolucao] = useState<PontoEvolucao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("visao_geral");
  const [relatorios, setRelatorios] = useState<Relatorios | null>(null);

  useEffect(() => {
    if (aba === "relatorios" && !relatorios) {
      api
        .get<Relatorios>("/dashboard/relatorios")
        .then((r) => setRelatorios(r.data))
        .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar os relatórios.")));
    }
  }, [aba, relatorios]);

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

  const videoHero = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // Respeita "reduzir movimento": mostra só o quadro final, sem animação.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) videoHero.current?.pause();
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
          <span className="hero-selo">
            {totalVeiculos > 0 ? `${totalVeiculos} veículos · ` : ""}SMG3, SMG5, SMG9
          </span>
          {["superadmin", "admin"].includes(usuario?.role ?? "") && (
            <div style={{ marginTop: 14 }}><button className="btn btn-primario" style={{ width: "auto" }} onClick={() => navigate("/relatorios")}>Gerar relatório em PDF</button></div>
          )}
        </div>
        <div className="hero-painel-midia" aria-hidden="true">
          <video
            ref={videoHero}
            src="/hero-painel.mp4"
            poster="/hero-painel-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
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
            <button className={aba === "relatorios" ? "ativo" : ""} onClick={() => setAba("relatorios")}>
              Relatórios
            </button>
          </div>

          <div className="cards-resumo">
            <div className="card-stat card-stat-navy">
              <div className="valor">{totalVeiculos}</div>
              <div className="rotulo">Veículos</div>
              <div className="kpi-barra" aria-hidden="true"><span style={{ width: "100%", background: "var(--ink)" }} /></div>
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
              <div className="kpi-barra" aria-hidden="true"><span style={{ width: `${totalVeiculos ? Math.round(((porStatusMapa["Ativa"] ?? 0) / totalVeiculos) * 100) : 0}%`, background: "#10b981" }} /></div>
            </div>
            <div className="card-stat card-stat-warning">
              <div className="valor">{porStatusMapa["Manutenção"] ?? 0}</div>
              <div className="rotulo">Manutenção</div>
              {resumo.manutencoes_abertas > 0 && (
                <span className="kpi-selo">{resumo.manutencoes_abertas} OS abertas</span>
              )}
              <div className="kpi-barra" aria-hidden="true"><span style={{ width: `${totalVeiculos ? Math.round(((porStatusMapa["Manutenção"] ?? 0) / totalVeiculos) * 100) : 0}%`, background: "#f59e0b" }} /></div>
            </div>
            <div className="card-stat card-stat-muted">
              <div className="valor">{porStatusMapa["Desmobilizado"] ?? 0}</div>
              <div className="rotulo">Desmobilizados</div>
              <div className="kpi-barra" aria-hidden="true"><span style={{ width: `${totalVeiculos ? Math.round(((porStatusMapa["Desmobilizado"] ?? 0) / totalVeiculos) * 100) : 0}%`, background: "#64748b" }} /></div>
            </div>
            <div className="card-stat card-stat-danger">
              <div className="valor">{porStatusMapa["Sem cooperado"] ?? 0}</div>
              <div className="rotulo">Sem cooperado</div>
              <div className="kpi-barra" aria-hidden="true"><span style={{ width: `${totalVeiculos ? Math.round(((porStatusMapa["Sem cooperado"] ?? 0) / totalVeiculos) * 100) : 0}%`, background: "#ef4444" }} /></div>
            </div>
          </div>

          {aba === "visao_geral" && (
            <>
              <OperationalMap
                porBase={resumo.por_base}
                onFiltrarBase={(codigo) => navigate(`/veiculos?base=${encodeURIComponent(codigo)}`)}
              />
              <div className="grade-2col">
                <div className="painel">
                  <h2>Veículos por base e status</h2>
                  <BarraEmpilhadaHorizontal dados={dadosPorBase} seriesOrdem={ORDEM_STATUS} />
                </div>
                <div className="painel">
                  <h2>Veículos por tipo</h2>
                  <Rosca dados={(resumo.por_tipo ?? []).map((t) => ({ rotulo: t.tipo, valor: t.total }))} />
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

          {aba === "relatorios" && (
            <>
              {!relatorios && <p className="carregando">Carregando relatórios...</p>}
              {relatorios && (
                <>
                  <div className="painel">
                    <h2>Resumo por base</h2>
                    <table>
                      <thead>
                        <tr>
                          <th>Base</th>
                          <th>Total</th>
                          <th>Ativos</th>
                          <th>Manutenção</th>
                          <th>Desmobilizados</th>
                          <th>Sem cooperado</th>
                          <th>Disponibilidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatorios.resumo_por_base.map((b) => {
                          const disp = b.total ? Math.round((b.ativos / b.total) * 100) : 0;
                          return (
                            <tr key={b.base}>
                              <td><strong>{b.base}</strong></td>
                              <td>{b.total}</td>
                              <td>{b.ativos}</td>
                              <td>{b.manutencao}</td>
                              <td>{b.desmobilizados}</td>
                              <td>{b.sem_cooperado}</td>
                              <td>
                                <div className="barra-disp">
                                  <div className="barra-disp-preenchida" style={{ width: `${disp}%` }} />
                                  <span>{disp}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grade-2col">
                    <div className="painel">
                      <h2>Manutenções por tipo</h2>
                      {relatorios.manutencao_por_tipo.length === 0 ? (
                        <p className="vazio">Sem manutenções registradas.</p>
                      ) : (
                        <>
                          <BarraVertical
                            dados={relatorios.manutencao_por_tipo.map((m) => ({ rotulo: m.tipo, valor: m.total }))}
                          />
                          <table style={{ marginTop: 12 }}>
                            <tbody>
                              {relatorios.manutencao_por_tipo.map((m) => (
                                <tr key={m.tipo}>
                                  <td>{m.tipo}</td>
                                  <td style={{ textAlign: "right" }}>{brl(m.custo)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                    <div className="painel">
                      <h2>Custo de manutenção — últimos 6 meses</h2>
                      {relatorios.custo_por_mes.length === 0 ? (
                        <p className="vazio">Sem custos lançados no período.</p>
                      ) : (
                        <BarraVertical
                          cor="#71717a"
                          dados={relatorios.custo_por_mes.map((m) => ({
                            rotulo: m.mes.split("-").reverse().join("/"),
                            valor: Math.round(Number(m.custo)),
                          }))}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grade-2col">
                    <div className="painel">
                      <h2>Ocorrências por tipo</h2>
                      {relatorios.ocorrencias_por_tipo.length === 0 ? (
                        <p className="vazio">Nenhuma ocorrência registrada.</p>
                      ) : (
                        <BarraVertical
                          cor="#ef4444"
                          dados={relatorios.ocorrencias_por_tipo.map((o) => ({
                            rotulo: NOMES_OCORRENCIA[o.tipo] ?? o.tipo,
                            valor: o.total,
                          }))}
                        />
                      )}
                    </div>
                    <div className="painel">
                      <h2>Ocorrências por status</h2>
                      {relatorios.ocorrencias_por_status.length === 0 ? (
                        <p className="vazio">Nenhuma ocorrência registrada.</p>
                      ) : (
                        <BarraVertical
                          cor="#10b981"
                          dados={relatorios.ocorrencias_por_status.map((o) => ({ rotulo: o.status, valor: o.total }))}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
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
