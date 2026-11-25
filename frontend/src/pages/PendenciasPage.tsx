import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mensagemErro } from "../api";

interface Pend {
  chave: string; tipo: string; severidade: "alta" | "media" | "baixa"; origem: "VEC" | "BSC" | "Planilha" | "Plataforma";
  origem_data: string | null; placa: string | null; base: string | null; titulo: string; detalhe: string; como_corrigir: string;
  conferida: { observacao: string; conferido_em: string; por: string | null } | null;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "sem data");
const SEV = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

export default function PendenciasPage() {
  const [dados, setDados] = useState<{ total_abertas: number; itens: Pend[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verConf, setVerConf] = useState(false);
  const [fOrigem, setFOrigem] = useState("");
  const [busca, setBusca] = useState(() => new URLSearchParams(window.location.search).get("placa") ?? "");
  const [alvo, setAlvo] = useState<Pend | null>(null);
  const [obs, setObs] = useState("");
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
    try { await api.post("/pendencias/conferir", { chave: alvo.chave, observacao: obs }); setAlvo(null); setObs(""); await carregar(); }
    catch (e) { setMsg(mensagemErro(e, "Não foi possível registrar.")); } finally { setOcupado(false); }
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
            <input type="checkbox" checked={verConf} onChange={(e) => setVerConf(e.target.checked)} /> Mostrar já conferidas
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
                <p className="insp-sub">Conferida por {p.conferida.por ?? "—"} em {fmt(p.conferida.conferido_em)}: “{p.conferida.observacao}”</p>
              ) : (
                <button className="btn btn-secundario" onClick={() => { setAlvo(p); setObs(""); setMsg(null); }}>Marcar como conferida</button>
              )}
            </article>
          ))}
        </div>
      </div>

      {alvo && (
        <div className="modal-fundo" onClick={() => setAlvo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Marcar como conferida</h2>
            <p className="subtitulo">{alvo.titulo}{alvo.placa ? ` — ${alvo.placa}` : ""}. Se a fonte trouxer dado novo, o alerta volta.</p>
            {msg && <div className="erro" role="alert">{msg}</div>}
            <div className="campo"><label>O que foi conferido (mín. 5 caracteres)</label><textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: Veículo está em manutenção na oficina; VEC correta." /></div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setAlvo(null)}>Cancelar</button>
              <button className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado || obs.trim().length < 5} onClick={conferir}>Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
