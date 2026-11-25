import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

type Resultado = "OK" | "FALHA" | "NA";
interface Item { id: string; categoria: string; texto: string; critico: boolean; ordem: number }
interface Veic { id: string; placa: string; base: string; tipo: string | null; ultimo_proprio: string | null; ultimo_vec: string | null; estado_vec: string | null; vencido: boolean; rascunho_id: string | null }
interface Linha { id: string; placa: string; base: string; data_hora: string; km: string | null; status: "Rascunho" | "Concluido"; num_falhas: number; ocorrencia_id: string | null; executor: string | null }
interface FotoMeta { id: string; item_id: string | null; mime: string; tamanho: number }
interface Detalhe { id: string; placa: string; base: string; data_hora: string; km: string | null; status: "Rascunho" | "Concluido"; num_falhas: number; observacoes: string | null; ocorrencia_id: string | null; executor: string | null; respostas: { item_id: string; resultado: Resultado; observacao: string | null }[]; fotos: FotoMeta[] }

const fmtData = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const MAX_BYTES = 700 * 1024;

// Reduz a foto escolhida no aparelho (lado maior 1280 px, JPEG) para caber no envio.
async function comprimir(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const esc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * esc);
  cv.height = Math.round(bmp.height * esc);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const b: Blob | null = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", q));
    if (b && b.size <= MAX_BYTES) return b;
  }
  throw new Error("Foto muito pesada mesmo após reduzir. Escolha outra.");
}

function Foto({ id, onRemover }: { id: string; onRemover?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let vivo = true;
    api.get(`/checklists-proprios/fotos/${id}`, { responseType: "blob" }).then((r) => {
      if (!vivo) return;
      u = URL.createObjectURL(r.data);
      setUrl(u);
    }).catch(() => undefined);
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return (
    <span className="insp-foto">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto do item" /></a> : <span className="insp-foto-ph">…</span>}
      {onRemover && <button type="button" aria-label="Remover foto" onClick={onRemover}>×</button>}
    </span>
  );
}

function Formulario({ id, itens, somenteLeitura, onVoltar }: { id: string; itens: Item[]; somenteLeitura: boolean; onVoltar: () => void }) {
  const [det, setDet] = useState<Detalhe | null>(null);
  const [resp, setResp] = useState<Record<string, { resultado: Resultado; observacao: string }>>({});
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const refArq = useRef<HTMLInputElement>(null);
  const itemFoto = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await api.get<Detalhe>(`/checklists-proprios/${id}`);
    setDet(r.data);
    setKm(r.data.km ?? "");
    setObs(r.data.observacoes ?? "");
    setResp(Object.fromEntries(r.data.respostas.map((x) => [x.item_id, { resultado: x.resultado, observacao: x.observacao ?? "" }])));
  }, [id]);
  useEffect(() => { carregar().catch((e) => setMsg({ tipo: "erro", texto: mensagemErro(e) })); }, [carregar]);

  const leitura = somenteLeitura || det?.status === "Concluido";
  const respondidos = itens.filter((i) => resp[i.id]).length;
  const grupos = useMemo(() => {
    const m = new Map<string, Item[]>();
    itens.forEach((i) => m.set(i.categoria, [...(m.get(i.categoria) ?? []), i]));
    return [...m.entries()];
  }, [itens]);

  const corpo = () => ({
    km: km === "" ? null : Number(km),
    observacoes: obs || null,
    respostas: Object.entries(resp).map(([item_id, r]) => ({ item_id, resultado: r.resultado, observacao: r.observacao || null })),
  });

  async function salvar() {
    setOcupado(true); setMsg(null);
    try { await api.put(`/checklists-proprios/${id}`, corpo()); setMsg({ tipo: "sucesso", texto: "Rascunho salvo." }); }
    catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível salvar.") }); }
    finally { setOcupado(false); }
  }

  async function concluir() {
    if (!window.confirm("Concluir o checklist? Depois de concluído ele não pode mais ser alterado.")) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await api.post(`/checklists-proprios/${id}/concluir`, corpo());
      await carregar();
      setMsg({ tipo: "sucesso", texto: r.data.ocorrencia_id ? `Checklist concluído com ${r.data.num_falhas} falha(s). Uma ocorrência de manutenção foi aberta automaticamente.` : `Checklist concluído com ${r.data.num_falhas} falha(s).` });
    } catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível concluir.") }); }
    finally { setOcupado(false); }
  }

  async function enviarFoto(file: File) {
    setOcupado(true); setMsg(null);
    try {
      const blob = await comprimir(file);
      const q = itemFoto.current ? `?item_id=${itemFoto.current}` : "";
      await api.post(`/checklists-proprios/${id}/fotos${q}`, blob, { headers: { "Content-Type": "image/jpeg" } });
      await carregar();
    } catch (e) { setMsg({ tipo: "erro", texto: (e as Error).message.startsWith("Foto muito") ? (e as Error).message : mensagemErro(e, "Não foi possível enviar a foto.") }); }
    finally { setOcupado(false); }
  }

  async function removerFoto(fid: string) {
    try { await api.delete(`/checklists-proprios/fotos/${fid}`); await carregar(); }
    catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e) }); }
  }

  if (!det) return <p className="carregando">{msg ? msg.texto : "Carregando..."}</p>;

  return (
    <div>
      <button type="button" className="btn btn-secundario" onClick={onVoltar}>← Voltar</button>
      <h1 style={{ marginTop: 12 }}>Checklist — {det.placa} <span className="tag tag-manutencao">{det.base}</span></h1>
      <p className="subtitulo">
        {det.status === "Concluido" ? `Concluído em ${fmtData(det.data_hora)} por ${det.executor ?? "—"}` : "Rascunho"} · {det.num_falhas > 0 && det.status === "Concluido" ? `${det.num_falhas} falha(s)` : `${respondidos}/${itens.length} itens`}
      </p>
      {msg && <div className={msg.tipo === "erro" ? "erro" : "sucesso"} role="status" aria-live="polite">{msg.texto}</div>}
      <div className="painel">
        <label className="insp-km">Quilometragem (km)
          <input type="number" inputMode="numeric" min={0} value={km} disabled={leitura} onChange={(e) => setKm(e.target.value)} />
        </label>
      </div>
      {grupos.map(([cat, lista]) => (
        <div className="painel" key={cat}>
          <h2>{cat}</h2>
          {lista.map((i) => {
            const r = resp[i.id];
            const falha = r?.resultado === "FALHA";
            const fotos = det.fotos.filter((f) => f.item_id === i.id);
            return (
              <div key={i.id} className={`insp-item${falha ? " insp-item-falha" : ""}`}>
                <div className="insp-item-topo">
                  <span>{i.texto}{i.critico && <span className="insp-critico" title="Falha neste item abre ocorrência"> ● crítico</span>}</span>
                  <div className="insp-seg" role="radiogroup" aria-label={i.texto}>
                    {(["OK", "FALHA", "NA"] as Resultado[]).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={r?.resultado === v} disabled={leitura}
                        className={`insp-seg-${v}${r?.resultado === v ? " ativo" : ""}`}
                        onClick={() => setResp({ ...resp, [i.id]: { resultado: v, observacao: v === "FALHA" ? r?.observacao ?? "" : "" } })}>
                        {v === "NA" ? "N/A" : v === "FALHA" ? "Falha" : "OK"}
                      </button>
                    ))}
                  </div>
                </div>
                {falha && (
                  <div className="insp-falha">
                    <input placeholder="Descreva a falha (mín. 5 caracteres)" value={r.observacao} disabled={leitura} maxLength={1000}
                      onChange={(e) => setResp({ ...resp, [i.id]: { ...r, observacao: e.target.value } })} />
                    <div className="insp-fotos">
                      {fotos.map((f) => <Foto key={f.id} id={f.id} onRemover={leitura ? undefined : () => removerFoto(f.id)} />)}
                      {!leitura && <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => { itemFoto.current = i.id; refArq.current?.click(); }}>📷 Adicionar foto</button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="painel">
        <h2>Observações gerais e fotos gerais</h2>
        <textarea className="insp-obs" rows={3} maxLength={2000} value={obs} disabled={leitura} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        <div className="insp-fotos">
          {det.fotos.filter((f) => !f.item_id).map((f) => <Foto key={f.id} id={f.id} onRemover={leitura ? undefined : () => removerFoto(f.id)} />)}
          {!leitura && <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => { itemFoto.current = null; refArq.current?.click(); }}>📷 Adicionar foto</button>}
        </div>
      </div>
      <input ref={refArq} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviarFoto(f); }} />
      {!leitura && (
        <div className="insp-rodape">
          <span>{respondidos}/{itens.length} itens</span>
          <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={salvar}>Salvar rascunho</button>
          <button type="button" className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado || respondidos < itens.length} onClick={concluir}>Concluir</button>
        </div>
      )}
    </div>
  );
}

export default function InspecoesPage() {
  const { usuario } = useAuth();
  const podeEscrever = !!usuario && ["superadmin", "admin", "gestor_base"].includes(usuario.role);
  const [itens, setItens] = useState<Item[]>([]);
  const [veics, setVeics] = useState<Veic[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aberto, setAberto] = useState<{ id: string; leitura: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fBase, setFBase] = useState("");
  const [fPlaca, setFPlaca] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [novo, setNovo] = useState(false);
  const [vSel, setVSel] = useState("");
  const [kmNovo, setKmNovo] = useState("");

  const recarregar = useCallback(async () => {
    try {
      const [v, l] = await Promise.all([
        api.get<Veic[]>("/checklists-proprios/veiculos"),
        api.get<Linha[]>("/checklists-proprios", { params: { base: fBase || undefined, placa: fPlaca || undefined, status: fStatus || undefined } }),
      ]);
      setVeics(v.data); setLinhas(l.data); setErro(null);
    } catch (e) { setErro(mensagemErro(e, "Não foi possível carregar os checklists.")); }
  }, [fBase, fPlaca, fStatus]);

  useEffect(() => { api.get<Item[]>("/checklists-proprios/itens").then((r) => setItens(r.data)).catch((e) => setErro(mensagemErro(e))); }, []);
  useEffect(() => { const t = setTimeout(() => { void recarregar(); }, 250); return () => clearTimeout(t); }, [recarregar]);

  const mes = new Date().toISOString().slice(0, 7);
  const kpiMes = linhas.filter((l) => l.status === "Concluido" && l.data_hora.slice(0, 7) === mes).length;
  const kpiFalha = linhas.filter((l) => l.status === "Concluido" && l.num_falhas > 0 && l.data_hora.slice(0, 7) === mes).length;
  const kpiVenc = veics.filter((v) => v.vencido).length;

  async function criar() {
    setErro(null);
    try {
      const r = await api.post("/checklists-proprios", { vehicle_id: vSel, km: kmNovo === "" ? undefined : Number(kmNovo) });
      setNovo(false); setAberto({ id: r.data.id, leitura: false });
    } catch (e: any) {
      if (e?.response?.status === 409 && e.response.data?.existente_id) { setNovo(false); setAberto({ id: e.response.data.existente_id, leitura: false }); return; }
      setErro(mensagemErro(e, "Não foi possível criar o checklist."));
    }
  }

  if (aberto) {
    return <Formulario id={aberto.id} itens={itens} somenteLeitura={aberto.leitura || !podeEscrever} onVoltar={() => { setAberto(null); void recarregar(); }} />;
  }

  const bases = Array.from(new Set(veics.map((v) => v.base)));
  return (
    <div>
      <h1>Inspeções (checklist próprio)</h1>
      <p className="subtitulo">Inspeção quinzenal dos veículos das bases SMG3, SMG5 e SMG9. A VEC é só consulta: nada daqui é enviado a ela.</p>
      {erro && <div className="erro">{erro}</div>}
      <div className="bsc-grade">
        <div className="bsc-numero"><small>Concluídos no mês</small><strong>{kpiMes}</strong></div>
        <div className="bsc-numero"><small>Com falha no mês</small><strong>{kpiFalha}</strong></div>
        <div className="bsc-numero"><small>Veículos vencidos (&gt; 15 dias)</small><strong>{kpiVenc}</strong></div>
        <div className="bsc-numero"><small>Veículos no escopo</small><strong>{veics.length}</strong></div>
      </div>
      <div className="painel">
        <div className="barra-topo">
          <div className="filtros">
            <select value={fBase} onChange={(e) => setFBase(e.target.value)} aria-label="Base"><option value="">Todas as bases</option>{bases.map((b) => <option key={b}>{b}</option>)}</select>
            <input placeholder="Placa..." value={fPlaca} onChange={(e) => setFPlaca(e.target.value)} />
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="">Todos</option><option value="Rascunho">Rascunho</option><option value="Concluido">Concluído</option></select>
          </div>
          {podeEscrever && <button className="btn btn-primario" style={{ width: "auto" }} onClick={() => { setNovo(true); setVSel(""); setKmNovo(""); }}>Novo checklist</button>}
        </div>
        {linhas.length === 0 ? <p className="vazio">Nenhum checklist ainda. Use "Novo checklist" para começar.</p> : (
          <div className="bsc-tabela-wrap">
            <table>
              <thead><tr><th>Data</th><th>Placa</th><th>Base</th><th>Executor</th><th>Km</th><th>Falhas</th><th>Status</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => setAberto({ id: l.id, leitura: l.status === "Concluido" })}>
                    <td>{fmtData(l.data_hora)}</td><td><strong>{l.placa}</strong></td><td>{l.base}</td><td>{l.executor ?? "—"}</td>
                    <td>{l.km ? Number(l.km).toLocaleString("pt-BR") : "—"}</td>
                    <td>{l.status === "Concluido" ? (l.num_falhas > 0 ? <strong>{l.num_falhas}</strong> : "0") : "—"}</td>
                    <td><span className={l.status === "Concluido" ? "tag tag-concluida" : "tag tag-em_andamento"}>{l.status === "Concluido" ? "Concluído" : "Rascunho"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="painel">
        <h2>Veículos vencidos</h2>
        {veics.filter((v) => v.vencido).length === 0 ? <p className="vazio">Todos os veículos estão em dia.</p> : (
          <div className="bsc-tabela-wrap">
            <table>
              <thead><tr><th>Placa</th><th>Base</th><th>Último checklist próprio</th><th>Último na VEC (consulta)</th></tr></thead>
              <tbody>{veics.filter((v) => v.vencido).map((v) => <tr key={v.id}><td><strong>{v.placa}</strong></td><td>{v.base}</td><td>{v.ultimo_proprio ? fmtData(v.ultimo_proprio) : "Nunca"}</td><td>{fmtData(v.ultimo_vec)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {novo && (
        <div className="modal-fundo" onClick={() => setNovo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Novo checklist</h2>
            <div className="campo"><label>Veículo</label>
              <select value={vSel} onChange={(e) => setVSel(e.target.value)}>
                <option value="">Selecione…</option>
                {veics.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.base}{v.rascunho_id ? " (rascunho)" : v.vencido ? " (vencido)" : ""}</option>)}
              </select>
            </div>
            <div className="campo"><label>Quilometragem atual (km)</label><input type="number" inputMode="numeric" min={0} value={kmNovo} onChange={(e) => setKmNovo(e.target.value)} /></div>
            <div className="acoes"><button className="btn btn-secundario" onClick={() => setNovo(false)}>Cancelar</button><button className="btn btn-primario" style={{ width: "auto" }} disabled={!vSel} onClick={criar}>Começar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
