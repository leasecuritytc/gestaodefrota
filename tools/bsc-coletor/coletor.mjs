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

// Texto da página FORA das tabelas (indicadores, títulos, avisos), um bloco por linha.
async function extrair(page) {
  return page.evaluate(() => {
    const linhas = [];
    const vistos = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("upgraded-table") || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const t = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (t && t.length < 2000 && !vistos.has(t)) {
        vistos.add(t);
        linhas.push(t);
      }
    }
    return { linhas, tabelas: [] };
  });
}

// Tabelas do Looker (<upgraded-table>): só ~12 linhas ficam no DOM por vez (virtualização).
// Rolamos a tabela com a roda do mouse e juntamos as linhas pelo índice; depois avançamos a página.
const MAX_LINHAS_TABELA = Number(process.env.BSC_MAX_LINHAS_TABELA || 800);

function limparCabecalho(t) {
  return t.replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim().replace(/\s+\d+$/, "");
}

async function extrairTabelasLooker(page) {
  const tabelas = [];
  const notas = [];
  const total = await page.locator("upgraded-table").count();
  for (let i = 0; i < total; i++) {
    const t = page.locator("upgraded-table").nth(i);
    try {
      if (!(await t.isVisible())) continue;
      await t.scrollIntoViewIfNeeded().catch(() => undefined);
      const cab = await t.evaluate((el) =>
        [...el.querySelectorAll(".centerHeaderRow > *")].map((c) => (c.innerText || "").trim()).filter(Boolean)
      );
      const cabecalho = cab.map(limparCabecalho);
      const lerLinhas = () =>
        t.evaluate((el) =>
          [...el.querySelectorAll(".centerColsContainer .row")].map((r) => ({
            k: (r.className.match(/block-\d+/) || [""])[0] + (r.className.match(/index-\d+/) || [""])[0],
            cels: [...r.querySelectorAll(".cell-value")].map((c) => (c.innerText || "").replace(/\s+/g, " ").trim()),
          }))
        );
      const rotuloPagina = () => t.locator(".pageLabel").first().innerText().catch(() => "");
      const parse = (x) => {
        const m = x.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
        return m ? { ini: +m[1], fim: +m[2], tot: +m[3] } : null;
      };

      const todas = [];
      let totalReal = 0;
      for (let pg = 0; pg < 400 && todas.length < MAX_LINHAS_TABELA; pg++) {
        const info = parse(await rotuloPagina());
        if (info) totalReal = info.tot;
        const esperadas = info ? info.fim - info.ini + 1 : 0;
        const mapa = new Map();
        const corpo = t.locator(".tableBody").first();
        await corpo.hover({ timeout: 5000 }).catch(() => undefined);
        await page.mouse.wheel(0, -100000);
        await page.waitForTimeout(400);
        let semNovas = 0;
        for (let passo = 0; passo < 60; passo++) {
          const antes = mapa.size;
          for (const l of await lerLinhas()) if (l.k && l.cels.length) mapa.set(l.k, l.cels);
          if (esperadas && mapa.size >= esperadas) break;
          semNovas = mapa.size === antes ? semNovas + 1 : 0;
          if (semNovas >= 3) break;
          await page.mouse.wheel(0, 260);
          await page.waitForTimeout(250);
        }
        const ordenadas = [...mapa.entries()]
          .sort((a, b) => Number((a[0].match(/index-(\d+)/) || [0, 0])[1]) - Number((b[0].match(/index-(\d+)/) || [0, 0])[1]))
          .map((e) => e[1]);
        todas.push(...ordenadas);
        const prox = t.locator(".pageForward").first();
        const desabilitado = (await prox.count()) === 0 || /disabled/.test((await prox.getAttribute("class")) || "");
        if (desabilitado) break;
        await prox.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
      }
      if (todas.length) {
        const largura = Math.max(...todas.slice(0, 20).map((r) => r.length));
        const cabOk = cabecalho.length === largura ? cabecalho : Array.from({ length: largura }, (_, c) => cabecalho[c] || `Coluna ${c + 1}`);
        tabelas.push([cabOk, ...todas.slice(0, MAX_LINHAS_TABELA)]);
        const gravadas = Math.min(todas.length, MAX_LINHAS_TABELA);
        notas.push(`Tabela ${tabelas.length} (${cabOk.slice(0, 4).join(", ")}…): ${gravadas} de ${totalReal || "?"} linhas${gravadas < (totalReal || 0) ? " (amostra)" : ""}`);
      }
    } catch (e) {
      notas.push(`Tabela ${i + 1}: não foi possível ler (${String(e.message).split("\n")[0]})`);
    }
  }
  return { tabelas, notas };
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


async function fecharMenus(page) {
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

// O menu do Looker é um carrossel: itens fora da área visível não aceitam clique normal.
async function clicarMenu(page, nome) {
  await fecharMenus(page);
  const item = page.getByText(nome, { exact: true });
  const visivel = item.locator("visible=true").first();
  if (await visivel.count()) {
    await visivel.click({ timeout: 15000 });
  } else {
    await item.first().dispatchEvent("click", {}, { timeout: 15000 });
  }
  await page.waitForTimeout(1500);
}

// Itens do submenu aberto (overlay), se houver.
async function itensSubmenu(page) {
  return page.evaluate(() => {
    const sel = ".cdk-overlay-container [role=menuitem], .cdk-overlay-container .mat-mdc-menu-item, .cdk-overlay-container .mat-menu-item, .cdk-overlay-container button";
    return [...new Set([...document.querySelectorAll(sel)].map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
  });
}

async function coletarTela(page, rotulo) {
  await fecharMenus(page);
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(6000); // gráficos do Looker renderizam depois do load
  const dados = await extrair(page);
  const { tabelas, notas } = await extrairTabelasLooker(page);
  dados.tabelas = tabelas;
  dados.linhas.push(...notas);
  const r = await enviar(rotulo, dados);
  console.log(`OK  ${rotulo}: ${r.linhas.length} linhas, ${r.tabelas.length} tabelas, ${r.numeros.length} números → ${r.resposta}`);
}

// "FROTA FIXA" coleta todas as subpáginas do menu; "FROTA FIXA > Disponibilidade/Utilização" coleta só uma.
async function coletarItem(page, nome) {
  const [pai, filho] = nome.split(">").map((x) => x.trim());
  await clicarMenu(page, pai);
  const subs = filho ? [filho] : await itensSubmenu(page);
  if (subs.length === 0) {
    await coletarTela(page, pai);
    return;
  }
  for (let i = 0; i < subs.length; i++) {
    if (i > 0) await clicarMenu(page, pai);
    try {
      await page.locator(".cdk-overlay-container").getByText(subs[i], { exact: true }).first().click({ timeout: 15000 });
      await coletarTela(page, `${pai} > ${subs[i]}`);
    } catch (e) {
      console.error(`ERRO ${pai} > ${subs[i]}: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: path.join(dir, `erro-${Date.now()}.png`) }).catch(() => undefined);
    }
  }
}

async function coletar() {
  if (!API_URL || !TOKEN || !BSC_URL || PAGINAS.length === 0) throw new Error("Preencha API_URL, BSC_INGEST_TOKEN, BSC_URL e BSC_PAGINAS no .env");
  const ctx = await abrir(true);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let falhas = 0;
  try {
    // O Looker Studio nunca fica "ocioso" na rede (atualiza o tempo todo): não usar networkidle aqui.
    await page.goto(BSC_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    const menu = page.getByText(PAGINAS[0], { exact: true }).first();
    const bloqueio = page.getByText("Não é possível acessar o relatório").first();
    const resultado = await Promise.race([
      menu.waitFor({ state: "attached", timeout: 120000 }).then(() => "ok"),
      bloqueio.waitFor({ state: "attached", timeout: 120000 }).then(() => "bloqueado"),
      page.waitForURL(/accounts\.google\.com/, { timeout: 120000 }).then(() => "login"),
    ]).catch(() => "timeout");
    if (resultado === "login" || resultado === "bloqueado") {
      throw new Error("Sessão do Google expirada ou conta sem acesso. Rode: npm run login");
    }
    if (resultado === "timeout") {
      await page.screenshot({ path: path.join(dir, `erro-abertura-${Date.now()}.png`) }).catch(() => undefined);
      throw new Error("O relatório não carregou em 2 minutos (veja o erro-abertura-*.png). Tente de novo.");
    }
    await page.waitForTimeout(4000);
    for (const nome of PAGINAS) {
      try {
        await coletarItem(page, nome);
      } catch (e) {
        falhas++;
        console.error(`ERRO ${nome}: ${e.message.split("\n")[0]}`);
        await page.screenshot({ path: path.join(dir, `erro-${Date.now()}.png`) }).catch(() => undefined);
        await fecharMenus(page);
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
