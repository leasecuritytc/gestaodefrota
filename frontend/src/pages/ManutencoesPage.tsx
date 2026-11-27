import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";
import { useAuth, PAPEIS_ADMIN } from "../auth";

interface Manutencao {
  id: string;
  placa: string;
  base: string;
  tipo: "Preventiva" | "Corretiva" | "Outros";
  descricao: string | null;
  oficina: string | null;
  data_entrada: string;
  data_saida: string | null;
  previsao_saida: string | null;
  status: string;
  source: string;
}

interface Campos {
  placa: string; base: string; tipo: Manutencao["tipo"]; oficina: string; descricao: string;
  data_entrada: string; previsao_saida: string; data_saida: string; status: string;
}
const VAZIO: Campos = { placa: "", base: "", tipo: "Preventiva", oficina: "", descricao: "", data_entrada: "", previsao_saida: "", data_saida: "", status: "Em andamento" };

const PODE_CRIAR = ["superadmin", "admin", "gestor_base"];
const dia = (v: string | null) => (v ? v.slice(0, 10) : "");
// Datas vêm como ISO (UTC); exibir o dia sem deslocar por fuso.
const fmtDia = (v: string) => dia(v).split("-").reverse().join("/");
const hojeIso = new Date().toISOString().slice(0, 10);

// Valida antes de enviar e devolve a mensagem em português (ou null se estiver tudo certo).
function validar(c: Campos, novo: boolean): string | null {
  if (novo && c.placa.trim().length < 5) return "Informe a placa do veículo (mínimo 5 caracteres).";
  if (!c.base.trim()) return "Informe a base (ex.: SMG3).";
  if (!c.data_entrada) return "Informe a data de entrada na oficina.";
  if (c.data_saida && c.data_saida < c.data_entrada) return "A data de saída não pode ser anterior à entrada.";
  if (c.previsao_saida && c.previsao_saida < c.data_entrada) return "A previsão de saída não pode ser anterior à entrada.";
  return null;
}

export default function ManutencoesPage() {
  const { usuario } = useAuth();
  const podeCriar = !!usuario && PODE_CRIAR.includes(usuario.role);
  const podeEditar = !!usuario && (PAPEIS_ADMIN as readonly string[]).includes(usuario.role);

  const [lista, setLista] = useState<Manutencao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  // um único formulário (modal) serve para criar e editar
  const [aberto, setAberto] = useState<null | { id: string | null }>(null);
  const [f, setF] = useState<Campos>(VAZIO);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Manutencao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => setF((x) => ({ ...x, [k]: v }));

  function carregar() {
    api
      .get<Manutencao[]>("/maintenance", { params: filtroStatus ? { status: filtroStatus } : {} })
      .then((r) => { setLista(r.data); setErro(null); })
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar as manutenções.")));
  }
  useEffect(carregar, [filtroStatus]);

  function abrirNovo() { setF(VAZIO); setErroForm(null); setAberto({ id: null }); }
  function abrirEdicao(m: Manutencao) {
    setF({ placa: m.placa, base: m.base, tipo: m.tipo, oficina: m.oficina ?? "", descricao: m.descricao ?? "", data_entrada: dia(m.data_entrada), previsao_saida: dia(m.previsao_saida), data_saida: dia(m.data_saida), status: m.status });
    setErroForm(null); setAberto({ id: m.id });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!aberto) return;
    const novo = aberto.id === null;
    const v = validar(f, novo);
    if (v) return setErroForm(v);
    setErroForm(null); setSalvando(true);
    try {
      if (novo) {
        await api.post("/maintenance", {
          placa: f.placa.trim().toUpperCase(), base: f.base.trim().toUpperCase(), tipo: f.tipo,
          descricao: f.descricao || undefined, oficina: f.oficina || undefined,
          data_entrada: f.data_entrada, data_saida: f.data_saida || undefined, previsao_saida: f.previsao_saida || undefined,
        });
        setOk("Manutenção registrada.");
      } else {
        await api.patch(`/maintenance/${aberto.id}`, {
          base: f.base.trim().toUpperCase(), tipo: f.tipo, descricao: f.descricao || null, oficina: f.oficina || null,
          data_entrada: f.data_entrada, previsao_saida: f.previsao_saida || null, data_saida: f.data_saida || null,
          status: f.data_saida && f.status === "Em andamento" ? "Concluída" : f.status,
        });
        setOk("Alterações salvas.");
      }
      setAberto(null);
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível salvar. Confira os campos e tente de novo."));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await api.delete(`/maintenance/${excluir.id}`);
      setExcluir(null); setOk("Manutenção excluída."); carregar();
    } catch (err) {
      setExcluir(null); setErro(mensagemErro(err, "Não foi possível excluir."));
    } finally { setExcluindo(false); }
  }

  const visiveis = (lista ?? []).filter((m) => !busca || m.placa.includes(busca.toUpperCase()) || (m.oficina ?? "").toUpperCase().includes(busca.toUpperCase()));
  const editandoId = aberto?.id ?? null;

  return (
    <>
      <h1>Manutenções</h1>
      <p className="descricao-pagina">Cadastre, consulte, edite e exclua manutenções preventivas e corretivas. Edição e exclusão: admin e superadmin.</p>
      {erro && <div className="erro" role="alert">{erro}</div>}
      {ok && <div className="sucesso" role="status">{ok}</div>}

      <div className="barra-topo">
        <div className="filtros">
          <input placeholder="Placa ou oficina..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Concluída">Concluída</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>
        {podeCriar && <button className="btn btn-primario" onClick={abrirNovo}>Registrar manutenção</button>}
      </div>

      <div className="painel">
        {lista === null && !erro && <p className="carregando">Carregando...</p>}
        {lista && visiveis.length === 0 && <p className="vazio">Nenhuma manutenção encontrada.</p>}
        {visiveis.length > 0 && (
          <div className="bsc-tabela-wrap">
            <table>
              <thead>
                <tr><th>Placa</th><th>Base</th><th>Tipo</th><th>Oficina</th><th>Entrada</th><th>Previsão de saída</th><th>Saída</th><th>Status</th>{podeEditar && <th></th>}</tr>
              </thead>
              <tbody>
                {visiveis.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.placa}</strong></td>
                    <td>{m.base}</td>
                    <td>{m.tipo}</td>
                    <td>{m.oficina ?? "—"}</td>
                    <td>{fmtDia(m.data_entrada)}</td>
                    <td>
                      {m.previsao_saida ? fmtDia(m.previsao_saida) : "—"}
                      {m.status === "Em andamento" && m.previsao_saida && dia(m.previsao_saida) < hojeIso && <span className="tag tag-inativo" style={{ marginLeft: 6 }}>Atrasada</span>}
                    </td>
                    <td>{m.data_saida ? fmtDia(m.data_saida) : "—"}</td>
                    <td><span className={`tag tag-${m.status === "Concluída" ? "concluida" : "em_andamento"}`}>{m.status}</span></td>
                    {podeEditar && (
                      <td className="insp-acoes">
                        <button className="btn btn-secundario" onClick={() => abrirEdicao(m)}>Editar</button>
                        <button className="btn btn-secundario" onClick={() => setExcluir(m)}>Excluir</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && (
        <div className="modal-fundo" onClick={() => !salvando && setAberto(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} noValidate>
            <h2>{editandoId ? `Editar manutenção — ${f.placa}` : "Nova manutenção"}</h2>
            {erroForm && <div className="erro" role="alert">{erroForm}</div>}
            {!editandoId && <div className="campo"><label>Placa *</label><input value={f.placa} maxLength={8} onChange={(e) => set("placa", e.target.value.toUpperCase())} /></div>}
            <div className="campo"><label>Base * (ex.: SMG3)</label><input value={f.base} maxLength={10} onChange={(e) => set("base", e.target.value.toUpperCase())} /></div>
            <div className="campo"><label>Tipo *</label>
              <select value={f.tipo} onChange={(e) => set("tipo", e.target.value as Campos["tipo"])}>
                <option value="Preventiva">Preventiva</option><option value="Corretiva">Corretiva</option><option value="Outros">Outros</option>
              </select></div>
            <div className="campo"><label>Oficina</label><input value={f.oficina} onChange={(e) => set("oficina", e.target.value)} /></div>
            <div className="campo"><label>Descrição</label><input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} /></div>
            <div className="campo"><label>Data de entrada *</label><input type="date" value={f.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} /></div>
            <div className="campo"><label>Previsão de saída</label><input type="date" value={f.previsao_saida} onChange={(e) => set("previsao_saida", e.target.value)} /></div>
            <div className="campo"><label>Data de saída (real — deixe em branco se ainda está em andamento)</label><input type="date" value={f.data_saida} onChange={(e) => set("data_saida", e.target.value)} /></div>
            {editandoId && (
              <div className="campo"><label>Status</label>
                <select value={f.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="Em andamento">Em andamento</option><option value="Concluída">Concluída</option><option value="Cancelada">Cancelada</option>
                </select></div>
            )}
            <div className="acoes">
              <button type="button" className="btn btn-secundario" onClick={() => setAberto(null)} disabled={salvando}>Cancelar</button>
              <button className="btn btn-primario" style={{ width: "auto" }} disabled={salvando}>{salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      {excluir && (
        <div className="modal-fundo" onClick={() => !excluindo && setExcluir(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Excluir manutenção?</h2>
            <p className="subtitulo">{excluir.placa} · {excluir.tipo} · entrada em {fmtDia(excluir.data_entrada)}</p>
            <div className="insp-aviso" role="note"><strong>Não dá para desfazer</strong><span>O registro some da lista. A exclusão fica registrada na auditoria, com seu nome.</span></div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setExcluir(null)} disabled={excluindo}>Cancelar</button>
              <button className="btn btn-primario" style={{ width: "auto" }} onClick={confirmarExclusao} disabled={excluindo}>{excluindo ? "Excluindo..." : "Excluir"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
