import { PoolClient } from "pg";
import { Autor, Doc, COR, cabecalhoRodape, fmtDataBR, fmtInt, kpis, nota, novoDocumento, secao, tabela } from "./relatorioPdf";
import { carregarPerfil, perfilCompleto } from "./routes/perfil.routes";

// PDFs "por datas" das telas Checklists (VEC) e BSC, com o mesmo cabeçalho/rodapé dos relatórios.

export type Autoria = { autor: Autor } | { erro: string };

// O admin só exporta depois de completar o cadastro (aparece no cabeçalho e no rodapé).
export async function autorParaPdf(c: PoolClient, userId: string): Promise<Autoria> {
  const perfil = await carregarPerfil(c, userId);
  if (!perfil) return { erro: "Usuário não encontrado." };
  const falta = perfilCompleto(perfil);
  if (falta.length) return { erro: `Complete seu cadastro antes de exportar. Faltam: ${falta.join(", ")}.` };
  return { autor: perfil as Autor };
}

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export interface LinhaChecklistVec { data_hora: string; placa: string; svc: string | null; tipo_formulario: string; motorista: string | null; num_falhas: number }
export interface TotaisChecklistVec { total: number; com_falhas: number; falhas: number; veiculos: number }

export function pdfChecklistsVec(a: { autor: Autor; de: string; ate: string; filtro: string; totais: TotaisChecklistVec; linhas: LinhaChecklistVec[]; porVeiculo: { placa: string; total: number; falhas: number }[]; truncado: boolean }): Doc {
  const titulo = `Checklists VEC — ${fmtDataBR(a.de)} a ${fmtDataBR(a.ate)}`;
  const doc = novoDocumento(titulo, `Fonte: VEC (somente consulta)${a.filtro ? "   ·   Filtro: " + a.filtro : ""}`, a.autor);
  secao(doc, "Resumo do período");
  kpis(doc, [
    { rotulo: "Checklists", valor: fmtInt(a.totais.total) },
    { rotulo: "Com falhas", valor: fmtInt(a.totais.com_falhas) },
    { rotulo: "Falhas somadas", valor: fmtInt(a.totais.falhas) },
    { rotulo: "Veículos", valor: fmtInt(a.totais.veiculos) },
  ]);
  if (a.porVeiculo.length) {
    secao(doc, "Veículos com mais falhas");
    tabela(doc, [{ t: "Placa", w: 2 }, { t: "Checklists", w: 1, r: true }, { t: "Falhas", w: 1, r: true }], a.porVeiculo.map((v) => [v.placa, v.total, v.falhas]));
  }
  secao(doc, "Checklists do período", 90);
  if (!a.linhas.length) nota(doc, "Nenhum checklist no período.");
  else tabela(doc, [{ t: "Data", w: 1.6 }, { t: "Placa", w: 1.2 }, { t: "SVC", w: 1.2 }, { t: "Tipo", w: 1.8 }, { t: "Motorista", w: 2 }, { t: "Falhas", w: 0.8, r: true }],
    a.linhas.map((l) => [hora(l.data_hora), l.placa, l.svc ?? "—", l.tipo_formulario, l.motorista ?? "—", l.num_falhas]));
  if (a.truncado) nota(doc, `Foram listados os ${a.linhas.length} checklists mais recentes. Reduza o período para ver todos.`);
  cabecalhoRodape(doc, titulo, a.autor, new Date().toISOString(), "Dados da VEC (somente consulta), bases SMG3, SMG5 e SMG9.");
  doc.flushPages();
  return doc;
}

export interface PaginaBsc { pagina: string; coletado_em: string; linhas: string[]; tabelas: string[][][]; numeros: { rotulo: string; valor: string }[] }

export function pdfBsc(a: { autor: Autor; de: string; ate: string; bases: string[]; paginas: PaginaBsc[]; filtro?: string }): Doc {
  const titulo = `BSC — ${fmtDataBR(a.de)} a ${fmtDataBR(a.ate)}`;
  const doc = novoDocumento(titulo, `Scorecard do fornecedor (Mercado Livre) · Bases: ${a.bases.join(", ")} · último retrato coletado em cada página do período${a.filtro ? "   ·   Filtro: " + a.filtro : ""}`, a.autor);
  a.paginas.forEach((p, i) => {
    secao(doc, p.pagina, 120);
    nota(doc, `Coletado em ${hora(p.coletado_em)} — fonte: BSC (Looker Studio).`);
    if (p.numeros.length) {
      const nums = p.numeros.slice(0, 16).map((n) => ({ rotulo: n.rotulo, valor: n.valor }));
      kpis(doc, nums);
    }
    p.tabelas.slice(0, 3).forEach((t) => {
      if (!t.length) return;
      const ncol = Math.min(7, Math.max(...t.map((r) => r.length)));
      const cols = Array.from({ length: ncol }, (_, k) => ({ t: String(t[0][k] ?? ""), w: k === 0 ? 2 : 1, r: k > 0 }));
      tabela(doc, cols, t.slice(1, 41).map((r) => Array.from({ length: ncol }, (_, k) => r[k] ?? "")));
      if (t.length > 41) nota(doc, `Tabela truncada: ${t.length - 41} linha(s) a mais na tela do BSC.`);
    });
    if (!p.numeros.length && !p.tabelas.length) p.linhas.slice(0, 40).forEach((l) => nota(doc, l));
    if (i < a.paginas.length - 1) doc.moveDown(0.5);
  });
  cabecalhoRodape(doc, titulo, a.autor, new Date().toISOString(), `Dados do BSC filtrados para as bases ${a.bases.join(", ")}.`);
  doc.flushPages();
  return doc;
}
export { COR };
