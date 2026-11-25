import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useTema } from "../theme";

// Ícones em SVG (traço), sem dependência externa.
const I = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONES: Record<string, ReactNode> = {
  painel: I(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  veiculos: I(<><path d="M3 16V8a2 2 0 0 1 2-2h9l4 4h2a1 1 0 0 1 1 1v5" /><circle cx="7.5" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9.5 17h5" /></>),
  manutencoes: I(<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />),
  ocorrencias: I(<><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.5v.01" /></>),
  inspecoes: I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>),
  checklists: I(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>),
  bsc: I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  bases: I(<><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>),
  motoristas: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>),
  usuarios: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>),
  auditoria: I(<><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>),
};

interface Item { to: string; label: string; icone: string; papeis?: string[] }
const PRINCIPAIS: Item[] = [
  { to: "/", label: "Painel", icone: "painel" },
  { to: "/veiculos", label: "Veículos", icone: "veiculos" },
  { to: "/manutencoes", label: "Manutenções", icone: "manutencoes" },
  { to: "/ocorrencias", label: "Ocorrências", icone: "ocorrencias" },
  { to: "/inspecoes", label: "Inspeções", icone: "inspecoes", papeis: ["superadmin", "admin", "gestor_base", "leitor"] },
];
const GESTAO: Item[] = [
  { to: "/checklists", label: "Checklists VEC", icone: "checklists", papeis: ["superadmin", "admin"] },
  { to: "/bsc", label: "BSC", icone: "bsc", papeis: ["superadmin", "admin"] },
  { to: "/bases", label: "Bases", icone: "bases", papeis: ["superadmin", "admin"] },
  { to: "/motoristas", label: "Motoristas", icone: "motoristas", papeis: ["superadmin", "admin"] },
  { to: "/usuarios", label: "Usuários", icone: "usuarios", papeis: ["superadmin", "admin"] },
  { to: "/auditoria", label: "Auditoria", icone: "auditoria", papeis: ["superadmin", "admin"] },
];

const NOMES_PAPEL: Record<string, string> = {
  superadmin: "Superadmin", admin: "Admin", gestor_base: "Gestor de base", leitor: "Leitor", motorista: "Motorista",
};

const iniciais = (nome?: string | null) =>
  (nome ?? "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

// Navbar fixa no topo: vidro escuro, ícones, indicador de página ativa, grupo
// "Gestão" em menu suspenso, selo de inspeções vencidas, tema em um toque,
// menu do usuário e gaveta no celular.
export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { tema, definirTema } = useTema();
  const noPainel = location.pathname === "/";
  const [rolou, setRolou] = useState(false);
  const [gestaoAberto, setGestaoAberto] = useState(false);
  const [usuarioAberto, setUsuarioAberto] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [vencidas, setVencidas] = useState<number | null>(null);
  const gestaoRef = useRef<HTMLDivElement>(null);
  const usuarioRef = useRef<HTMLDivElement>(null);

  const visiveis = (lista: Item[]) => lista.filter((i) => !i.papeis || (usuario && i.papeis.includes(usuario.role)));
  const principais = useMemo(() => visiveis(PRINCIPAIS), [usuario]); // eslint-disable-line react-hooks/exhaustive-deps
  const gestao = useMemo(() => visiveis(GESTAO), [usuario]); // eslint-disable-line react-hooks/exhaustive-deps
  const gestaoAtivo = gestao.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => {
    const f = () => setRolou(window.scrollY > 6);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  // Fecha menus ao trocar de página, ao clicar fora e com Esc.
  useEffect(() => { setGestaoAberto(false); setUsuarioAberto(false); setGavetaAberta(false); }, [location.pathname]);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (gestaoRef.current && !gestaoRef.current.contains(e.target as Node)) setGestaoAberto(false);
      if (usuarioRef.current && !usuarioRef.current.contains(e.target as Node)) setUsuarioAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setGestaoAberto(false); setUsuarioAberto(false); setGavetaAberta(false); } };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, []);

  // Selo: inspeções vencidas (atualiza ao trocar de página e a cada 5 min).
  const podeInspecoes = !!usuario && ["superadmin", "admin", "gestor_base", "leitor"].includes(usuario.role);
  useEffect(() => {
    if (!podeInspecoes) return;
    let vivo = true;
    const carregar = () =>
      api.get<{ vencido: boolean }[]>("/checklists-proprios/veiculos")
        .then((r) => { if (vivo) setVencidas(r.data.filter((v) => v.vencido).length); })
        .catch(() => undefined);
    carregar();
    const t = setInterval(carregar, 300000);
    return () => { vivo = false; clearInterval(t); };
  }, [podeInspecoes, location.pathname]);

  function sair() { logout(); navigate("/login"); }
  const claro = tema === "light";

  const link = (item: Item, extra?: string) => (
    <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-link${isActive ? " ativo" : ""}${extra ? " " + extra : ""}`}>
      {ICONES[item.icone]}
      <span>{item.label}</span>
      {item.to === "/inspecoes" && vencidas != null && vencidas > 0 && <b className="nav-selo" title={`${vencidas} veículo(s) com inspeção vencida`}>{vencidas}</b>}
    </NavLink>
  );

  return (
    <div className="app-shell-navbar">
      <header className={`topbar${rolou ? " rolou" : ""}`}>
        <div className="faixa-risco faixa-fina" aria-hidden="true" />
        <div className="topbar-linha">
          <button type="button" className="topbar-hamb" aria-label="Abrir menu" aria-expanded={gavetaAberta} onClick={() => setGavetaAberta((v) => !v)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {gavetaAberta ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
          <NavLink to="/" className="topbar-marca" aria-label="Ir ao Painel">
            <img src="/icon-192.png" alt="" width={38} height={38} />
            <span className="topbar-marca-txt">
              <strong>GESTÃO DE FROTA</strong>
              <small>RodaCoop — O melhor sempre vai chegar.</small>
            </span>
          </NavLink>

          <nav className="topbar-nav" aria-label="Principal">
            {principais.map((i) => link(i))}
            {gestao.length > 0 && (
              <div className="nav-grupo" ref={gestaoRef}>
                <button type="button" className={`nav-link${gestaoAtivo ? " ativo" : ""}`} aria-haspopup="menu" aria-expanded={gestaoAberto} onClick={() => setGestaoAberto((v) => !v)}>
                  {ICONES.bsc}<span>Gestão</span>
                  <svg className={`nav-seta${gestaoAberto ? " aberta" : ""}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {gestaoAberto && <div className="menu-suspenso" role="menu">{gestao.map((i) => link(i, "menu-item"))}</div>}
              </div>
            )}
          </nav>

          <div className="topbar-direita">
            <button type="button" className="icone-btn" aria-label={claro ? "Ativar modo escuro" : "Ativar modo claro"} title={claro ? "Modo escuro" : "Modo claro"} onClick={() => definirTema(claro ? "dark" : "light")}>
              {claro ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              )}
            </button>
            <div className="usuario-menu" ref={usuarioRef}>
              <button type="button" className="usuario-btn" aria-haspopup="menu" aria-expanded={usuarioAberto} onClick={() => setUsuarioAberto((v) => !v)}>
                <span className="avatar" aria-hidden="true">{iniciais(usuario?.full_name ?? usuario?.email)}</span>
                <span className="usuario-txt"><strong>{usuario?.full_name ?? usuario?.email}</strong><small>{usuario ? NOMES_PAPEL[usuario.role] ?? usuario.role : ""}</small></span>
              </button>
              {usuarioAberto && (
                <div className="menu-suspenso menu-usuario" role="menu">
                  <div className="menu-usuario-topo"><strong>{usuario?.full_name ?? "Usuário"}</strong><small>{usuario?.email}</small><span className="chip-papel">{usuario ? NOMES_PAPEL[usuario.role] ?? usuario.role : ""}</span></div>
                  <button type="button" className="menu-item" role="menuitem" onClick={sair}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                    <span>Sair</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {gavetaAberta && (
          <div className="gaveta" role="dialog" aria-label="Menu">
            {[...principais, ...gestao].map((i) => link(i, "gaveta-item"))}
            <button type="button" className="nav-link gaveta-item" onClick={sair}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              <span>Sair</span>
            </button>
          </div>
        )}
      </header>
      <div className={`area-conteudo area-conteudo-fundo${noPainel ? " area-painel" : ""}`}>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
