import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";
import { useAuth, PAPEIS_ADMIN } from "../auth";

interface Manutencao {
  id: string;
  placa: string;
  base: string;
  tipo: string;
  descricao: string | null;
  oficina: string | null;
  data_entrada: string;
  data_saida: string | null;
  custo: string;
  status: string;
  source: string;
}

const PODE_CRIAR = ["superadmin", "admin", "gestor_base"];

export default function ManutencoesPage() {
  const { usuario } = useAuth();
  const podeCriar = !!usuario && PODE_CRIAR.includes(usuario.role);
  const podeEditar = !!usuario && (PAPEIS_ADMIN as readonly string[]).includes(usuario.role);

  const [editando, setEditando] = useState<Manutencao | null>(null);
  const [formEdit, setFormEdit] = useState<Partial<Manutencao>>({});
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erroEdit, setErroEdit] = useState<string | null>(null);

  const [lista, setLista] = useState<Manutencao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);

  const [placa, setPlaca] = useState("");
  const [base, setBase] = useState("");
  const [tipo, setTipo] = useState<"Preventiva" | "Corretiva" | "Outros">("Preventiva");
  const [descricao, setDescricao] = useState("");
  const [oficina, setOficina] = useState("");
  const [dataEntrada, setDataEntrada] = useState("");
  const [dataSaida, setDataSaida] = useState("");
  const [custo, setCusto] = useState("0");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api
      .get<Manutencao[]>("/maintenance", { params: filtroStatus ? { status: filtroStatus } : {} })
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar as manutenções.")));
  }

  useEffect(carregar, [filtroStatus]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      await api.post("/maintenance", {
        placa,
        base,
        tipo,
        descricao: descricao || undefined,
        oficina: oficina || undefined,
        data_entrada: dataEntrada,
        data_saida: dataSaida || undefined,
        custo: Number(custo) || 0,
      });
      setMostrarForm(false);
      setPlaca("");
      setBase("");
      setDescricao("");
      setOficina("");
      setDataEntrada("");
      setDataSaida("");
      setCusto("0");
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível registrar a manutenção."));
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(m: Manutencao) {
    setEditando(m);
    setFormEdit({
      tipo: m.tipo,
      descricao: m.descricao,
      oficina: m.oficina,
      data_saida: m.data_saida ? m.data_saida.slice(0, 10) : null,
      custo: m.custo,
      status: m.status,
    });
    setErroEdit(null);
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvandoEdit(true);
    setErroEdit(null);
    try {
      await api.patch(`/maintenance/${editando.id}`, {
        ...formEdit,
        custo: formEdit.custo !== undefined ? Number(formEdit.custo) : undefined,
        data_saida: formEdit.data_saida || null,
      });
      setEditando(null);
      carregar();
    } catch (err) {
      setErroEdit(mensagemErro(err, "Não foi possível salvar as alterações."));
    } finally {
      setSalvandoEdit(false);
    }
  }

  return (
    <>
      <h1>Manutenções</h1>
      <p className="descricao-pagina">Histórico de manutenções preventivas e corretivas.</p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div className="filtros">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Concluída">Concluída</option>
          </select>
        </div>
        {podeCriar && (
          <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? "Cancelar" : "Registrar manutenção"}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form className="painel" onSubmit={criar}>
          <h2>Nova manutenção</h2>
          {erroForm && <div className="erro">{erroForm}</div>}
          <div className="campo">
            <label>Placa</label>
            <input required value={placa} onChange={(e) => setPlaca(e.target.value)} />
          </div>
          <div className="campo">
            <label>Base</label>
            <input required value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="Preventiva">Preventiva</option>
              <option value="Corretiva">Corretiva</option>
              <option value="Outros">Outros</option>
            </select>
          </div>
          <div className="campo">
            <label>Oficina</label>
            <input value={oficina} onChange={(e) => setOficina(e.target.value)} />
          </div>
          <div className="campo">
            <label>Descrição</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="campo">
            <label>Data de entrada</label>
            <input
              type="date"
              required
              value={dataEntrada}
              onChange={(e) => setDataEntrada(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Data de saída (deixe em branco se ainda está em andamento)</label>
            <input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
          </div>
          <div className="campo">
            <label>Custo (R$)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
            />
          </div>
          <button className="btn btn-primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}

      <div className="painel">
        {lista && lista.length === 0 && <p className="vazio">Nenhuma manutenção encontrada.</p>}
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo</th>
                <th>Oficina</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Custo</th>
                <th>Status</th>
                {podeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.placa}</strong>
                  </td>
                  <td>{m.tipo}</td>
                  <td>{m.oficina ?? "—"}</td>
                  <td>{new Date(m.data_entrada).toLocaleDateString("pt-BR")}</td>
                  <td>{m.data_saida ? new Date(m.data_saida).toLocaleDateString("pt-BR") : "—"}</td>
                  <td>
                    {Number(m.custo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td>
                    <span className={`tag tag-${m.status === "Concluída" ? "concluida" : "em_andamento"}`}>
                      {m.status}
                    </span>
                  </td>
                  {podeEditar && (
                    <td>
                      <button className="btn btn-secundario" onClick={() => abrirEdicao(m)}>
                        Editar
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
            <h2>Editar manutenção — {editando.placa}</h2>
            {erroEdit && <div className="erro">{erroEdit}</div>}
            <div className="campo">
              <label>Status</label>
              <select
                value={formEdit.status ?? ""}
                onChange={(e) => setFormEdit((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="Em andamento">Em andamento</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>
            <div className="campo">
              <label>Oficina</label>
              <input
                value={formEdit.oficina ?? ""}
                onChange={(e) => setFormEdit((f) => ({ ...f, oficina: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Descrição</label>
              <input
                value={formEdit.descricao ?? ""}
                onChange={(e) => setFormEdit((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Data de saída</label>
              <input
                type="date"
                value={formEdit.data_saida ?? ""}
                onChange={(e) => setFormEdit((f) => ({ ...f, data_saida: e.target.value }))}
              />
            </div>
            <div className="campo">
              <label>Custo (R$)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formEdit.custo ?? ""}
                onChange={(e) => setFormEdit((f) => ({ ...f, custo: e.target.value as any }))}
              />
            </div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn btn-primario" onClick={salvarEdicao} disabled={salvandoEdit}>
                {salvandoEdit ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
