// Coletor do BSC (Looker Studio) -> GESTÃO DE FROTA.
//
//   npm run login     1x: abre o navegador; VOCÊ entra com a conta do BSC (sem senha neste script).
//   npm run coletar   headless: abre cada página, lê os dados e envia à plataforma.
//
// O login fica guardado no perfil local (./perfil), no SEU computador.
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

function carregarEnv() {
  const f = path.join(dir, ".env");
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
carregarEnv();

const API_URL = (process.env.API_URL || "").replace(/\/$/, "");
const TOKEN = process.env.BSC_INGEST_TOKEN || "";
const BSC_URL = process.env.BSC_URL || "";
const PAGINAS = (process.env.BSC_PAGINAS || "").split(";").map((s) => s.trim()).filter(Boolean);
const PERFIL = path.join(dir, "perfil");
const modo = process.argv[2] || "coletar";

const NAV_IGNORAR = new Set([
  "Capa", "Glossário", "BSC 360º", "LAST MILE", "FM - FULL", "FIRST MILE XD", "FROTA FIXA", "MIDDLE MILE", "SDD",
  "DRIVERS XP", "TREINAMENTOS", "YMS", "Incentivos e Reajustes", "Financeiro", "Safety", "CADASTRO DE VEÍCULOS",
  "jurídico", "Política de Privacidade",
]);
const RE_VALOR = /^(R\$\s*)?[-+]?\d[\d.,]*\s*(%|k|mil|mi|M|B)?$/i;

async function abrir(headless) {
  mkdirSync(PERFIL, { recursive: true });
  return chromium.launchPersistentContext(PERFIL, {
    headless,
    viewport: { width: 1920, height: 1080 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function login() {
  if (!BSC_URL) throw new Error("Defina BSC_URL no .env");
  const ctx = await abrir(false);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(BSC_URL);
  console.log("\nEntre com a conta do BSC na janela aberta (e-mail, senha e verificação, se pedir).");
  console.log("Quando o relatório aparecer, FECHE A JANELA. O login fica salvo neste computador.\n");
  await new Promise((r) => ctx.on("close", r));
}

async function extrair(page) {
  return page.evaluate(() => {
    const visivel = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const texto = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();
    const linhas = [];
    const vistos = new Set();
    for (const l of (document.body.innerText || "").split("\n")) {
      const t = l.replace(/\s+/g, " ").trim();
      if (t && t.length < 2000 && !vistos.has(t)) {
        vistos.add(t);
        linhas.push(t);
      }
    }
    const tabelas = [];
    for (const tb of document.querySelectorAll("table, [role=table], [role=grid]")) {
      if (!visivel(tb)) continue;
      const linhasT = [];
      for (const tr of tb.querySelectorAll("tr, [role=row]")) {
        const cels = [...tr.querySelectorAll("th, td, [role=columnheader], [role=gridcell], [role=cell]")].map(texto);
        if (cels.some(Boolean)) linhasT.push(cels);
      }
      if (linhasT.length > 1) tabelas.push(linhasT);
    }
    return { linhas, tabelas };
  });
}

function detectarNumeros(linhas) {
  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    if (RE_VALOR.test(linhas[i]) && !RE_VALOR.test(linhas[i - 1]) && linhas[i - 1].length <= 120) {
      out.push({ rotulo: linhas[i - 1], valor: linhas[i] });
    }
  }
  return out;
}

async function enviar(pagina, dados) {
  const linhas = dados.linhas.filter((l) => !NAV_IGNORAR.has(l)).slice(0, 4000);
  const corpo = {
    pagina,
    linhas,
    tabelas: dados.tabelas.slice(0, 30).map((t) => t.slice(0, 1500).map((r) => r.slice(0, 50))),
    numeros: detectarNumeros(linhas).slice(0, 1500),
  };
  const r = await fetch(`${API_URL}/api/bsc/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-token": TOKEN },
    body: JSON.stringify(corpo),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  return { ...corpo, resposta: txt };
}

async function coletar() {
  if (!API_URL || !TOKEN || !BSC_URL || PAGINAS.length === 0) throw new Error("Preencha API_URL, BSC_INGEST_TOKEN, BSC_URL e BSC_PAGINAS no .env");
  const ctx = await abrir(true);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let falhas = 0;
  try {
    await page.goto(BSC_URL, { waitUntil: "networkidle", timeout: 90000 });
    if (/accounts\.google\.com/.test(page.url()) || (await page.getByText("Não é possível acessar o relatório").count())) {
      throw new Error("Sessão do Google expirada ou conta sem acesso. Rode: npm run login");
    }
    for (const nome of PAGINAS) {
      try {
        // O menu do Looker é um carrossel: itens fora da área visível não aceitam clique normal.
        const item = page.getByText(nome, { exact: true });
        const visivel = item.locator("visible=true").first();
        if (await visivel.count()) {
          await visivel.click({ timeout: 15000 });
        } else {
          await item.first().dispatchEvent("click", {}, { timeout: 15000 });
        }
        await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => undefined);
        await page.waitForTimeout(6000); // gráficos do Looker renderizam depois do load
        const dados = await extrair(page);
        const r = await enviar(nome, dados);
        console.log(`OK  ${nome}: ${r.linhas.length} linhas, ${r.tabelas.length} tabelas, ${r.numeros.length} números → ${r.resposta}`);
      } catch (e) {
        falhas++;
        console.error(`ERRO ${nome}: ${e.message}`);
        await page.screenshot({ path: path.join(dir, `erro-${Date.now()}.png`) }).catch(() => undefined);
      }
    }
  } finally {
    await ctx.close();
  }
  process.exit(falhas ? 1 : 0);
}

(modo === "login" ? login() : coletar()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
