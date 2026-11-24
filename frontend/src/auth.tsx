import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Usuario } from "./api";

interface AuthState {
  usuario: Usuario | null;
  token: string | null;
  login: (token: string, usuario: Usuario) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("gdf_token"));
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const raw = localStorage.getItem("gdf_user");
    return raw ? (JSON.parse(raw) as Usuario) : null;
  });

  useEffect(() => {
    // Mantém a sessão sincronizada entre abas (ex.: logout em uma aba
    // derruba o acesso nas outras na próxima navegação).
    function onStorage(e: StorageEvent) {
      if (e.key === "gdf_token" && !e.newValue) {
        setToken(null);
        setUsuario(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function login(novoToken: string, novoUsuario: Usuario) {
    localStorage.setItem("gdf_token", novoToken);
    localStorage.setItem("gdf_user", JSON.stringify(novoUsuario));
    setToken(novoToken);
    setUsuario(novoUsuario);
  }

  function logout() {
    localStorage.removeItem("gdf_token");
    localStorage.removeItem("gdf_user");
    setToken(null);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

export const PAPEIS_STAFF = ["superadmin", "admin", "gestor_base", "leitor"] as const;
export const PAPEIS_GESTAO = ["superadmin", "admin", "gestor_base"] as const;
export const PAPEIS_ADMIN = ["superadmin", "admin"] as const;
