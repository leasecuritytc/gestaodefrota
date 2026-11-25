import { useEffect, useState, type FormEvent } from "react";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

interface UsuarioLinha {
  id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  email_confirmado: boolean;
  ativado_em: string | null;
  acesso_auditoria: boolean;
  created_at: string;
}

const PAPEIS_CRIAVEIS_SUPERADMIN = [
  { valor: "admin", rotulo: "Admin" },
  { valor: "gestor_base", rotulo: "Gestor de base" },
  { valor: "leitor", rotulo: "Leitor" },
  { valor: "motorista", rotulo: "Motorista" },
];
const PAPEIS_CRIAVEIS_ADMIN = PAPEIS_CRIAVEIS_SUPERADMIN.filter((p) => p.valor !== "admin");

const NOMES_PAPEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  gestor_base: "Gestor de base",
  leitor: "Leitor",
  motorista: "Motorista",
};

export default function UsuariosPage() {
  const { usuario } = useAuth();
  const papeisCriaveis =
    usuario?.role === "superadmin" ? PAPEIS_CRIAVEIS_SUPERADMIN : PAPEIS_CRIAVEIS_ADMIN;

  const [lista, setLista] = useState<UsuarioLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState(papeisCriaveis[0]?.valor ?? "leitor");
  const [telefone, setTelefone] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [linkConvite, setLinkConvite] = useState<string | null>(null);

  function carregar() {
    api
      .get<UsuarioLinha[]>("/users")
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, "Não foi possível carregar os usuários.")));
  }

  useEffect(carregar, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const { data } = await api.post("/users", {
        email,
        full_name: fullName,
        role,
        telefone: role === "motorista" ? telefone : undefined,
      });
      setLinkConvite(data.convite?.link ?? null);
      setEmail("");
      setFullName("");
      setTelefone("");
      carregar();
    } catch (err) {
      setErroForm(mensagemErro(err, "Não foi possível criar o usuário."));
    } finally {
      setSalvando(false);
    }
  }

  async function reenviarConvite(id: string) {
    try {
      const { data } = await api.post(`/users/${id}/reenviar-convite`);
      setLinkConvite(data.convite?.link ?? data.link ?? null);
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível reenviar o convite."));
    }
  }



  async function alternarAtivo(id: string, atual: boolean) {
    try {
      await api.patch(`/users/${id}`, { active: !atual });
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, "Não foi possível alterar o usuário."));
    }
  }

  return (
    <>
      <h1>Usuários</h1>
      <p className="descricao-pagina">
        Quem você cadastra aqui recebe um link de convite por e-mail — nunca uma senha pronta.
      </p>
      {erro && <div className="erro">{erro}</div>}

      <div className="barra-topo">
        <div />
        <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "Cadastrar usuário"}
        </button>
      </div>

      {linkConvite && (
        <div className="painel">
          <h2>Convite gerado</h2>
          <p>
            Envie este link para a pessoa (se o e-mail ainda não estiver configurado, ele não foi
            enviado automaticamente):
          </p>
          <code className="copiavel">{linkConvite}</code>
          <div className="acoes">
            <button className="btn btn-secundario" onClick={() => setLinkConvite(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {mostrarForm && (
        <form className="painel" onSubmit={criar}>
          <h2>Novo usuário</h2>
          {erroForm && <div className="erro">{erroForm}</div>}
          <div className="campo">
            <label>Nome completo</label>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="campo">
            <label>E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Papel</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {papeisCriaveis.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
          {role === "motorista" && (
            <div className="campo">
              <label>Telefone</label>
              <input required value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          )}
          <button className="btn btn-primario" disabled={salvando}>
            {salvando ? "Criando..." : "Criar e gerar convite"}
          </button>
        </form>
      )}

      <div className="painel">
        {lista && lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>{NOMES_PAPEL[u.role] ?? u.role}</td>
                  <td>
                    <span className={`tag ${u.ativado_em ? "tag-ativo" : "tag-manutencao"}`}>
                      {u.ativado_em ? "Ativado" : "Convite pendente"}
                    </span>
                    {!u.active && <span className="tag tag-inativo" style={{ marginLeft: 4 }}>Desativado</span>}
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {!u.ativado_em && (
                      <button className="btn btn-secundario" onClick={() => reenviarConvite(u.id)}>
                        Reenviar convite
                      </button>
                    )}
                    {u.role !== "superadmin" && (
                      <button className="btn btn-secundario" onClick={() => alternarAtivo(u.id, u.active)}>
                        {u.active ? "Desativar" : "Reativar"}
                      </button>
                    )}
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
