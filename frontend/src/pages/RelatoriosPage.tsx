import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mensagemErro } from "../api";

type Tipo = "semanal" | "quinzenal" | "personalizado" | "mensal" | "bimestral" | "semestral" | "anual";
interface Rel { id: string; tipo: Tipo; periodo_inicio: string; periodo_fim: string; titulo: string; gerado_em: string; autor_nome: string; link_ativo: boolean; link_expira_em: string | null }

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function RelatoriosPage() {
  const hoje = new Date();
  const [lista, setLista] = useState<Rel[] | null>(null);
  const [perfilFalta, setPerfilFalta] = useState<string[]>([]);
  const [tipo, setTipo] = useState<Tipo>("mensal");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [periodo, setPeriodo] = useState(hoje.getMonth() + 1);
  const iso = hoje.toISOString().slice(0, 10);
  const [dataSem, setDataSem] = useState(iso);
  const [quinzena, setQuinzena] = useState(hoje.getDate() <= 15 ? 1 : 2);
  const [de, setDe] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [ate, setAte] = useState(iso);
  const [msg, setMsg] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [link, setLink] = useState<{ rel: Rel; url: string | null; expira: string | null; dias: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([api.get<Rel[]>("/relatorios"), api.get<{ faltando: string[] }>("/perfil")]);
      setLista(l.data); setPerfilFalta(p.data.faltando);
    } catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível carregar os relatórios.") }); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const opcoes = useMemo(() => {
    if (tipo === "mensal" || tipo === "quinzenal") return MESES.map((m, i) => ({ v: i + 1, t: m }));
    if (tipo === "bimestral") return [1, 2, 3, 4, 5, 6].map((b) => ({ v: b, t: `${b}º bimestre (${MESES[b * 2 - 2].slice(0, 3)}–${MESES[b * 2 - 1].slice(0, 3)})` }));
    if (tipo === "semestral") return [{ v: 1, t: "1º semestre (jan–jun)" }, { v: 2, t: "2º semestre (jul–dez)" }];
    return [];
  }, [tipo]);
  useEffect(() => { setPeriodo(tipo === "mensal" || tipo === "quinzenal" ? hoje.getMonth() + 1 : 1); }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gerar() {
    setMsg(null); setOcupado(true);
    try {
      const r = await api.post<{ id: string; titulo: string }>("/relatorios", { tipo, ano, periodo: ["anual", "semanal", "personalizado"].includes(tipo) ? undefined : periodo, data: tipo === "semanal" ? dataSem : undefined, quinzena: tipo === "quinzenal" ? quinzena : undefined, de: tipo === "personalizado" ? de : undefined, ate: tipo === "personalizado" ? ate : undefined });
      await carregar();
      setMsg({ tipo: "sucesso", texto: `${r.data.titulo} gerado. Use “Abrir PDF” na lista abaixo.` });
    } catch (e: any) {
      if (e?.response?.data?.code === "perfil_incompleto") setPerfilFalta(["cadastro"]);
      setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível gerar o relatório.") });
    } finally { setOcupado(false); }
  }

  async function abrir(r: Rel, baixar: boolean) {
    setMsg(null);
    try {
      const resp = await api.get(`/relatorios/${r.id}/pdf`, { params: baixar ? { baixar: 1 } : undefined, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      if (baixar) { const a = document.createElement("a"); a.href = url; a.download = `${r.titulo}.pdf`; a.click(); }
      else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível abrir o PDF.") }); }
  }

  async function criarLink() {
    if (!link) return;
    setMsg(null);
    try {
      const r = await api.post<{ url: string; expira_em: string }>(`/relatorios/${link.rel.id}/link`, { dias: link.dias });
      setLink({ ...link, url: r.data.url, expira: r.data.expira_em }); setCopiado(false); void carregar();
    } catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível criar o link.") }); }
  }
  async function revogar() {
    if (!link) return;
    try { await api.delete(`/relatorios/${link.rel.id}/link`); setLink(null); void carregar(); setMsg({ tipo: "sucesso", texto: "Link revogado. Quem já o tinha não consegue mais abrir." }); }
    catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível revogar.") }); }
  }
  async function copiar() {
    if (!link?.url) return;
    try { await navigator.clipboard.writeText(link.url); setCopiado(true); } catch { setMsg({ tipo: "erro", texto: "Não foi possível copiar. Selecione o link e copie manualmente." }); }
  }

  const anos = Array.from({ length: 4 }, (_, i) => hoje.getFullYear() - i);

  return (
    <div>
      <h1>Relatórios</h1>
      <p className="descricao-pagina">Gere relatórios semanais, quinzenais, mensais, bimestrais, semestrais, anuais ou entre datas em PDF para apresentar em reunião, e compartilhe por link. Visível apenas para superadmin e admin.</p>
      {msg && <div className={msg.tipo === "erro" ? "erro" : "sucesso"} role="status" aria-live="polite">{msg.texto}</div>}

      {perfilFalta.length > 0 && (
        <div className="insp-aviso" role="note">
          <strong>Complete seu cadastro antes do primeiro relatório</strong>
          <span>Seu nome, cargo, empresa e telefone aparecem no cabeçalho e no rodapé do PDF. <a href="/perfil?voltar=relatorios">Preencher meu cadastro</a></span>
        </div>
      )}

      <div className="painel">
        <h2 style={{ marginTop: 0 }}>Novo relatório</h2>
        <div className="filtros">
          <label className="insp-sub">Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              <option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="bimestral">Bimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="personalizado">Entre datas</option>
            </select>
          </label>
          {tipo === "semanal" && <label className="insp-sub">Qualquer dia da semana<input type="date" value={dataSem} onChange={(e) => setDataSem(e.target.value)} /></label>}
          {tipo === "personalizado" && <><label className="insp-sub">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label><label className="insp-sub">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label></>}
          {tipo !== "semanal" && tipo !== "personalizado" && (
          <label className="insp-sub">Ano
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          </label>)}
          {tipo === "quinzenal" && <label className="insp-sub">Quinzena<select value={quinzena} onChange={(e) => setQuinzena(Number(e.target.value))}><option value={1}>1ª (dia 1 a 15)</option><option value={2}>2ª (dia 16 ao fim)</option></select></label>}
          {tipo !== "anual" && tipo !== "semanal" && tipo !== "personalizado" && (
            <label className="insp-sub">Período
              <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>{opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</select>
            </label>
          )}
          <button className="btn btn-primario" style={{ width: "auto", alignSelf: "end" }} disabled={ocupado || perfilFalta.length > 0} onClick={gerar}>{ocupado ? "Gerando..." : "Gerar relatório"}</button>
        </div>
        <small className="insp-sub">Frota: posição no momento da geração. Manutenções, ocorrências e inspeções: dentro do período escolhido. O PDF fica salvo e pode ser aberto de novo igual ao apresentado.</small>
      </div>

      <div className="painel">
        <h2 style={{ marginTop: 0 }}>Relatórios gerados</h2>
        {!lista ? <p className="carregando">Carregando...</p> : lista.length === 0 ? <p className="vazio">Nenhum relatório gerado ainda.</p> : (
          <div className="bsc-tabela-wrap">
            <table>
              <thead><tr><th>Relatório</th><th>Gerado em</th><th>Por</th><th>Link</th><th></th></tr></thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.titulo}</strong></td>
                    <td>{fmt(r.gerado_em)}</td>
                    <td>{r.autor_nome || "—"}</td>
                    <td>{r.link_ativo ? <span className="tag tag-ativa" title={`Expira em ${fmt(r.link_expira_em)}`}>Ativo</span> : <span className="insp-sub">Sem link</span>}</td>
                    <td className="insp-acoes">
                      <button className="btn btn-primario" style={{ width: "auto" }} onClick={() => abrir(r, false)}>Abrir PDF</button>
                      <button className="btn btn-secundario" onClick={() => abrir(r, true)}>Baixar</button>
                      <button className="btn btn-secundario" onClick={() => { setLink({ rel: r, url: null, expira: null, dias: 30 }); setCopiado(false); }}>Link</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {link && (
        <div className="modal-fundo" onClick={() => setLink(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Compartilhar relatório</h2>
            <p className="subtitulo">{link.rel.titulo}</p>
            <div className="insp-aviso" role="note"><strong>Quem tiver o link abre o PDF sem login</strong><span>Compartilhe só com quem deve ver. O link expira sozinho e você pode revogar a qualquer momento.</span></div>
            {!link.url ? (
              <>
                <div className="campo"><label>Validade do link</label>
                  <select value={link.dias} onChange={(e) => setLink({ ...link, dias: Number(e.target.value) })}>
                    <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
                  </select></div>
                <div className="acoes">
                  <button className="btn btn-secundario" onClick={() => setLink(null)}>Fechar</button>
                  {link.rel.link_ativo && <button className="btn btn-secundario" onClick={revogar}>Revogar link atual</button>}
                  <button className="btn btn-primario" style={{ width: "auto" }} onClick={criarLink}>{link.rel.link_ativo ? "Gerar novo link" : "Gerar link"}</button>
                </div>
                {link.rel.link_ativo && <small className="insp-sub">Já existe um link ativo. Gerar um novo invalida o anterior.</small>}
              </>
            ) : (
              <>
                <div className="campo"><label>Link do PDF (válido até {fmt(link.expira)})</label><input readOnly value={link.url} onFocus={(e) => e.target.select()} /></div>
                <div className="acoes">
                  <button className="btn btn-secundario" onClick={revogar}>Revogar</button>
                  <button className="btn btn-primario" style={{ width: "auto" }} onClick={copiar}>{copiado ? "Copiado" : "Copiar link"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
