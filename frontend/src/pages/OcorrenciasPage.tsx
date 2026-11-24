import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

interface Ocorrencia {
  id: string;
  vehicle_id: string;
  placa: string;
  driver_id: string | null;
  tipo: string;
  descricao: string;
  local: string | null;
  data_hora: string;
  status: string;
  maintenance_id: string | null;
  resolved_at: string | null;
}

const TIPOS = [
  { valor: "manutencao_solicitada", rotulo: "Manutenção solicitada" },
  { valor: "sinistro", rotulo: "Sinistro" },
  { valor: "avaria", rotulo: "Avaria" },
  { valor: "acidente", rotulo: "Acidente" },
  { valor: "multa", rotulo: "Multa" },
  { valor: "outro", rotulo: "Outro" },
];

const STATUS_LABEL: Record<string, string> = {
  em_analise: "Em análise",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  resolvida: "Resolvida",
};

const PODE_ENCAMINHAR = ["superadmin", "admin", "gestor_base"];

export default function OcorrenciasPage() {
  const { usuario } = useAuth();
  const podeEncaminhar = !!usuario && PODE_ENCAMINHAR.includes(usuario.role);

  const [lista, setLista] = useState<Ocorrencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [placa, setPlaca] = useState("");
  const [tipo, setTipo] = useState(TIPOS[0].valor);
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api
      .get<Ocorrencia[]>("/occurrences")
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar as ocorrências.")));
  }

  useEffect(carregar, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      await api.post("/occurrences", { placa, tipo, descricao, local: local || undefined });
      setMostrarForm(false);
      setPlaca("");
      setDescricao("");
      setLocal("");
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível registrar a ocorrência."));
    } finally {
      setSalvando(false);
    }
  }

  async function atualizarStatus(id: string, status: string) {
    try {
      await api.patch(`/occurrences/${id}`, { status });
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível atualizar a ocorrência."));
    }
  }

  return (
    <>
      <h1>Ocorrências</h1>
      <p className="descricao-pagina">
        Manutenções solicitadas, sinistros, avarias, acidentes e multas reportados pelos motoristas
        e pela equipe.
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div />
        <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Reportar ocorrência"}
        </button>
      </div>

      {mostrarForm && (
        <form className="painel" onSubmit={criar}>
          <h2>Nova ocorrência</h2>
          {erroForm && <div className="erro">{erroForm}</div>}
          <div className="campo">
            <label>Placa do veículo</label>
            <input required value={placa} onChange={(e) => setPlaca(e.target.value)} />
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Local (opcional)</label>
            <input value={local} onChange={(e) => setLocal(e.target.value)} />
          </div>
          <div className="campo">
            <label>Descrição</label>
            <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <button className="btn btn-primario" disabled={salvando}>
            {salvando ? "Enviando..." : "Enviar"}
          </button>
        </form>
      )}

      <div className="painel">
        {lista && lista.length === 0 && <p className="vazio">Nenhuma ocorrência encontrada.</p>}
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Data</th>
                <th>Status</th>
                {podeEncaminhar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.placa}</strong>
                  </td>
                  <td>{TIPOS.find((t) => t.valor === o.tipo)?.rotulo ?? o.tipo}</td>
                  <td>{o.descricao}</td>
                  <td>{new Date(o.data_hora).toLocaleString("pt-BR")}</td>
                  <td>
                    <span className={`tag tag-${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                  </td>
                  {podeEncaminhar && (
                    <td>
                      {o.status !== "resolvida" && o.status !== "rejeitada" && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) atualizarStatus(o.id, e.target.value);
                          }}
                        >
                          <option value="" disabled>
                            Mudar status...
                          </option>
                          <option value="em_analise">Em análise</option>
                          <option value="aprovada">Aprovada</option>
                          <option value="rejeitada">Rejeitada</option>
                          <option value="resolvida">Resolvida</option>
                        </select>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
