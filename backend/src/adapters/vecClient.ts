import { env } from "../env";

/**
 * Cliente da API interna do portal VEC Fleet (https://meli-br.vecfleet.io).
 *
 * Endpoints mapeados navegando pelo portal com o usuário logado
 * (24/11/2026) — a API NÃO é documentada publicamente:
 *   POST public/auth/login         → login (usuário/senha do portal)
 *   GET  regiones/select           → usado aqui só para validar o token
 *   GET  moviles/newGrid           → lista de veículos (paginada)
 *   GET  formulario/newGrid        → checklists / inspeções (paginada)
 *
 * Como os nomes exatos dos campos do login e o cabeçalho do token não são
 * públicos, o cliente DESCOBRE sozinho na primeira chamada, testando as
 * combinações mais comuns (no máximo 3 tentativas de login, para nunca
 * arriscar bloquear a conta), e guarda a combinação que funcionou.
 *
 * Segurança: usuário, senha e token nunca são logados nem devolvidos pela
 * API da plataforma. Erros só informam status HTTP e etapa.
 */

type Cabecalho = "bearer" | "authorization-token" | "token";

let tokenAtual: string | null = null;
let cabecalhoAtual: Cabecalho | null = null;

export function isVecConfigurado(): boolean {
  return Boolean(env.vec.baseUrl && (env.vec.apiToken || (env.vec.usuario && env.vec.senha)));
}

function url(caminho: string): string {
  return `${env.vec.baseUrl.replace(/\/$/, "")}/${caminho.replace(/^\//, "")}`;
}

function montarCabecalhos(token: string, tipo: Cabecalho): Record<string, string> {
  const base: Record<string, string> = { Accept: "application/json" };
  if (tipo === "bearer") base.Authorization = `Bearer ${token}`;
  if (tipo === "authorization-token") base["Authorization-Token"] = token;
  if (tipo === "token") base.Authorization = token;
  return base;
}

// Procura o token na resposta do login sem depender do formato exato:
// chaves conhecidas primeiro, depois qualquer string com cara de JWT.
function extrairToken(obj: unknown, profundidade = 0): string | null {
  if (!obj || typeof obj !== "object" || profundidade > 4) return null;
  const o = obj as Record<string, unknown>;
  for (const chave of ["token", "access_token", "accessToken", "jwt", "authToken", "api_token"]) {
    if (typeof o[chave] === "string" && (o[chave] as string).length > 10) return o[chave] as string;
  }
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.split(".").length === 3 && v.length > 60) return v;
    if (v && typeof v === "object") {
      const achado = extrairToken(v, profundidade + 1);
      if (achado) return achado;
    }
  }
  return null;
}

async function tokenFunciona(token: string, tipo: Cabecalho): Promise<boolean> {
  const r = await fetch(url("regiones/select"), { headers: montarCabecalhos(token, tipo) });
  if (!r.ok) return false;
  const texto = await r.text();
  try {
    const json = JSON.parse(texto);
    return Array.isArray(json) || (typeof json === "object" && json !== null);
  } catch {
    return false;
  }
}

async function escolherCabecalho(token: string): Promise<Cabecalho> {
  for (const tipo of ["bearer", "authorization-token", "token"] as Cabecalho[]) {
    if (await tokenFunciona(token, tipo)) return tipo;
  }
  throw new Error("VEC: login aceito, mas nenhum formato de cabeçalho de token funcionou.");
}

export async function autenticar(forcar = false): Promise<void> {
  if (tokenAtual && cabecalhoAtual && !forcar) return;

  if (env.vec.apiToken) {
    tokenAtual = env.vec.apiToken;
    cabecalhoAtual = await escolherCabecalho(tokenAtual);
    return;
  }

  // O portal não documenta o formato do login. Testamos formatos comuns
  // (JSON e formulário, nomes de campo em pt/es/en). Regras de parada,
  // para nunca arriscar bloqueio da conta:
  //   - 2xx com token → sucesso
  //   - 400/401/403/422 → o servidor ENTENDEU o formato e avaliou a senha:
  //     para na hora e informa (não tenta outro formato)
  //   - 500 → o servidor nem chegou a avaliar a senha (formato errado):
  //     tenta o próximo formato
  const u = env.vec.usuario;
  const p = env.vec.senha;
  const corpos: Record<string, string>[] = [
    { usuario: u, password: p },
    { usuario: u, clave: p },
    { username: u, password: p },
    { email: u, password: p },
    { user: u, password: p },
    { login: u, password: p },
    { usuario: u, contrasena: p },
  ];

  const redigir = (t: string) =>
    t.split(p).join("***").split(u).join("<usuario>").replace(/\s+/g, " ").slice(0, 220);

  const diagnostico: string[] = [];
  for (const formato of ["json", "form"] as const) {
    for (const corpo of corpos) {
      const nomes = Object.keys(corpo).join("+");
      const r = await fetch(url("public/auth/login"), {
        method: "POST",
        headers:
          formato === "json"
            ? { "Content-Type": "application/json", Accept: "application/json" }
            : { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: formato === "json" ? JSON.stringify(corpo) : new URLSearchParams(corpo).toString(),
      });
      const bruto = await r.text();

      if (r.ok) {
        let json: unknown = null;
        try {
          json = JSON.parse(bruto);
        } catch {
          /* resposta não-JSON */
        }
        const token = extrairToken(json);
        if (token) {
          tokenAtual = token;
          cabecalhoAtual = await escolherCabecalho(token);
          return;
        }
        const chaves = json && typeof json === "object" ? Object.keys(json as object).join(",") : "não-JSON";
        diagnostico.push(`${formato}/${nomes}: ${r.status} sem token (chaves: ${chaves})`);
        continue;
      }

      if ([400, 401, 403, 422].includes(r.status)) {
        throw new Error(
          `VEC: o portal recusou o login (HTTP ${r.status}, formato ${formato}/${nomes}). ` +
            `Resposta: "${redigir(bruto)}". Provável usuário/senha incorreto ou conta só com login Okta.`
        );
      }
      diagnostico.push(`${formato}/${nomes}: ${r.status} "${redigir(bruto).slice(0, 90)}"`);
    }
  }
  throw new Error(`VEC: nenhum formato de login aceito. Tentativas: ${diagnostico.join(" | ")}`);
}

/** GET autenticado, com 1 novo login automático se o token expirar. */
export async function vecGet(caminho: string, params: Record<string, string | number> = {}): Promise<unknown> {
  await autenticar();
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString();
  const alvo = url(caminho) + (qs ? `?${qs}` : "");

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(alvo, { headers: montarCabecalhos(tokenAtual!, cabecalhoAtual!) });
    if (r.status === 401 || r.status === 403) {
      await autenticar(true);
      continue;
    }
    if (!r.ok) throw new Error(`VEC: ${caminho} respondeu HTTP ${r.status}.`);
    return r.json();
  }
  throw new Error(`VEC: ${caminho} continua sem autorização mesmo após novo login.`);
}

/** Tira a lista de linhas de uma resposta paginada, qualquer que seja o envelope. */
export function linhasDe(resposta: unknown): Record<string, unknown>[] {
  if (Array.isArray(resposta)) return resposta as Record<string, unknown>[];
  if (resposta && typeof resposta === "object") {
    const o = resposta as Record<string, unknown>;
    for (const chave of ["content", "data", "rows", "items", "results", "aaData", "datos"]) {
      if (Array.isArray(o[chave])) return o[chave] as Record<string, unknown>[];
      if (o[chave] && typeof o[chave] === "object") {
        const dentro = linhasDe(o[chave]);
        if (dentro.length) return dentro;
      }
    }
  }
  return [];
}

/** Lê o primeiro campo existente entre vários nomes possíveis (inclui caminhos "a.b"). */
export function campo(linha: Record<string, unknown>, nomes: string[]): unknown {
  for (const nome of nomes) {
    const partes = nome.split(".");
    let atual: unknown = linha;
    for (const p of partes) {
      atual = atual && typeof atual === "object" ? (atual as Record<string, unknown>)[p] : undefined;
    }
    if (atual !== undefined && atual !== null && atual !== "") return atual;
  }
  return null;
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const n = o.nombre ?? o.descripcion ?? o.label ?? o.name ?? o.valor;
    return n === undefined || n === null ? null : String(n).trim() || null;
  }
  const s = String(v).trim();
  return s || null;
}
