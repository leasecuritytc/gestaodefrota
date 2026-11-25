import { env } from "./env";

// Escopo do BSC: só linhas das bases configuradas (VEC_BASES) e das placas
// dos veículos dessas bases. Totais do fornecedor inteiro não são
// atribuíveis a uma base e por isso são descartados.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function reBase(): RegExp {
  // "SMG3", "SMG9_Varginha", "SMG3 - Pouso Alegre" casam; "SMG30" e "SMG15" não.
  return new RegExp(`^(${env.vec.bases.map(esc).join("|")})(?![0-9])`, "i");
}

export function limparCab(t: string): string {
  return String(t).replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim().replace(/\s+\d+$/, "").toLowerCase();
}

const COL_BASE = /^(hub|hub_final|svc|svc_final|site|site_de_origem|unidade|base)(\b|_|$)/;
const COL_PLACA = /^(placa|plate|plate_fleet|placa_do_veiculo)(\b|_|$)/;

export const normPlaca = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface TabelaFiltrada {
  tabela: string[][] | null; // null = tabela sem coluna de base/placa (descartada)
  lidas: number;
  mantidas: number;
}

export function filtrarTabela(tab: string[][], placas: Set<string>): TabelaFiltrada {
  const cab = (tab[0] ?? []).map(limparCab);
  const iBase = cab.map((c, i) => (COL_BASE.test(c) ? i : -1)).filter((i) => i >= 0);
  const iPlaca = cab.findIndex((c) => COL_PLACA.test(c));
  const dados = tab.slice(1);
  if (!iBase.length && iPlaca < 0) return { tabela: null, lidas: dados.length, mantidas: 0 };
  const re = reBase();
  const ok = (linha: string[]) =>
    iBase.length
      ? iBase.some((i) => re.test(String(linha[i] ?? "").trim()))
      : placas.has(normPlaca(linha[iPlaca]));
  const mantidas = dados.filter(ok);
  return { tabela: [tab[0], ...mantidas], lidas: dados.length, mantidas: mantidas.length };
}

export interface Retrato {
  linhas: string[];
  tabelas: string[][][];
  numeros: { rotulo: string; valor: string }[];
}

// Aplica o escopo ao retrato de uma página. Os totais do fornecedor (cartões
// de números) e o texto solto saem; ficam as tabelas filtradas e notas.
export function aplicarEscopo(r: Retrato, placas: Set<string>): Retrato {
  // Retrato já filtrado na ingestão: mantém como está (evita refazer as contagens das notas).
  if (r.linhas.some((l) => l.includes("linhas das bases"))) return { ...r, numeros: [] };
  const notas: string[] = r.linhas.filter((l) => /^(Atualização|Coletado)/.test(l));
  const tabelas: string[][][] = [];
  let omitidas = 0;
  r.tabelas.forEach((t, idx) => {
    const f = filtrarTabela(t, placas);
    if (!f.tabela) {
      omitidas++;
      return;
    }
    tabelas.push(f.tabela);
    notas.push(`Tabela ${tabelas.length} (${(f.tabela[0] ?? []).slice(0, 4).map((c) => limparCab(c)).join(", ")}…): ${f.mantidas} linhas das bases ${env.vec.bases.join(", ")}`);
    void idx;
  });
  if (tabelas.length) notas.push("Leitura limitada às primeiras linhas de cada tabela do Looker: tabelas muito grandes podem estar incompletas.");
  if (omitidas) notas.push(`${omitidas} tabela(s) do relatório sem divisão por base/placa foram omitidas (são totais do fornecedor).`);
  return { linhas: notas, tabelas, numeros: [] };
}
