import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const ITENS_MENU: { to: string; label: string; papeis?: string[] }[] = [
  { to: "/", label: "Painel" },
  { to: "/veiculos", label: "Veículos" },
  { to: "/manutencoes", label: "Manutenções" },
  { to: "/ocorrencias", label: "Ocorrências" },
  { to: "/bases", label: "Bases", papeis: ["superadmin", "admin"] },
  { to: "/usuarios", label: "Usuários", papeis: ["superadmin", "admin"] },
  { to: "/auditoria", label: "Auditoria", papeis: ["superadmin", "admin"] },
];

const NOMES_PAPEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  gestor_base: "Gestor de base",
  leitor: "Leitor",
  motorista: "Motorista",
};

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  function sair() {
    logout();
    navigate("/login");
  }

  const itensVisiveis = ITENS_MENU.filter(
    (item) => !item.papeis || (usuario && item.papeis.includes(usuario.role))
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="faixa-risco" aria-hidden="true" />
        <div className="marca">
          <strong>🚛 GESTÃO DE FROTA</strong>
          <span>RodaCoop — O melhor sempre vai chegar.</span>
        </div>
        <nav>
          {itensVisiveis.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "ativo" : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="rodape">
          <div>{usuario?.full_name ?? usuario?.email}</div>
          <div>{usuario ? NOMES_PAPEL[usuario.role] ?? usuario.role : ""}</div>
          <button onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
