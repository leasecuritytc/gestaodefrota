import { useEffect, useState } from "react";
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
}

function fmtData(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default function ChecklistsPage() {
  const [q, setQ] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [soFalhas, setSoFalhas] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setCarregando(true);
      api
        .get("/checklists", { params: { q: q || undefined, de: de || undefined, ate: ate || undefined, falhas: soFalhas ? "1" : undefined } })
        .then((r) => {
          setDados(r.data);
          setErro(null);
        })
        .catch(() => setErro("Não foi possível carregar os checklists."))
        .finally(() => setCarregando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, de, ate, soFalhas]);

  return (
    <div>
      <h1>Checklists (VEC)</h1>
      <p className="subtitulo">
        Inspeções sincronizadas da VEC a cada 2 h. Visível apenas para superadmin e admin.
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
        <div className="barra-topo">
          <div className="filtros">
            <input placeholder="Placa, SVC ou motorista..." value={q} onChange={(e) => setQ(e.target.value)} />
            <input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} />
            <input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} />
            <label>
              <input type="checkbox" checked={soFalhas} onChange={(e) => setSoFalhas(e.target.checked)} /> Só com falhas
            </label>
          </div>
        </div>
        {carregando && !dados && <p className="vazio">Carregando…</p>}
        {dados && dados.linhas.length === 0 && (
          <p className="vazio">Nenhum checklist para esse filtro. Se nunca sincronizou, rode a sincronização na aba VEC de Veículos.</p>
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
