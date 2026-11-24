import { useEffect, useState } from "react";
import { API_URL, api, mensagemErro } from "../api";

interface EventoAuditoria {
  id: string;
  created_at: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  usuario_email: string | null;
  usuario_nome: string | null;
}

export default function AuditoriaPage() {
  const [lista, setLista] = useState<EventoAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [entidade, setEntidade] = useState("");

  function carregar() {
    setErro(null);
    api
      .get<EventoAuditoria[]>("/audit", {
        params: {
          desde: desde || undefined,
          ate: ate || undefined,
          entidade: entidade || undefined,
        },
      })
      .then((r) => setLista(r.data))
      .catch((err) =>
        setErro(
          mensagemErro(
            err,
            "Não foi possível carregar a auditoria. Pode ser que seu papel ainda não tenha acesso liberado."
          )
        )
      );
  }

  useEffect(carregar, []);

  function exportarCsv() {
    const token = localStorage.getItem("gdf_token");
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (ate) params.set("ate", ate);
    if (entidade) params.set("entidade", entidade);
    // O download precisa do token no cabeçalho Authorization, então não dá
    // pra só abrir o link — buscamos o arquivo e disparamos o download.
    fetch(`${API_URL}/audit/export.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "auditoria-gestao-de-frota.csv";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErro("Não foi possível exportar o CSV."));
  }

  return (
    <>
      <h1>Auditoria</h1>
      <p className="descricao-pagina">
        Registro de ações para reuniões e assuntos internos — acesso restrito a superadmin e
        admins autorizados.
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div className="filtros">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          <select value={entidade} onChange={(e) => setEntidade(e.target.value)}>
            <option value="">Todas as entidades</option>
            <option value="vehicles">Veículos</option>
            <option value="users">Usuários</option>
            <option value="occurrences">Ocorrências</option>
          </select>
          <button className="btn btn-secundario" onClick={carregar}>
            Filtrar
          </button>
        </div>
        <button className="btn btn-primario" onClick={exportarCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="painel">
        {lista && lista.length === 0 && <p className="vazio">Nenhum evento encontrado.</p>}
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                  <td>{e.usuario_nome ?? e.usuario_email ?? "—"}</td>
                  <td>{e.acao}</td>
                  <td>{e.entidade}</td>
                  <td>{e.detalhes ? JSON.stringify(e.detalhes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
