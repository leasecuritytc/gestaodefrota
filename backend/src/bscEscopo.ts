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

// Conserta texto "quebrado" por troca de codificação (UTF-8 lido como Windows-1252):
// "â€¦" -> "…", "Ã§" -> "ç", "Ã£" -> "ã" etc. Só mexe quando o resultado é UTF-8 válido.
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
const SUSPEITO = /[ÃÂâ][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

export function repararTexto(s: string): string {
  if (!SUSPEITO.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 256) bytes.push(cp);
    else if (CP1252[ch] != null) bytes.push(CP1252[ch]);
    else return s; // tem caractere fora do alcance: não é esse caso
  }
  const out = Buffer.from(bytes).toString("utf8");
  return out.includes("�") ? s : out;
}

export function repararDeep<T>(v: T): T {
  if (typeof v === "string") return repararTexto(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => repararDeep(x)) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, repararDeep(x)])) as T;
  return v;
}
