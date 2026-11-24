import { useEffect, useState } from "react";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

interface Veiculo {
  id: string;
  placa: string;
  chassi: string | null;
  base: string;
  tipo: string | null;
  rentadora: string | null;
  transportadora: string | null;
  subregiao: string | null;
  status: string;
  observacoes: string | null;
  motorista_atual_id: string | null;
  motorista_nome: string | null;
}

interface Motorista {
  id: string;
  nome: string;
  telefone: string | null;
}

function tagClasse(status: string) {
  return "tag tag-" + status.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PAPEIS_QUE_TROCAM_MOTORISTA = ["superadmin", "admin", "gestor_base"];

export default function VeiculosPage() {
  const { usuario } = useAuth();
  const podeTrocarMotorista = !!usuario && PAPEIS_QUE_TROCAM_MOTORISTA.includes(usuario.role);

  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroBase, setFiltroBase] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [novoMotoristaId, setNovoMotoristaId] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  function carregar() {
    api
      .get<Veiculo[]>("/vehicles")
      .then((r) => setVeiculos(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar os veículos.")));
    if (podeTrocarMotorista) {
      api
        .get<Motorista[]>("/drivers")
        .then((r) => setMotoristas(r.data))
        .catch(() => undefined);
    }
  }

  useEffect(carregar, [podeTrocarMotorista]);

  const bases = Array.from(new Set(veiculos?.map((v) => v.base) ?? [])).sort();
  const statusList = Array.from(new Set(veiculos?.map((v) => v.status) ?? [])).sort();

  const filtrados = (veiculos ?? []).filter((v) => {
    if (filtroBase && v.base !== filtroBase) return false;
    if (filtroStatus && v.status !== filtroStatus) return false;
    if (busca) {
      const alvo = `${v.placa} ${v.motorista_nome ?? ""}`.toLowerCase();
      if (!alvo.includes(busca.toLowerCase())) return false;
    }
    return true;
  });

  function abrirTroca(v: Veiculo) {
    setEditando(v);
    setNovoMotoristaId(v.motorista_atual_id ?? "");
    setErroModal(null);
  }

  async function salvarTroca() {
    if (!editando) return;
    setSalvando(true);
    setErroModal(null);
    try {
      await api.patch(`/vehicles/${editando.id}/motorista`, {
        driver_id: novoMotoristaId || null,
      });
      setEditando(null);
      carregar();
    } catch (err) {
      setErroModal(mensagemErro(err, "Não foi possível trocar o motorista."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <h1>Veículos</h1>
      <p className="descricao-pagina">
        {veiculos ? `${filtrados.length} de ${veiculos.length} veículos` : "Carregando..."}
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div className="filtros">
          <input
            placeholder="Buscar placa ou motorista..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={filtroBase} onChange={(e) => setFiltroBase(e.target.value)}>
            <option value="">Todas as bases</option>
            {bases.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {statusList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="painel">
        {veiculos && filtrados.length === 0 && <p className="vazio">Nenhum veículo encontrado.</p>}
        {filtrados.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Base</th>
                <th>Status</th>
                <th>Rentadora</th>
                <th>Motorista atual</th>
                <th>Observações</th>
                {podeTrocarMotorista && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.placa}</strong>
                  </td>
                  <td>{v.base}</td>
                  <td>
                    <span className={tagClasse(v.status)}>{v.status}</span>
                  </td>
                  <td>{v.rentadora ?? "—"}</td>
                  <td>{v.motorista_nome ?? "Sem cooperado"}</td>
                  <td>{v.observacoes ?? "—"}</td>
                  {podeTrocarMotorista && (
                    <td>
                      <button className="btn btn-secundario" onClick={() => abrirTroca(v)}>
                        Trocar motorista
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <div className="modal-fundo" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Trocar motorista — {editando.placa}</h2>
            {erroModal && <div className="erro">{erroModal}</div>}
            <div className="campo">
              <label>Motorista atual: {editando.motorista_nome ?? "Sem cooperado"}</label>
            </div>
            <div className="campo">
              <label htmlFor="novo-motorista">Novo motorista</label>
              <select
                id="novo-motorista"
                value={novoMotoristaId}
                onChange={(e) => setNovoMotoristaId(e.target.value)}
              >
                <option value="">— Sem cooperado —</option>
                {motoristas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn btn-primario" onClick={salvarTroca} disabled={salvando}>
                {salvando ? "Salvando..." : "Confirmar troca"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
