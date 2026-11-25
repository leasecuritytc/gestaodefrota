import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useTema } from "../theme";

const ITENS_MENU: { to: string; label: string; papeis?: string[] }[] = [
  { to: "/", label: "Painel" },
  { to: "/veiculos", label: "Veículos" },
  { to: "/manutencoes", label: "Manutenções" },
  { to: "/ocorrencias", label: "Ocorrências" },
  { to: "/checklists", label: "Checklists", papeis: ["superadmin", "admin"] },
  { to: "/bsc", label: "BSC", papeis: ["superadmin", "admin"] },
  { to: "/bases", label: "Bases", papeis: ["superadmin", "admin"] },
  { to: "/motoristas", label: "Motoristas", papeis: ["superadmin", "admin"] },
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

// Navbar horizontal no topo (em vez do menu lateral) — no estilo do painel
// de referência da RodaCoop: faixa de risco, logo+título à esquerda, links
// em linha, usuário/sair à direita.
export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { tema, definirTema } = useTema();
  const noPainel = location.pathname === "/";

  function sair() {
    logout();
    navigate("/login");
  }

  const itensVisiveis = ITENS_MENU.filter(
    (item) => !item.papeis || (usuario && item.papeis.includes(usuario.role))
  );

  return (
    <div className="app-shell-navbar">
      <div className="faixa-risco" aria-hidden="true" />
      <header className="navbar">
        <div className="navbar-marca">
          <span className="navbar-logo" aria-hidden="true">🚛</span>
          <div>
            <strong>GESTÃO DE FROTA</strong>
            <span className="navbar-subtitulo">RodaCoop — O melhor sempre vai chegar.</span>
          </div>
        </div>
        <nav className="navbar-links">
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
        <div className="tema-seletor" role="group" aria-label="Tema da interface">
          <button
            type="button"
            className={tema === "dark" ? "ativo" : ""}
            aria-pressed={tema === "dark"}
            onClick={() => definirTema("dark")}
          >
            🌙 Modo Escuro
          </button>
          <button
            type="button"
            className={tema === "light" ? "ativo" : ""}
            aria-pressed={tema === "light"}
            onClick={() => definirTema("light")}
          >
            ☀️ Modo Claro
          </button>
        </div>
        <div className="navbar-usuario">
          <div className="navbar-usuario-nome">{usuario?.full_name ?? usuario?.email}</div>
          <div className="navbar-usuario-papel">{usuario ? NOMES_PAPEL[usuario.role] ?? usuario.role : ""}</div>
          <button className="btn btn-secundario" onClick={sair}>
            Sair
          </button>
        </div>
      </header>
      <div className={`area-conteudo area-conteudo-fundo${noPainel ? " area-painel" : ""}`}>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
