import { useEffect, useState } from "react";
import { api, mensagemErro } from "../api";

interface Resumo {
  por_status: { status: string; total: number }[];
  por_base: { base: string; status: string; total: number }[];
  manutencoes_abertas: number;
  custo_mes_atual: string;
}

function tagClasse(status: string) {
  return "tag tag-" + status.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function DashboardPage() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Resumo>("/dashboard/resumo")
      .then((r) => setResumo(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar o painel.")));
  }, []);

  const totalVeiculos = resumo?.por_status.reduce((acc, s) => acc + s.total, 0) ?? 0;
  const custoFormatado = resumo
    ? Number(resumo.custo_mes_atual).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

  const bases = Array.from(new Set(resumo?.por_base.map((b) => b.base) ?? []));

  return (
    <>
      <h1>Painel</h1>
      <p className="descricao-pagina">Visão geral da frota, atualizada em tempo real.</p>
      {erro && <div className="erro">{erro}</div>}
      {!resumo && !erro && <p className="carregando">Carregando...</p>}
      {resumo && (
        <>
          <div className="cards-resumo">
            <div className="card-stat">
              <div className="valor">{totalVeiculos}</div>
              <div className="rotulo">Veículos na frota</div>
            </div>
            <div className="card-stat">
              <div className="valor">{resumo.manutencoes_abertas}</div>
              <div className="rotulo">Manutenções em andamento</div>
            </div>
            <div className="card-stat">
              <div className="valor">{custoFormatado}</div>
              <div className="rotulo">Custo de manutenção (mês atual)</div>
            </div>
            {resumo.por_status.map((s) => (
              <div className="card-stat" key={s.status}>
                <div className="valor">{s.total}</div>
                <div className="rotulo">
                  <span className={tagClasse(s.status)}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="painel">
            <h2>Veículos por base</h2>
            <table>
              <thead>
                <tr>
                  <th>Base</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {bases.flatMap((base) =>
                  resumo.por_base
                    .filter((b) => b.base === base)
                    .map((b) => (
                      <tr key={base + b.status}>
                        <td>{base}</td>
                        <td>
                          <span className={tagClasse(b.status)}>{b.status}</span>
                        </td>
                        <td>{b.total}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
