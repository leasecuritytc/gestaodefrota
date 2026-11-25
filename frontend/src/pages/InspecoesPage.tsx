import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, mensagemErro } from "../api";
import { useAuth } from "../auth";

type Resultado = "OK" | "FALHA" | "NA";
interface Item { id: string; categoria: string; texto: string; critico: boolean; ordem: number }
interface Veic { id: string; placa: string; base: string; tipo: string | null; status: string; chassi: string | null; rentadora: string | null; ultimo_km: string | null; ultimo_proprio: string | null; ultimo_vec: string | null; estado_vec: string | null; vencido: boolean; rascunho_id: string | null }
interface Linha { id: string; placa: string; base: string; data_hora: string; km: string | null; status: "Rascunho" | "Concluido"; num_falhas: number; ocorrencia_id: string | null; executor: string | null }
interface FotoMeta { id: string; item_id: string | null; tipo: "odometro" | "item" | "geral"; mime: string; tamanho: number }
interface Detalhe { km_minimo: number | null; id: string; placa: string; base: string; data_hora: string; km: string | null; status: "Rascunho" | "Concluido"; num_falhas: number; observacoes: string | null; ocorrencia_id: string | null; executor: string | null; respostas: { item_id: string; resultado: Resultado; observacao: string | null }[]; fotos: FotoMeta[] }

const fmtData = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const CIDADES: Record<string, string> = { SMG3: "Pouso Alegre/MG", SMG5: "Poços de Caldas/MG", SMG9: "Varginha/MG" };
const diasDesde = (v: string | null) => (v ? Math.floor((Date.now() - new Date(v).getTime()) / 86400000) : null);
const tagStatus = (s: string) => "tag tag-" + s.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
type Situacao = "todos" | "vencido" | "emdia" | "rascunho";
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
  const tipoFoto = useRef<"odometro" | "item" | "geral">("geral");

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

  const fotoOdo = det?.fotos.find((f) => f.tipo === "odometro");
  const kmNum = km === "" ? null : Number(km);
  const kmBaixo = kmNum != null && det?.km_minimo != null && kmNum < det.km_minimo;
  const podeConcluir = respondidos >= itens.length && kmNum != null && !kmBaixo && !!fotoOdo;
  const pendencias = [
    respondidos < itens.length ? `${itens.length - respondidos} item(ns) sem resposta` : null,
    kmNum == null ? "informe a quilometragem" : kmBaixo ? "quilometragem menor que a anterior" : null,
    !fotoOdo ? "foto do odômetro" : null,
  ].filter(Boolean);

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
      const q = tipoFoto.current === "odometro" ? "?tipo=odometro" : itemFoto.current ? `?item_id=${itemFoto.current}` : "";
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
        <h2>Odômetro</h2>
        <div className="insp-aviso" role="note"><strong>⚠ Atenção ao odômetro</strong><span>Confira o número no painel do veículo e digite exatamente como aparece. A foto precisa mostrar a quilometragem legível. O km não pode ser menor que o já lançado, e depois de concluída a inspeção não dá para corrigir.</span></div>
        <label className="insp-km">Quilometragem (km) *
          <input type="number" inputMode="numeric" min={det.km_minimo ?? 0} value={km} disabled={leitura} onChange={(e) => setKm(e.target.value)} aria-invalid={kmBaixo} />
        </label>
        {det.km_minimo != null && <small className="insp-sub">Último km lançado: {det.km_minimo.toLocaleString("pt-BR")} km. Não é permitido informar valor menor.</small>}
        {kmBaixo && <div className="erro" role="alert" style={{ marginTop: 8 }}>Quilometragem menor que a já lançada ({det.km_minimo!.toLocaleString("pt-BR")} km). Confira o odômetro.</div>}
        <div className="insp-fotos" style={{ marginTop: 12 }}>
          <strong style={{ fontSize: 13 }}>Foto do odômetro (obrigatória) *</strong>
          {fotoOdo && <Foto key={fotoOdo.id} id={fotoOdo.id} onRemover={leitura ? undefined : () => removerFoto(fotoOdo.id)} />}
          {!leitura && <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => { itemFoto.current = null; tipoFoto.current = "odometro"; refArq.current?.click(); }}>{fotoOdo ? "📷 Trocar foto" : "📷 Fotografar odômetro"}</button>}
        </div>
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
                      {!leitura && <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => { itemFoto.current = i.id; tipoFoto.current = "item"; refArq.current?.click(); }}>📷 Adicionar foto</button>}
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
          {det.fotos.filter((f) => f.tipo === "geral").map((f) => <Foto key={f.id} id={f.id} onRemover={leitura ? undefined : () => removerFoto(f.id)} />)}
          {!leitura && <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => { itemFoto.current = null; tipoFoto.current = "geral"; refArq.current?.click(); }}>📷 Adicionar foto</button>}
        </div>
      </div>
      <input ref={refArq} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviarFoto(f); }} />
      {!leitura && (
        <div className="insp-rodape">
          <span>{respondidos}/{itens.length} itens{pendencias.length > 0 && <small className="insp-sub"> · falta: {pendencias.join("; ")}</small>}</span>
          <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={salvar}>Salvar rascunho</button>
          <button type="button" className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado || !podeConcluir} onClick={concluir}>Concluir</button>
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
  const [aba, setAba] = useState<"veiculos" | "historico">("veiculos");
  const [fBase, setFBase] = useState("");
  const [fBusca, setFBusca] = useState("");
  const [fSit, setFSit] = useState<Situacao>("todos");
  const [fHistStatus, setFHistStatus] = useState("");
  const [alvo, setAlvo] = useState<Veic | null>(null);
  const [kmNovo, setKmNovo] = useState("");
  const [criando, setCriando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const [v, l] = await Promise.all([
        api.get<Veic[]>("/checklists-proprios/veiculos"),
        api.get<Linha[]>("/checklists-proprios", { params: { base: fBase || undefined, placa: aba === "historico" ? fBusca || undefined : undefined, status: fHistStatus || undefined } }),
      ]);
      setVeics(v.data); setLinhas(l.data); setErro(null);
    } catch (e) { setErro(mensagemErro(e, "Não foi possível carregar as inspeções.")); }
  }, [fBase, fBusca, fHistStatus, aba]);

  useEffect(() => { api.get<Item[]>("/checklists-proprios/itens").then((r) => setItens(r.data)).catch((e) => setErro(mensagemErro(e))); }, []);
  useEffect(() => { const t = setTimeout(() => { void recarregar(); }, 250); return () => clearTimeout(t); }, [recarregar]);

  const basesLista = useMemo(() => Array.from(new Set(veics.map((v) => v.base))).sort(), [veics]);
  const resumo = useMemo(() => basesLista.map((b) => {
    const lista = veics.filter((v) => v.base === b);
    const venc = lista.filter((v) => v.vencido).length;
    return { base: b, total: lista.length, vencidos: venc, emdia: lista.length - venc, rascunhos: lista.filter((v) => v.rascunho_id).length };
  }), [veics, basesLista]);
  const total = veics.length;
  const totalVenc = veics.filter((v) => v.vencido).length;
  const conformidade = total ? Math.round(((total - totalVenc) / total) * 100) : 0;
  const mes = new Date().toISOString().slice(0, 7);
  const kpiMes = linhas.filter((l) => l.status === "Concluido" && l.data_hora.slice(0, 7) === mes).length;
  const kpiFalha = linhas.filter((l) => l.status === "Concluido" && l.num_falhas > 0 && l.data_hora.slice(0, 7) === mes).length;

  const visiveis = useMemo(() => veics.filter((v) =>
    (!fBase || v.base === fBase) &&
    (!fBusca || v.placa.toUpperCase().includes(fBusca.toUpperCase().replace(/[^A-Z0-9]/g, ""))) &&
    (fSit === "todos" || (fSit === "vencido" && v.vencido) || (fSit === "emdia" && !v.vencido) || (fSit === "rascunho" && !!v.rascunho_id))
  ), [veics, fBase, fBusca, fSit]);

  async function iniciar(v: Veic, km: string) {
    setErro(null); setCriando(true);
    try {
      if (v.rascunho_id) { setAlvo(null); setAberto({ id: v.rascunho_id, leitura: false }); return; }
      const r = await api.post("/checklists-proprios", { vehicle_id: v.id, km: km === "" ? undefined : Number(km) });
      setAlvo(null); setAberto({ id: r.data.id, leitura: false });
    } catch (e: any) {
      if (e?.response?.status === 409 && e.response.data?.existente_id) { setAlvo(null); setAberto({ id: e.response.data.existente_id, leitura: false }); return; }
      setErro(mensagemErro(e, "Não foi possível iniciar a inspeção."));
      setAlvo(null);
    } finally { setCriando(false); }
  }

  function pedirInspecao(v: Veic) {
    if (v.rascunho_id) { void iniciar(v, ""); return; }
    setKmNovo(v.ultimo_km ? String(Number(v.ultimo_km)) : ""); setAlvo(v);
  }

  const proximoVencido = veics.find((v) => v.vencido && (!fBase || v.base === fBase));

  if (aberto) {
    return <Formulario id={aberto.id} itens={itens} somenteLeitura={aberto.leitura || !podeEscrever} onVoltar={() => { setAberto(null); void recarregar(); }} />;
  }

  return (
    <div>
      <div className="insp-topo">
        <div>
          <h1>Inspeções</h1>
          <p className="subtitulo">Checklist quinzenal dos veículos de {basesLista.length ? basesLista.join(", ") : "SMG3, SMG5 e SMG9"}. A VEC é só consulta: nada daqui é enviado a ela.</p>
        </div>
        {podeEscrever && proximoVencido && (
          <button className="btn btn-primario" style={{ width: "auto" }} onClick={() => pedirInspecao(proximoVencido)}>
            Inspecionar próximo vencido{fBase ? ` (${fBase})` : ""}: {proximoVencido.placa}
          </button>
        )}
      </div>
      {erro && <div className="erro">{erro}</div>}

      <div className="insp-kpis">
        <div className="insp-kpi"><small>Conformidade da frota</small><strong>{conformidade}%</strong>
          <div className="kpi-barra"><span style={{ width: `${conformidade}%`, background: conformidade >= 80 ? "#10b981" : conformidade >= 50 ? "#f59e0b" : "#ef4444" }} /></div>
          <em>{total - totalVenc} de {total} veículos em dia</em></div>
        <div className="insp-kpi"><small>Vencidos (&gt; 15 dias)</small><strong style={{ color: totalVenc ? "var(--err-text, #ef4444)" : undefined }}>{totalVenc}</strong><em>precisam de inspeção</em></div>
        <div className="insp-kpi"><small>Concluídas no mês</small><strong>{kpiMes}</strong><em>{kpiFalha} com falha</em></div>
        <div className="insp-kpi"><small>Rascunhos abertos</small><strong>{veics.filter((v) => v.rascunho_id).length}</strong><em>inspeções em andamento</em></div>
      </div>

      <div className="insp-bases">
        <button type="button" className={`insp-base${fBase === "" ? " ativa" : ""}`} onClick={() => setFBase("")}>
          <span className="insp-base-cod">Todas</span><span className="insp-base-cid">Todas as bases</span>
          <span className="insp-base-num">{total} veículos · <b>{totalVenc}</b> vencidos</span>
        </button>
        {resumo.map((b) => (
          <button type="button" key={b.base} className={`insp-base${fBase === b.base ? " ativa" : ""}`} onClick={() => setFBase(fBase === b.base ? "" : b.base)}>
            <span className="insp-base-cod">{b.base}</span><span className="insp-base-cid">{CIDADES[b.base] ?? ""}</span>
            <span className="insp-base-num">{b.total} veículos · <b>{b.vencidos}</b> vencidos</span>
            <div className="kpi-barra"><span style={{ width: `${b.total ? (b.emdia / b.total) * 100 : 0}%`, background: "#10b981" }} /></div>
          </button>
        ))}
      </div>

      <div className="abas">
        <button className={aba === "veiculos" ? "ativo" : ""} onClick={() => setAba("veiculos")}>Veículos ({visiveis.length})</button>
        <button className={aba === "historico" ? "ativo" : ""} onClick={() => setAba("historico")}>Histórico de inspeções</button>
      </div>

      <div className="painel">
        <div className="barra-topo">
          <div className="filtros">
            <input placeholder="Buscar placa…" value={fBusca} onChange={(e) => setFBusca(e.target.value)} aria-label="Buscar placa" />
            {aba === "veiculos" ? (
              <div className="insp-chips" role="group" aria-label="Situação">
                {([["todos", "Todos"], ["vencido", "Vencidos"], ["emdia", "Em dia"], ["rascunho", "Rascunhos"]] as [Situacao, string][]).map(([k, r]) => (
                  <button key={k} type="button" className={fSit === k ? "ativo" : ""} onClick={() => setFSit(k)}>{r}</button>
                ))}
              </div>
            ) : (
              <select value={fHistStatus} onChange={(e) => setFHistStatus(e.target.value)} aria-label="Status"><option value="">Todos</option><option value="Rascunho">Rascunho</option><option value="Concluido">Concluído</option></select>
            )}
          </div>
        </div>

        {aba === "veiculos" ? (
          visiveis.length === 0 ? <p className="vazio">Nenhum veículo com esses filtros.</p> : (
            <div className="bsc-tabela-wrap">
              <table>
                <thead><tr><th>Placa</th><th>Base</th><th>Tipo</th><th>Veículo</th><th>Último checklist</th><th>Última VEC (consulta)</th><th>Situação</th><th></th></tr></thead>
                <tbody>
                  {visiveis.map((v) => {
                    const d = diasDesde(v.ultimo_proprio);
                    return (
                      <tr key={v.id}>
                        <td><strong>{v.placa}</strong></td>
                        <td>{v.base}</td>
                        <td>{v.tipo ?? "—"}</td>
                        <td><span className={tagStatus(v.status)}>{v.status}</span></td>
                        <td>{v.ultimo_proprio ? <>{fmtData(v.ultimo_proprio)}<small className="insp-sub"> há {d} dia(s){v.ultimo_km ? ` · ${Number(v.ultimo_km).toLocaleString("pt-BR")} km` : ""}</small></> : <span className="insp-sub">Nunca inspecionado</span>}</td>
                        <td>{fmtData(v.ultimo_vec)}</td>
                        <td>{v.rascunho_id ? <span className="tag tag-em_andamento">Rascunho</span> : v.vencido ? <span className="tag tag-sem_cooperado">Vencido</span> : <span className="tag tag-ativa">Em dia</span>}</td>
                        <td className="insp-acoes">
                          {podeEscrever && <button className="btn btn-primario" style={{ width: "auto" }} onClick={() => pedirInspecao(v)}>{v.rascunho_id ? "Continuar" : "Inspecionar"}</button>}
                          <button className="btn btn-secundario" onClick={() => { setAba("historico"); setFBusca(v.placa); }}>Histórico</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          linhas.length === 0 ? <p className="vazio">Nenhuma inspeção encontrada.</p> : (
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
          )
        )}
      </div>

      {alvo && (
        <div className="modal-fundo" onClick={() => setAlvo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Inspecionar {alvo.placa}</h2>
            <p className="subtitulo">{alvo.base} · {alvo.tipo ?? "Tipo não informado"}{alvo.rentadora ? ` · ${alvo.rentadora}` : ""}</p>
            <div className="insp-aviso" role="note"><strong>⚠ Atenção ao odômetro</strong><span>Digite exatamente o km do painel. Depois você precisará fotografar o odômetro.</span></div>
            <div className="campo"><label>Quilometragem atual (km)</label><input type="number" inputMode="numeric" min={alvo.ultimo_km ? Number(alvo.ultimo_km) : 0} autoFocus value={kmNovo} onChange={(e) => setKmNovo(e.target.value)} />
              {alvo.ultimo_km && <small className="insp-sub">Último km lançado: {Number(alvo.ultimo_km).toLocaleString("pt-BR")} km (não pode ser menor).</small>}
              {kmNovo !== "" && alvo.ultimo_km && Number(kmNovo) < Number(alvo.ultimo_km) && <div className="erro" role="alert">Menor que o km já lançado.</div>}</div>
            <div className="acoes"><button className="btn btn-secundario" onClick={() => setAlvo(null)}>Cancelar</button><button className="btn btn-primario" style={{ width: "auto" }} disabled={criando || (kmNovo !== "" && !!alvo.ultimo_km && Number(kmNovo) < Number(alvo.ultimo_km))} onClick={() => iniciar(alvo, kmNovo)}>Começar inspeção</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
