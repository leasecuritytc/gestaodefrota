import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Tema = "dark" | "light";

const CHAVE = "rodacoop_theme";

function lerTemaSalvo(): Tema {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* armazenamento indisponível: usa o padrão */
  }
  return "dark";
}

interface TemaCtx {
  tema: Tema;
  definirTema: (t: Tema) => void;
}

const Ctx = createContext<TemaCtx>({ tema: "dark", definirTema: () => {} });

// Só aplica o atributo data-theme no <html> e guarda a escolha. Nenhuma
// chamada de API ou estado de tela depende disso: a troca é puro CSS.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
  }, [tema]);

  const definirTema = useCallback((t: Tema) => {
    setTema(t);
    try {
      localStorage.setItem(CHAVE, t);
    } catch {
      /* sem armazenamento: a escolha vale só nesta sessão */
    }
  }, []);

  const valor = useMemo(() => ({ tema, definirTema }), [tema, definirTema]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useTema = () => useContext(Ctx);
