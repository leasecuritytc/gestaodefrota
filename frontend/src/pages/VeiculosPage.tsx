import { useEffect, useState } from "react";
import { api, mensagemErro } from "../api";
import { useAuth, PAPEIS_ADMIN } from "../auth";

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
  vec_estado: string | null;
  vec_km: string | null;
  vec_ultimo_bip: string | null;
}

interface VeiculoVec {
  placa: string;
  estado: string | null;
  modelo: string | null;
  tipo: string | null;
  subregiao: string | null;
  svc: string | null;
  locadora: string | null;
  km: string | null;
  ultimo_bip: string | null;
  cadastrado: boolean;
}

interface StatusVec {
  configurado: boolean;
  ultimas: { iniciado_em: string; ok: boolean | null; veiculos: number; checklists: number; erro: string | null; origem: string }[];
}

function fmtData(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function fmtKm(v: string | null) {
  return v ? `${Number(v).toLocaleString("pt-BR")} km` : "—";
}

function tagVec(estado: string | null) {
  const e = (estado ?? "").toUpperCase();
  if (e.includes("MANUTEN")) return "tag tag-manutencao";
  if (e.includes("OCIOS")) return "tag tag-inativo";
  if (e.includes("ATIVO") || e.includes("BIPANDO")) return "tag tag-ativa";
  return "tag tag-inativo";
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
const STATUS_OPCOES = ["Ativa", "Manutenção", "Desmobilizado", "Sem cooperado"];

export default function VeiculosPage() {
  const { usuario } = useAuth();
  const podeTrocarMotorista = !!usuario && PAPEIS_QUE_TROCAM_MOTORISTA.includes(usuario.role);
  const podeEditar = !!usuario && (PAPEIS_ADMIN as readonly string[]).includes(usuario.role);

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

  const [editandoDados, setEditandoDados] = useState<Veiculo | null>(null);
  const [formDados, setFormDados] = useState<Partial<Veiculo>>({});
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [erroModalDados, setErroModalDados] = useState<string | null>(null);

  const [aba, setAba] = useState<"base" | "vec">("base");
  const [frotaVec, setFrotaVec] = useState<VeiculoVec[] | null>(null);
  const [buscaVec, setBuscaVec] = useState("");
  const [statusVec, setStatusVec] = useState<StatusVec | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSync, setMsgSync] = useState<string | null>(null);

  function carregarVec() {
    api.get<VeiculoVec[]>("/vehicles/vec").then((r) => setFrotaVec(r.data)).catch(() => setFrotaVec([]));
    if (podeEditar) {
      api.get<StatusVec>("/sync/vec/status").then((r) => setStatusVec(r.data)).catch(() => undefined);
    }
  }

  useEffect(carregarVec, [podeEditar]);

  async function sincronizarVec() {
    setSincronizando(true);
    setMsgSync(null);
    try {
      const { data } = await api.post("/sync/vec");
      if (data.skipped) setMsgSync(data.skipped);
      else if (data.ok) setMsgSync(`Sincronizado: ${data.veiculos} veículos e ${data.checklists} checklists da VEC.`);
      else setMsgSync(`Falha na sincronização: ${data.erro}`);
      carregar();
      carregarVec();
    } catch (err) {
      setMsgSync(mensagemErro(err, "Não foi possível sincronizar com a VEC."));
    } finally {
      setSincronizando(false);
    }
  }

  const vecFiltrada = (frotaVec ?? []).filter((v) =>
    !buscaVec ? true : `${v.placa} ${v.svc ?? ""} ${v.modelo ?? ""}`.toLowerCase().includes(buscaVec.toLowerCase())
  );

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

  function abrirEdicaoDados(v: Veiculo) {
    setEditandoDados(v);
    setFormDados({
      status: v.status,
      base: v.base,
      tipo: v.tipo,
      rentadora: v.rentadora,
      transportadora: v.transportadora,
      subregiao: v.subregiao,
      observacoes: v.observacoes,
    });
    setErroModalDados(null);
  }

  async function salvarDados() {
    if (!editandoDados) return;
    setSalvandoDados(true);
    setErroModalDados(null);
    try {
      await api.patch(`/vehicles/${editandoDados.id}`, formDados);
      setEditandoDados(null);
      carregar();
    } catch (err) {
      setErroModalDados(mensagemErro(err, "Não foi possível salvar as alterações."));
    } finally {
      setSalvandoDados(false);
    }
  }

  return (
    <>
      <h1>Veículos</h1>
      <p className="descricao-pagina">
        {veiculos ? `${filtrados.length} de ${veiculos.length} veículos` : "Carregando..."}
      </p>
      {erro && <div className="erro">{erro}</div>}

      {podeEditar && statusVec && (
        <div className="painel painel-integracao">
          <div>
            <h2>Integração VEC</h2>
            {!statusVec.configurado && (
              <p className="vazio" style={{ textAlign: "left", padding: 0 }}>
                Login da VEC ainda não configurado no servidor.
              </p>
            )}
            {statusVec.configurado && statusVec.ultimas[0] && (
              <p style={{ margin: 0, fontSize: 13 }}>
                Última sincronização: {fmtData(statusVec.ultimas[0].iniciado_em)} —{" "}
                {statusVec.ultimas[0].ok
                  ? `${statusVec.ultimas[0].veiculos} veículos, ${statusVec.ultimas[0].checklists} checklists`
                  : statusVec.ultimas[0].ok === false
                    ? `falhou: ${statusVec.ultimas[0].erro}`
                    : "em andamento"}
              </p>
            )}
            {msgSync && <p style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 600 }}>{msgSync}</p>}
          </div>
          <button className="btn btn-primario" style={{ width: "auto" }} onClick={sincronizarVec} disabled={sincronizando || !statusVec.configurado}>
            {sincronizando ? "Sincronizando..." : "Sincronizar VEC agora"}
          </button>
        </div>
      )}

      <div className="abas">
        <button className={aba === "base" ? "ativo" : ""} onClick={() => setAba("base")}>
          Frota cadastrada
        </button>
        <button className={aba === "vec" ? "ativo" : ""} onClick={() => setAba("vec")}>
          Frota na VEC {frotaVec && frotaVec.length > 0 ? `(${frotaVec.length})` : ""}
        </button>
      </div>

      {aba === "vec" && (
        <div className="painel">
          <div className="barra-topo">
            <div className="filtros">
              <input placeholder="Buscar placa, SVC ou modelo..." value={buscaVec} onChange={(e) => setBuscaVec(e.target.value)} />
            </div>
          </div>
          {frotaVec && frotaVec.length === 0 && (
            <p className="vazio">Nenhum dado da VEC ainda — rode uma sincronização.</p>
          )}
          {vecFiltrada.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Estado VEC</th>
                  <th>SVC</th>
                  <th>Modelo</th>
                  <th>Locadora</th>
                  <th>Km</th>
                  <th>Último BIP</th>
                  <th>Cadastrado aqui</th>
                </tr>
              </thead>
              <tbody>
                {vecFiltrada.map((v) => (
                  <tr key={v.placa}>
                    <td><strong>{v.placa}</strong></td>
                    <td><span className={tagVec(v.estado)}>{v.estado ?? "—"}</span></td>
                    <td>{v.svc ?? "—"}</td>
                    <td>{v.modelo ?? "—"}</td>
                    <td>{v.locadora ?? "—"}</td>
                    <td>{fmtKm(v.km)}</td>
                    <td>{fmtData(v.ultimo_bip)}</td>
                    <td>{v.cadastrado ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === "base" && (<>
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
                <th>Estado VEC</th>
                <th>Km</th>
                <th>Último BIP</th>
                <th>Observações</th>
                {(podeTrocarMotorista || podeEditar) && <th></th>}
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
                  <td>{v.vec_estado ? <span className={tagVec(v.vec_estado)}>{v.vec_estado}</span> : "—"}</td>
                  <td>{fmtKm(v.vec_km)}</td>
                  <td>{fmtData(v.vec_ultimo_bip)}</td>
                  <td>{v.observacoes ?? "—"}</td>
                  {(podeTrocarMotorista || podeEditar) && (
                    <td style={{ display: "flex", gap: 6 }}>
                      {podeTrocarMotorista && (
                        <button className="btn btn-secundario" onClick={() => abrirTroca(v)}>
                          Trocar motorista
                        </button>
                      )}
                      {podeEditar && (
                        <button className="btn btn-secundario" onClick={() => abrirEdicaoDados(v)}>
                          Editar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}

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

      {editandoDados && (
        <div className="modal-fundo" onClick={() => setEditandoDados(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Editar veículo — {editandoDados.placa}</h2>
            {erroModalDados && <div className="erro">{erroModalDados}</div>}
            <div className="campo">
              <label>Status</label>
              <select
                value={formDados.status ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUS_OPCOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Base</label>
              <input
                value={formDados.base ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, base: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Tipo</label>
              <input
                value={formDados.tipo ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, tipo: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Rentadora</label>
              <input
                value={formDados.rentadora ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, rentadora: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Transportadora</label>
              <input
                value={formDados.transportadora ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, transportadora: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Subregião</label>
              <input
                value={formDados.subregiao ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, subregiao: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Observações</label>
              <textarea
                rows={3}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d3d9e6", borderRadius: 8, fontFamily: "inherit" }}
                value={formDados.observacoes ?? ""}
                onChange={(e) => setFormDados((f) => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setEditandoDados(null)}>
                Cancelar
              </button>
              <button className="btn btn-primario" onClick={salvarDados} disabled={salvandoDados}>
                {salvandoDados ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
