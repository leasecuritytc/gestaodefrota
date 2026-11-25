import { useEffect, useState } from "react";
import { api } from "../api";

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

export default function BscPage() {
  const [dados, setDados] = useState<{ configurado: boolean; bases?: string[]; paginas: Pagina[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/bsc")
      .then((r) => {
        setDados(r.data);
        if (r.data.paginas[0]) setAtiva(r.data.paginas[0].pagina);
      })
      .catch(() => setErro("Não foi possível carregar os dados do BSC."));
  }, []);

  const pagina = dados?.paginas.find((p) => p.pagina === ativa);

  return (
    <div>
      <h1>BSC — Scorecard do fornecedor</h1>
      <p className="subtitulo">
        Retratos do relatório "2.0 SRM - BSC Supplier" (Mercado Livre), coletados automaticamente e filtrados só para as bases {(dados?.bases ?? ["SMG3", "SMG5", "SMG9"]).join(", ")}. Visível apenas para superadmin e admin.
      </p>
      {erro && <p className="erro">{erro}</p>}
      {dados && !dados.configurado && (
        <p className="aviso">Ingestão do BSC ainda não configurada no servidor (BSC_INGEST_TOKEN).</p>
      )}
      {dados && dados.paginas.length === 0 && (
        <p className="vazio">Nenhum retrato recebido ainda. Rode o coletor (tools/bsc-coletor) no computador com acesso ao BSC.</p>
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
