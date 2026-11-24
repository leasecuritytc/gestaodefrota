import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";

interface MotoristaLinha {
  id: string;
  nome: string;
  telefone: string | null;
  cnh: string | null;
  documento: string | null;
  active: boolean;
}

// Cadastro de motorista SEM login — para quem só precisa aparecer como
// "motorista atual" de um veículo. Motorista COM login continua sendo
// cadastrado em Usuários (papel 'motorista'). Só admin/superadmin chegam
// aqui (ver ProtectedRoute em App.tsx).
export default function MotoristasPage() {
  const [lista, setLista] = useState<MotoristaLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cnh, setCnh] = useState("");
  const [documento, setDocumento] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    api
      .get<MotoristaLinha[]>("/drivers")
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar os motoristas.")));
  }

  useEffect(carregar, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      await api.post("/drivers", {
        nome,
        telefone: telefone || undefined,
        cnh: cnh || undefined,
        documento: documento || undefined,
      });
      setNome("");
      setTelefone("");
      setCnh("");
      setDocumento("");
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível cadastrar o motorista."));
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(m: MotoristaLinha) {
    try {
      await api.patch(`/drivers/${m.id}`, { active: !m.active });
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível alterar o motorista."));
    }
  }

  return (
    <>
      <h1>Motoristas</h1>
      <p className="descricao-pagina">
        Motoristas sem login próprio na plataforma (quem precisa de login é cadastrado em Usuários).
        Cadastro restrito a admin e superadmin.
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div />
        <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Cadastrar motorista"}
        </button>
      </div>

      {mostrarForm && (
        <form className="painel" onSubmit={criar}>
          <h2>Novo motorista</h2>
          {erroForm && <div className="erro">{erroForm}</div>}
          <div className="campo">
            <label>Nome</label>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="campo">
            <label>Telefone</label>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="campo">
            <label>CNH</label>
            <input value={cnh} onChange={(e) => setCnh(e.target.value)} />
          </div>
          <div className="campo">
            <label>CPF</label>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </div>
          <button className="btn btn-primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Cadastrar"}
          </button>
        </form>
      )}

      <div className="painel">
        {lista && lista.length === 0 && <p className="vazio">Nenhum motorista cadastrado ainda.</p>}
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>CNH</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.nome}</strong>
                  </td>
                  <td>{m.telefone ?? "—"}</td>
                  <td>{m.cnh ?? "—"}</td>
                  <td>
                    <span className={`tag ${m.active ? "tag-ativa" : "tag-inativo"}`}>
                      {m.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secundario" onClick={() => alternarAtivo(m)}>
                      {m.active ? "Desativar" : "Reativar"}
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
