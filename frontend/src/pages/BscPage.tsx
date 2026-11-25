import { useEffect, useState } from "react";
import { api } from "../api";
import { baixarPdf } from "../utils/pdf";

interface Pagina {
  id: string;
  pagina: string;
  coletado_em: string;
  linhas: string[];
  tabelas: string[][][];
  numeros: { rotulo: string; valor: string }[];
}

function fmtData(v: string) {
  return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface Filtros { de: string; ate: string; pagina: string; base: string; placa: string }
const VAZIO: Filtros = { de: "", ate: "", pagina: "", base: "", placa: "" };
const paramsDe = (f: Filtros) => ({ de: f.de || undefined, ate: f.ate || undefined, pagina: f.pagina || undefined, base: f.base || undefined, placa: f.placa || undefined });

export default function BscPage() {
  const [dados, setDados] = useState<{ configurado: boolean; bases?: string[]; paginas: Pagina[]; todas_paginas?: string[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [form, setForm] = useState<Filtros>(VAZIO);
  const [aplicado, setAplicado] = useState<Filtros | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function pesquisar(f: Filtros = form) {
    setErro(null);
    if (f.de && f.ate && f.de > f.ate) return setErro("A data inicial não pode ser depois da final.");
    setCarregando(true);
    try {
      const r = await api.get("/bsc/pesquisa", { params: paramsDe(f) });
      setDados((antes) => ({ ...r.data, todas_paginas: r.data.todas_paginas ?? antes?.todas_paginas }));
      setAplicado(f);
      setAtiva(r.data.paginas[0]?.pagina ?? null);
    } catch { setErro("Não foi possível pesquisar os dados do BSC."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { void pesquisar(VAZIO); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function limpar() { setForm(VAZIO); void pesquisar(VAZIO); }

  const podeBaixar = !!aplicado?.de && !!aplicado?.ate && !!dados && dados.paginas.length > 0;
  const mudou = !!aplicado && JSON.stringify(aplicado) !== JSON.stringify(form);
  async function baixar() {
    if (!aplicado) return;
    setErro(null); setGerando(true);
    const e = await baixarPdf("/bsc/pdf", paramsDe(aplicado), `bsc_${aplicado.de}_${aplicado.ate}.pdf`);
    if (e) setErro(e);
    setGerando(false);
  }

  const pagina = dados?.paginas.find((p) => p.pagina === ativa);

  return (
    <div>
      <h1>BSC — Scorecard do fornecedor</h1>
      <p className="subtitulo">
        Retratos do relatório "2.0 SRM - BSC Supplier" (Mercado Livre), coletados automaticamente e filtrados só para as bases {(dados?.bases ?? ["SMG3", "SMG5", "SMG9"]).join(", ")}. Visível apenas para superadmin e admin.
      </p>
      {erro && <p className="erro">{erro}</p>}
      <div className="painel">
        <form className="filtros" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); void pesquisar(); }}>
          <label className="insp-sub">Início<input type="date" value={form.de} onChange={(e) => set("de", e.target.value)} /></label>
          <label className="insp-sub">Fim<input type="date" value={form.ate} onChange={(e) => set("ate", e.target.value)} /></label>
          <label className="insp-sub">Página do BSC
            <select value={form.pagina} onChange={(e) => set("pagina", e.target.value)}>
              <option value="">Todas</option>
              {(dados?.todas_paginas ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="insp-sub">Base
            <select value={form.base} onChange={(e) => set("base", e.target.value)}>
              <option value="">Todas</option>
              {(dados?.bases ?? ["SMG3", "SMG5", "SMG9"]).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="insp-sub">Placa<input placeholder="ABC1D23" maxLength={8} value={form.placa} onChange={(e) => set("placa", e.target.value.toUpperCase())} /></label>
          <button className="btn btn-primario" style={{ width: "auto" }} disabled={carregando}>{carregando ? "Pesquisando..." : "Pesquisar"}</button>
          <button type="button" className="btn btn-secundario" onClick={limpar}>Limpar</button>
        </form>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button className="btn btn-secundario" disabled={!podeBaixar || gerando} onClick={baixar}>{gerando ? "Gerando PDF..." : "Baixar PDF da pesquisa"}</button>
          <small className="insp-sub">
            {!aplicado?.de || !aplicado?.ate ? "Informe o início e o fim, pesquise e depois baixe o PDF. Sem datas, a tela mostra o último retrato de cada página." : mudou ? "Você alterou os filtros: clique em Pesquisar para atualizar antes de baixar." : dados && dados.paginas.length === 0 ? "Sem resultados para baixar." : "O PDF terá exatamente o resultado abaixo."}
          </small>
        </div>
      </div>
      {dados && !dados.configurado && (
        <p className="aviso">Ingestão do BSC ainda não configurada no servidor (BSC_INGEST_TOKEN).</p>
      )}
      {dados && dados.paginas.length === 0 && (
        <p className="vazio">Nenhum retrato para esses filtros. Ajuste a pesquisa. Se nunca coletou, rode o coletor (tools/bsc-coletor) no computador com acesso ao BSC.</p>
      )}
      {dados && dados.paginas.length > 0 && (
        <>
          <div className="bsc-abas abas">
            {dados.paginas.map((p) => (
              <button key={p.pagina} className={p.pagina === ativa ? "ativo" : ""} onClick={() => setAtiva(p.pagina)}>
                {p.pagina}
              </button>
            ))}
          </div>
          {pagina && (
            <>
              <p className="subtitulo"><span className="origem-sel" style={{ marginLeft: 0 }}>BSC · Looker Studio</span> Coletado em {fmtData(pagina.coletado_em)}</p>
              {pagina.numeros.length > 0 && (
                <div className="bsc-grade">
                  {pagina.numeros.slice(0, 40).map((n, i) => (
                    <div className="bsc-numero" key={i}>
                      <small>{n.rotulo}</small>
                      <strong>{n.valor}</strong>
                    </div>
                  ))}
                </div>
              )}
              {pagina.linhas.map((l, i) => (
                <p className="subtitulo" key={`n${i}`}>{l}</p>
              ))}
              {pagina.tabelas.map((t, i) => (
                <div className="bsc-tabela-wrap" key={i}>
                  <table>
                    <tbody>
                      {t.slice(0, 200).map((linha, li) => (
                        <tr key={li}>
                          {linha.map((c, ci) => (li === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {pagina.tabelas.length === 0 && pagina.numeros.length === 0 && (
                <div className="bsc-linhas">
                  {pagina.linhas.slice(0, 300).map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
