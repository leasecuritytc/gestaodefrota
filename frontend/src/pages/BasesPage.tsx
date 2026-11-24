import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";

interface BaseLinha {
  id: string;
  codigo: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  ativa: boolean;
  created_at: string;
}

// Cadastro de bases: só admin e superadmin chegam aqui (ver ProtectedRoute em
// App.tsx) — a API também recusa criar/editar fora desses dois papéis.
export default function BasesPage() {
  const [lista, setLista] = useState<BaseLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api
      .get<BaseLinha[]>("/bases")
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar as bases.")));
  }

  useEffect(carregar, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      await api.post("/bases", {
        codigo,
        nome,
        cidade: cidade || undefined,
        estado: estado || undefined,
      });
      setCodigo("");
      setNome("");
      setCidade("");
      setEstado("");
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível cadastrar a base."));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtiva(b: BaseLinha) {
    try {
      await api.patch(`/bases/${b.id}`, { ativa: !b.ativa });
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível alterar a base."));
    }
  }

  return (
    <>
      <h1>Bases</h1>
      <p className="descricao-pagina">
        Unidades operacionais da frota (ex.: SMG3 — Pouso Alegre). Cadastro restrito a admin e
        superadmin.
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div />
        <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Cadastrar base"}
        </button>
      </div>

      {mostrarForm && (
        <form className="painel" onSubmit={criar}>
          <h2>Nova base</h2>
          {erroForm && <div className="erro">{erroForm}</div>}
          <div className="campo">
            <label>Código</label>
            <input
              required
              placeholder="ex.: SMG3"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Nome</label>
            <input
              required
              placeholder="ex.: SMG3 - Pouso Alegre"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Cidade</label>
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div className="campo">
            <label>UF</label>
            <input maxLength={2} value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase())} />
          </div>
          <button className="btn btn-primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Cadastrar base"}
          </button>
        </form>
      )}

      <div className="painel">
        {lista && lista.length === 0 && <p className="vazio">Nenhuma base cadastrada ainda.</p>}
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Cidade/UF</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.codigo}</strong>
                  </td>
                  <td>{b.nome}</td>
                  <td>{[b.cidade, b.estado].filter(Boolean).join("/") || "—"}</td>
                  <td>
                    <span className={`tag ${b.ativa ? "tag-ativa" : "tag-inativo"}`}>
                      {b.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secundario" onClick={() => alternarAtiva(b)}>
                      {b.ativa ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
