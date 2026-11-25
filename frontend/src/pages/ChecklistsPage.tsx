import { useEffect, useState } from "react";
import { baixarPdf } from "../utils/pdf";
import { api } from "../api";

interface Linha {
  id: string;
  placa: string;
  tipo_formulario: string;
  data_hora: string;
  svc: string | null;
  transportadora: string | null;
  subregiao: string | null;
  motorista: string | null;
  num_falhas: number;
}
interface Resposta {
  totais: { total: number; com_falhas: number; falhas: number; veiculos: number; ultimo: string | null };
  linhas: Linha[];
  bases?: string[];
}

function fmtData(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

interface Filtros { q: string; placa: string; base: string; de: string; ate: string; falhas: boolean }
const VAZIO: Filtros = { q: "", placa: "", base: "", de: "", ate: "", falhas: false };
const paramsDe = (f: Filtros) => ({ q: f.q || undefined, placa: f.placa || undefined, base: f.base || undefined, de: f.de || undefined, ate: f.ate || undefined, falhas: f.falhas ? "1" : undefined });

export default function ChecklistsPage() {
  const [form, setForm] = useState<Filtros>(VAZIO);          // o que está nos campos
  const [aplicado, setAplicado] = useState<Filtros | null>(null); // o que foi pesquisado de fato (base do PDF)
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function pesquisar(f: Filtros = form) {
    setErro(null);
    if (f.de && f.ate && f.de > f.ate) return setErro("A data inicial não pode ser depois da final.");
    setCarregando(true);
    try {
      const r = await api.get("/checklists", { params: paramsDe(f) });
      setDados(r.data); setAplicado(f);
    } catch { setErro("Não foi possível pesquisar os checklists."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { void pesquisar(VAZIO); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function limpar() { setForm(VAZIO); void pesquisar(VAZIO); }

  const podeBaixar = !!aplicado && !!aplicado.de && !!aplicado.ate && !!dados && dados.totais.total > 0;
  async function baixar() {
    if (!aplicado) return;
    setErro(null); setGerando(true);
    const e = await baixarPdf("/checklists/pdf", paramsDe(aplicado), `checklists_vec_${aplicado.de}_${aplicado.ate}.pdf`);
    if (e) setErro(e);
    setGerando(false);
  }
  const mudou = !!aplicado && JSON.stringify(aplicado) !== JSON.stringify(form);

  return (
    <div>
      <h1>Checklists (VEC)</h1>
      <p className="subtitulo">
        Pesquise por período, base e veículo. Confira o resultado e só então baixe o PDF para reunião. Dados da VEC, somente consulta. Visível apenas para superadmin e admin.
      </p>
      {erro && <p className="erro">{erro}</p>}
      {dados && (
        <div className="bsc-grade">
          <div className="bsc-numero"><small>Checklists</small><strong>{dados.totais.total}</strong></div>
          <div className="bsc-numero"><small>Com falhas</small><strong>{dados.totais.com_falhas}</strong></div>
          <div className="bsc-numero"><small>Falhas somadas</small><strong>{dados.totais.falhas}</strong></div>
          <div className="bsc-numero"><small>Veículos</small><strong>{dados.totais.veiculos}</strong></div>
          <div className="bsc-numero"><small>Último checklist</small><strong>{fmtData(dados.totais.ultimo)}</strong></div>
        </div>
      )}
      <div className="painel">
        <form className="filtros" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); void pesquisar(); }}>
          <label className="insp-sub">Início<input type="date" value={form.de} onChange={(e) => set("de", e.target.value)} /></label>
          <label className="insp-sub">Fim<input type="date" value={form.ate} onChange={(e) => set("ate", e.target.value)} /></label>
          <label className="insp-sub">Base
            <select value={form.base} onChange={(e) => set("base", e.target.value)}>
              <option value="">Todas</option>
              {(dados?.bases ?? ["SMG3", "SMG5", "SMG9"]).map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="insp-sub">Placa<input placeholder="ABC1D23" maxLength={8} value={form.placa} onChange={(e) => set("placa", e.target.value.toUpperCase())} /></label>
          <label className="insp-sub">SVC ou motorista<input placeholder="Nome ou SVC" value={form.q} onChange={(e) => set("q", e.target.value)} /></label>
          <label className="insp-sub" style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={form.falhas} onChange={(e) => set("falhas", e.target.checked)} /> Só com falhas
          </label>
          <button className="btn btn-primario" style={{ width: "auto" }} disabled={carregando}>{carregando ? "Pesquisando..." : "Pesquisar"}</button>
          <button type="button" className="btn btn-secundario" onClick={limpar}>Limpar</button>
        </form>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
          <button className="btn btn-secundario" disabled={!podeBaixar || gerando} onClick={baixar}>{gerando ? "Gerando PDF..." : "Baixar PDF da pesquisa"}</button>
          <small className="insp-sub">
            {!aplicado?.de || !aplicado?.ate ? "Informe o início e o fim, pesquise e depois baixe o PDF." : mudou ? "Você alterou os filtros: clique em Pesquisar para atualizar antes de baixar." : dados && dados.totais.total === 0 ? "Sem resultados para baixar." : "O PDF terá exatamente o resultado abaixo."}
          </small>
        </div>
        {carregando && !dados && <p className="vazio">Carregando…</p>}
        {dados && dados.linhas.length === 0 && (
          <p className="vazio">Nenhum checklist para esses filtros. Ajuste a pesquisa. Se nunca sincronizou, rode a sincronização na aba VEC de Veículos.</p>
        )}
        {dados && dados.linhas.length > 0 && (
          <div className="bsc-tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Placa</th><th>SVC</th><th>Tipo</th><th>Motorista</th><th>Transportadora</th><th>Falhas</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtData(l.data_hora)}</td>
                    <td><strong>{l.placa}</strong></td>
                    <td>{l.svc ?? "—"}</td>
                    <td>{l.tipo_formulario}</td>
                    <td>{l.motorista ?? "—"}</td>
                    <td>{l.transportadora ?? "—"}</td>
                    <td>{l.num_falhas > 0 ? <strong>{l.num_falhas}</strong> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.totais.total > dados.linhas.length && (
          <p className="subtitulo">Mostrando os {dados.linhas.length} mais recentes de {dados.totais.total}. Use os filtros para refinar.</p>
        )}
      </div>
    </div>
  );
}
