import PDFDocument from "pdfkit";
import { LOGO_JPEG_B64, LOGO_PROPORCAO } from "./logoPdf";

// Geração do PDF a partir do retrato (snapshot) salvo em "relatorios".
// Cabeçalho com logo e rodapé com autor + "Página X de Y" em TODAS as páginas.

export interface RelatorioDados {
  bases: string[];
  frota: { total: number; por_status: { status: string; total: number }[]; por_base: { base: string; total: number; ativos: number; manutencao: number; desmobilizados: number; sem_cooperado: number }[]; por_tipo: { tipo: string; total: number }[] };
  evolucao: { data: string; total: number }[];
  manutencoes: { total: number; custo: number; abertas_agora: number; por_tipo: { tipo: string; total: number; custo: number }[]; por_mes: { mes: string; total: number; custo: number }[]; por_base: { base: string; total: number; custo: number }[]; top_veiculos: { placa: string; total: number; custo: number }[] };
  ocorrencias: { total: number; por_tipo: { tipo: string; total: number }[]; por_status: { status: string; total: number }[] };
  inspecoes: { concluidas: number; com_falhas: number; total_falhas: number; veiculos_inspecionados: number; veiculos_ativos: number; vencidas_agora: number; por_base: { base: string; concluidas: number; com_falhas: number }[] };
}
export interface RelatorioReg {
  id: string; tipo: string; periodo_inicio: string; periodo_fim: string; titulo: string; gerado_em: string;
  dados: RelatorioDados;
  autor: { nome: string; email: string; cargo: string; telefone: string; empresa: string; matricula: string };
}

const COR = { escuro: "#0b0d14", laranja: "#ff6b00", texto: "#1f2937", suave: "#6b7280", zebra: "#f3f4f6", linha: "#d1d5db", ok: "#10b981", azul: "#3b82f6" };
const M = { top: 100, bottom: 62, left: 40, right: 40 };

const fmtInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtDec = (n: number, d = 2) => {
  const [i, f] = Math.abs(n).toFixed(d).split(".");
  return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
};
const fmtBRL = (n: number) => "R$ " + fmtDec(n, 2);
const fmtDataBR = (iso: string) => { const d = String(iso).slice(0, 10).split("-"); return `${d[2]}/${d[1]}/${d[0]}`; };
const fmtDataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const NOME_TIPO_OC: Record<string, string> = { manutencao_solicitada: "Manutenção solicitada", sinistro: "Sinistro", avaria: "Avaria", acidente: "Acidente", multa: "Multa", outro: "Outro" };
const NOME_STATUS_OC: Record<string, string> = { aberta: "Aberta", em_analise: "Em análise", aprovada: "Aprovada", rejeitada: "Rejeitada", resolvida: "Resolvida" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => { const [a, m] = ym.split("-"); return `${MESES[Number(m) - 1]}/${a.slice(2)}`; };

type Doc = InstanceType<typeof PDFDocument>;
const larguraUtil = (doc: Doc) => doc.page.width - M.left - M.right;
const espaco = (doc: Doc, h: number) => { if (doc.y + h > doc.page.height - M.bottom) doc.addPage(); };

function secao(doc: Doc, titulo: string, minimo = 60) {
  espaco(doc, minimo);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(M.left, y, 4, 16).fill(COR.laranja);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COR.escuro).text(titulo, M.left + 12, y + 1, { lineBreak: false });
  doc.y = y + 26;
  doc.x = M.left;
}

function nota(doc: Doc, texto: string) {
  doc.font("Helvetica").fontSize(9).fillColor(COR.suave).text(texto, M.left, doc.y, { width: larguraUtil(doc) });
  doc.moveDown(0.4);
}

function tabela(doc: Doc, cols: { t: string; w: number; r?: boolean }[], linhas: (string | number)[][]) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const esc = larguraUtil(doc) / total;
  const ws = cols.map((c) => c.w * esc);
  const H = 18;
  const cab = () => {
    const y = doc.y;
    doc.rect(M.left, y, larguraUtil(doc), H).fill(COR.escuro);
    let x = M.left;
    cols.forEach((c, i) => { doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(c.t, x + 5, y + 5, { width: ws[i] - 10, align: c.r ? "right" : "left", lineBreak: false }); x += ws[i]; });
    doc.y = y + H;
  };
  espaco(doc, H * 2 + 4);
  cab();
  linhas.forEach((l, ri) => {
    if (doc.y + H > doc.page.height - M.bottom) { doc.addPage(); cab(); }
    const y = doc.y;
    if (ri % 2 === 0) doc.rect(M.left, y, larguraUtil(doc), H).fill(COR.zebra);
    let x = M.left;
    l.forEach((v, i) => { doc.font("Helvetica").fontSize(9).fillColor(COR.texto).text(String(v), x + 5, y + 5, { width: ws[i] - 10, align: cols[i].r ? "right" : "left", lineBreak: false, ellipsis: true }); x += ws[i]; });
    doc.y = y + H;
  });
  doc.x = M.left;
  doc.moveDown(0.5);
}

function barras(doc: Doc, itens: { rotulo: string; valor: number; texto?: string }[], cor = COR.laranja) {
  if (!itens.length) return;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const wRot = 130, wBar = larguraUtil(doc) - wRot - 90;
  itens.forEach((it) => {
    espaco(doc, 20);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COR.texto).text(it.rotulo, M.left, y + 3, { width: wRot - 6, lineBreak: false, ellipsis: true });
    doc.rect(M.left + wRot, y + 2, wBar, 12).fill(COR.zebra);
    doc.rect(M.left + wRot, y + 2, Math.max(2, (it.valor / max) * wBar), 12).fill(cor);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COR.texto).text(it.texto ?? fmtInt(it.valor), M.left + wRot + wBar + 8, y + 3, { width: 80, lineBreak: false });
    doc.y = y + 18;
  });
  doc.x = M.left;
  doc.moveDown(0.4);
}

function linha(doc: Doc, pts: { data: string; total: number }[]) {
  espaco(doc, 150);
  const W = larguraUtil(doc), H = 110, x0 = M.left + 34, y0 = doc.y + 6, w = W - 44;
  const vals = pts.map((p) => p.total);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const span = mx - mn || 1;
  doc.rect(x0, y0, w, H).lineWidth(0.5).strokeColor(COR.linha).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(COR.suave);
  doc.text(fmtInt(mx), M.left, y0 - 3, { width: 30, align: "right", lineBreak: false });
  doc.text(fmtInt(mn), M.left, y0 + H - 7, { width: 30, align: "right", lineBreak: false });
  const px = (i: number) => x0 + (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w);
  const py = (v: number) => y0 + H - 8 - ((v - mn) / span) * (H - 16);
  doc.lineWidth(1.6).strokeColor(COR.laranja);
  pts.forEach((p, i) => (i === 0 ? doc.moveTo(px(i), py(p.total)) : doc.lineTo(px(i), py(p.total))));
  doc.stroke();
  doc.font("Helvetica").fontSize(8).fillColor(COR.suave);
  doc.text(fmtDataBR(pts[0].data), x0, y0 + H + 4, { lineBreak: false });
  doc.text(fmtDataBR(pts[pts.length - 1].data), x0 + w - 70, y0 + H + 4, { width: 70, align: "right", lineBreak: false });
  doc.y = y0 + H + 22;
  doc.x = M.left;
}

function kpis(doc: Doc, itens: { rotulo: string; valor: string }[]) {
  const n = 4, gap = 10, w = (larguraUtil(doc) - gap * (n - 1)) / n, h = 52;
  for (let i = 0; i < itens.length; i += n) {
    espaco(doc, h + 10);
    const y = doc.y;
    itens.slice(i, i + n).forEach((k, j) => {
      const x = M.left + j * (w + gap);
      doc.roundedRect(x, y, w, h, 6).fill(COR.zebra);
      doc.rect(x, y, 3, h).fill(COR.laranja);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(COR.escuro).text(k.valor, x + 12, y + 9, { width: w - 16, lineBreak: false, ellipsis: true });
      doc.font("Helvetica").fontSize(8.5).fillColor(COR.suave).text(k.rotulo, x + 12, y + 32, { width: w - 16, lineBreak: false, ellipsis: true });
    });
    doc.y = y + h + 10;
  }
  doc.x = M.left;
}

export function gerarPdf(rel: RelatorioReg): Doc {
  const d = rel.dados;
  const doc = new PDFDocument({ size: "A4", margins: M, bufferPages: true, info: { Title: rel.titulo, Author: rel.autor.nome, Subject: "GESTÃO DE FROTA — RodaCoop", Creator: "GESTÃO DE FROTA" } });
  const logo = Buffer.from(LOGO_JPEG_B64, "base64");

  // ===== Capa / identificação =====
  doc.font("Helvetica-Bold").fontSize(20).fillColor(COR.escuro).text(rel.titulo, M.left, M.top - 6, { width: larguraUtil(doc) });
  doc.font("Helvetica").fontSize(11).fillColor(COR.suave).text(`Período: ${fmtDataBR(rel.periodo_inicio)} a ${fmtDataBR(rel.periodo_fim)}   ·   Bases: ${d.bases.join(", ")}`, { width: larguraUtil(doc) });
  doc.moveDown(0.8);
  const yAut = doc.y;
  doc.roundedRect(M.left, yAut, larguraUtil(doc), 64, 6).lineWidth(0.8).strokeColor(COR.linha).stroke();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COR.laranja).text("RESPONSÁVEL PELO RELATÓRIO", M.left + 12, yAut + 8, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COR.escuro).text(rel.autor.nome, M.left + 12, yAut + 21, { lineBreak: false });
  doc.font("Helvetica").fontSize(9.5).fillColor(COR.texto).text(`${rel.autor.cargo} · ${rel.autor.empresa}`, M.left + 12, yAut + 36, { lineBreak: false });
  doc.text(`${rel.autor.email} · ${rel.autor.telefone}${rel.autor.matricula ? " · Matrícula " + rel.autor.matricula : ""}`, M.left + 12, yAut + 49, { lineBreak: false });
  doc.y = yAut + 76; doc.x = M.left;

  secao(doc, "Resumo executivo");
  const ativos = d.frota.por_status.find((s) => s.status === "Ativa")?.total ?? 0;
  const emManut = d.frota.por_status.find((s) => s.status === "Manutenção")?.total ?? 0;
  kpis(doc, [
    { rotulo: "Veículos na frota", valor: fmtInt(d.frota.total) },
    { rotulo: "Veículos ativos", valor: `${fmtInt(ativos)} (${d.frota.total ? Math.round((ativos / d.frota.total) * 100) : 0}%)` },
    { rotulo: "Em manutenção agora", valor: fmtInt(emManut) },
    { rotulo: "Manutenções no período", valor: fmtInt(d.manutencoes.total) },
    { rotulo: "Custo de manutenção", valor: fmtBRL(d.manutencoes.custo) },
    { rotulo: "Inspeções concluídas", valor: fmtInt(d.inspecoes.concluidas) },
    { rotulo: "Inspeções com falhas", valor: fmtInt(d.inspecoes.com_falhas) },
    { rotulo: "Ocorrências no período", valor: fmtInt(d.ocorrencias.total) },
  ]);
  nota(doc, "Situação da frota: posição no momento da geração do relatório. Manutenções, ocorrências e inspeções: dentro do período informado.");

  // ===== Frota =====
  secao(doc, "Frota por base");
  tabela(doc, [{ t: "Base", w: 2 }, { t: "Total", w: 1, r: true }, { t: "Ativos", w: 1, r: true }, { t: "Manutenção", w: 1.3, r: true }, { t: "Desmobilizados", w: 1.6, r: true }, { t: "Sem cooperado", w: 1.5, r: true }],
    d.frota.por_base.map((b) => [b.base, b.total, b.ativos, b.manutencao, b.desmobilizados, b.sem_cooperado]));
  if (d.frota.por_tipo.length) { secao(doc, "Frota por tipo de veículo"); barras(doc, d.frota.por_tipo.map((t) => ({ rotulo: t.tipo, valor: t.total })), COR.azul); }
  secao(doc, "Evolução da frota no período", 200);
  if (d.evolucao.length >= 2) {
    linha(doc, d.evolucao);
    const ini = d.evolucao[0].total, fim = d.evolucao[d.evolucao.length - 1].total;
    nota(doc, `De ${fmtInt(ini)} para ${fmtInt(fim)} veículos (${fim - ini >= 0 ? "+" : ""}${fmtInt(fim - ini)}) entre ${fmtDataBR(d.evolucao[0].data)} e ${fmtDataBR(d.evolucao[d.evolucao.length - 1].data)}.`);
  } else nota(doc, "Sem registros diários de frota suficientes neste período para desenhar a evolução.");

  // ===== Manutenções =====
  secao(doc, "Manutenções");
  if (d.manutencoes.total === 0) nota(doc, "Nenhuma manutenção registrada no período.");
  else {
    tabela(doc, [{ t: "Tipo", w: 2 }, { t: "Quantidade", w: 1, r: true }, { t: "Custo", w: 1.4, r: true }], d.manutencoes.por_tipo.map((t) => [t.tipo, t.total, fmtBRL(t.custo)]));
    if (d.manutencoes.por_mes.length > 1) { nota(doc, "Custo por mês:"); barras(doc, d.manutencoes.por_mes.map((m) => ({ rotulo: rotuloMes(m.mes), valor: m.custo, texto: fmtBRL(m.custo) }))); }
    if (d.manutencoes.por_base.length) { nota(doc, "Por base:"); tabela(doc, [{ t: "Base", w: 2 }, { t: "Quantidade", w: 1, r: true }, { t: "Custo", w: 1.4, r: true }], d.manutencoes.por_base.map((b) => [b.base, b.total, fmtBRL(b.custo)])); }
    if (d.manutencoes.top_veiculos.length) { nota(doc, "Veículos com maior custo no período:"); tabela(doc, [{ t: "Placa", w: 2 }, { t: "Manutenções", w: 1, r: true }, { t: "Custo", w: 1.4, r: true }], d.manutencoes.top_veiculos.map((v) => [v.placa, v.total, fmtBRL(v.custo)])); }
    nota(doc, `Manutenções em andamento no momento da geração: ${fmtInt(d.manutencoes.abertas_agora)}.`);
  }

  // ===== Inspeções =====
  secao(doc, "Inspeções (checklist próprio)");
  if (d.inspecoes.concluidas === 0) nota(doc, "Nenhuma inspeção concluída no período.");
  else {
    const taxa = d.inspecoes.concluidas ? Math.round(((d.inspecoes.concluidas - d.inspecoes.com_falhas) / d.inspecoes.concluidas) * 100) : 0;
    kpis(doc, [
      { rotulo: "Inspeções concluídas", valor: fmtInt(d.inspecoes.concluidas) },
      { rotulo: "Sem nenhuma falha", valor: `${taxa}%` },
      { rotulo: "Total de falhas apontadas", valor: fmtInt(d.inspecoes.total_falhas) },
      { rotulo: "Veículos inspecionados", valor: `${fmtInt(d.inspecoes.veiculos_inspecionados)} de ${fmtInt(d.inspecoes.veiculos_ativos)}` },
    ]);
    tabela(doc, [{ t: "Base", w: 2 }, { t: "Concluídas", w: 1, r: true }, { t: "Com falhas", w: 1, r: true }], d.inspecoes.por_base.map((b) => [b.base, b.concluidas, b.com_falhas]));
  }
  nota(doc, `Veículos com inspeção vencida (mais de 15 dias) no momento da geração: ${fmtInt(d.inspecoes.vencidas_agora)}.`);

  // ===== Ocorrências =====
  secao(doc, "Ocorrências");
  if (d.ocorrencias.total === 0) nota(doc, "Nenhuma ocorrência registrada no período.");
  else {
    barras(doc, d.ocorrencias.por_tipo.map((o) => ({ rotulo: NOME_TIPO_OC[o.tipo] ?? o.tipo, valor: o.total })), COR.azul);
    tabela(doc, [{ t: "Situação", w: 2 }, { t: "Quantidade", w: 1, r: true }], d.ocorrencias.por_status.map((s) => [NOME_STATUS_OC[s.status] ?? s.status, s.total]));
  }

  // ===== Cabeçalho e rodapé em todas as páginas =====
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const W = doc.page.width, Hh = doc.page.height;
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.rect(0, 0, W, 78).fill(COR.escuro);
    doc.rect(0, 78, W, 3).fill(COR.laranja);
    const lw = 62 / LOGO_PROPORCAO > 150 ? 150 : 62 / LOGO_PROPORCAO;
    doc.image(logo, M.left, 8, { width: lw, height: lw * LOGO_PROPORCAO });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#ffffff").text("GESTÃO DE FROTA · RodaCoop", W - M.right - 250, 24, { width: 250, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor("#d1d5db").text(rel.titulo, W - M.right - 250, 40, { width: 250, align: "right", lineBreak: false, ellipsis: true });
    doc.moveTo(M.left, Hh - 46).lineTo(W - M.right, Hh - 46).lineWidth(0.5).strokeColor(COR.linha).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(COR.suave);
    doc.text(`Gerado em ${fmtDataHora(rel.gerado_em)} por ${rel.autor.nome} — ${rel.autor.cargo}, ${rel.autor.empresa}`, M.left, Hh - 38, { width: W - M.left - M.right - 90, lineBreak: false, ellipsis: true });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, W - M.right - 90, Hh - 38, { width: 90, align: "right", lineBreak: false });
    doc.text("Documento gerado pela plataforma GESTÃO DE FROTA. Dados das bases " + d.bases.join(", ") + ".", M.left, Hh - 26, { width: W - M.left - M.right, lineBreak: false, ellipsis: true });
    doc.page.margins.bottom = mb;
  }
  doc.flushPages();
  return doc;
}
