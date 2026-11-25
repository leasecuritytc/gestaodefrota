import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mensagemErro } from "../api";
import ChassiFotos, { pedidoAoMotorista } from "../components/ChassiFotos";

interface Pend {
  chave: string; tipo: string; severidade: "alta" | "media" | "baixa"; origem: "VEC" | "BSC" | "Planilha" | "Plataforma";
  origem_data: string | null; placa: string | null; base: string | null; titulo: string; detalhe: string; como_corrigir: string;
  vehicle_id?: string | null;
  conferida: { motivo: string | null; observacao: string; conferido_em: string; por: string | null } | null;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem data");
const MOTIVOS: Record<string, string> = {
  nao_se_aplica: "Não se aplica a este veículo",
  aguardando_motorista: "Aguardando o motorista enviar",
  nao_consta_vec: "A informação não consta na VEC",
  sem_acesso: "Sem acesso ao veículo / fora da base",
  ja_corrigido: "Já corrigido fora do sistema",
  outro: "Outro motivo",
};
const SEV = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

export default function PendenciasPage() {
  const [dados, setDados] = useState<{ total_abertas: number; itens: Pend[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verConf, setVerConf] = useState(false);
  const [fOrigem, setFOrigem] = useState("");
  const [busca, setBusca] = useState(() => new URLSearchParams(window.location.search).get("placa") ?? "");
  const [alvo, setAlvo] = useState<Pend | null>(null);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fotoAlvo, setFotoAlvo] = useState<Pend | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try { setErro(null); setDados((await api.get("/pendencias", { params: { conferidas: verConf ? 1 : undefined } })).data); }
    catch (e) { setErro(mensagemErro(e, "Não foi possível carregar as pendências.")); }
  }, [verConf]);
  useEffect(() => { void carregar(); }, [carregar]);

  const lista = useMemo(() => (dados?.itens ?? []).filter((p) =>
    (!fOrigem || p.origem === fOrigem) && (!busca || (p.placa ?? "").includes(busca.toUpperCase()) || p.titulo.toLowerCase().includes(busca.toLowerCase()))
  ), [dados, fOrigem, busca]);

  async function conferir() {
    if (!alvo) return;
    setMsg(null); setOcupado(true);
    try { await api.post("/pendencias/conferir", { chave: alvo.chave, motivo, observacao: obs }); setAlvo(null); setObs(""); setMotivo(""); await carregar(); }
    catch (e) { setMsg(mensagemErro(e, "Não foi possível registrar.")); } finally { setOcupado(false); }
  }

  async function reativar(p: Pend) {
    try { await api.post("/pendencias/reativar", { chave: p.chave }); await carregar(); }
    catch (e) { setErro(mensagemErro(e, "Não foi possível reativar o alerta.")); }
  }
  async function copiarPedido(p: Pend) {
    try { await navigator.clipboard.writeText(pedidoAoMotorista(p.placa ?? "")); setCopiado(p.chave); }
    catch { setErro("Não foi possível copiar. Abra “Anexar foto” e copie o texto de lá."); }
  }

  return (
    <div>
      <h1>Pendências de dados</h1>
      <p className="descricao-pagina">O que precisa ser conferido ou corrigido, com a origem e a data da informação que gerou o alerta. Visível apenas para superadmin e admin.</p>
      {erro && <div className="erro">{erro}</div>}
      <div className="painel">
        <div className="filtros">
          <input placeholder="Buscar placa ou texto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Origem">
            <option value="">Todas as origens</option><option>VEC</option><option>BSC</option><option>Planilha</option><option>Plataforma</option>
          </select>
          <label className="insp-sub" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={verConf} onChange={(e) => setVerConf(e.target.checked)} /> Mostrar dispensadas
          </label>
          <strong style={{ marginLeft: "auto" }}>{dados ? `${dados.total_abertas} aberta(s)` : ""}</strong>
        </div>
        {!dados && !erro && <p className="carregando">Carregando...</p>}
        {dados && lista.length === 0 && <p className="vazio">Nenhuma pendência com esses filtros. Tudo conferido.</p>}
        <div className="pend-lista">
          {lista.map((p) => (
            <article key={p.chave} className={`pend pend-${p.severidade}${p.conferida ? " pend-ok" : ""}`}>
              <header>
                <span className="alerta-ico" aria-hidden="true">⚠</span>
                <strong>{p.titulo}</strong>
                {p.placa && <span className="tag">{p.placa}{p.base ? ` · ${p.base}` : ""}</span>}
                <span className={`origem-sel origem-${p.origem.toLowerCase()}`} title="De onde partiu a informação e quando">{p.origem} · {fmt(p.origem_data)}</span>
                <span className="insp-sub">Gravidade {SEV[p.severidade]}</span>
              </header>
              <p>{p.detalhe}</p>
              <p className="pend-como"><strong>Como corrigir:</strong> {p.como_corrigir}</p>
              {p.conferida ? (
                <>
                  <p className="insp-sub">Dispensado por {p.conferida.por ?? "—"} em {fmt(p.conferida.conferido_em)} — {p.conferida.motivo ? MOTIVOS[p.conferida.motivo] ?? p.conferida.motivo : "conferido"}: “{p.conferida.observacao}”</p>
                  <button className="btn btn-secundario" onClick={() => reativar(p)}>Reativar alerta</button>
                </>
              ) : (
                <div className="insp-acoes">
                  {(p.tipo === "sem_chassi" || p.tipo === "sem_foto_chassi") && p.vehicle_id && (
                    <>
                      <button className="btn btn-primario" style={{ width: "auto" }} onClick={() => setFotoAlvo(p)}>📷 Anexar foto do chassi</button>
                      <button className="btn btn-secundario" onClick={() => copiarPedido(p)}>{copiado === p.chave ? "Copiado" : "Copiar pedido ao motorista"}</button>
                    </>
                  )}
                  <button className="btn btn-secundario" onClick={() => { setAlvo(p); setObs(""); setMotivo(""); setMsg(null); }}>Dispensar alerta</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {alvo && (
        <div className="modal-fundo" onClick={() => setAlvo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Dispensar alerta</h2>
            <p className="subtitulo">{alvo.titulo}{alvo.placa ? ` — ${alvo.placa}` : ""}. O alerta some da lista e fica registrado com o motivo. Você pode reativá-lo depois.</p>
            {msg && <div className="erro" role="alert">{msg}</div>}
            <div className="campo"><label htmlFor="pd-motivo">Motivo *</label>
              <select id="pd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                <option value="">Escolha o motivo...</option>
                {Object.entries(MOTIVOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select></div>
            <div className="campo"><label>Observação: por que não foi feito (mín. 5 caracteres)</label><textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Veículo está em manutenção na oficina; VEC correta." /></div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setAlvo(null)}>Cancelar</button>
              <button className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado || !motivo || obs.trim().length < 5} onClick={conferir}>Dispensar alerta</button>
            </div>
          </div>
        </div>
      )}
      {fotoAlvo?.vehicle_id && <ChassiFotos vehicleId={fotoAlvo.vehicle_id} placa={fotoAlvo.placa ?? ""} onFechar={(m) => { setFotoAlvo(null); if (m) void carregar(); }} />}
    </div>
  );
}
