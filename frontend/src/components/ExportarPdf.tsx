import { useState } from "react";
import { api, mensagemErro } from "../api";

// Botão + seletor de datas que baixa/abre um PDF gerado pelo servidor.
export default function ExportarPdf({ rota, nome, params, deInicial, ateInicial }: { rota: string; nome: string; params?: Record<string, unknown>; deInicial?: string; ateInicial?: string }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ha30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(deInicial || ha30);
  const [ate, setAte] = useState(ateInicial || hoje);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar() {
    setErro(null);
    if (!de || !ate) return setErro("Escolha a data inicial e a final.");
    if (de > ate) return setErro("A data inicial não pode ser depois da final.");
    setOcupado(true);
    try {
      const resp = await api.get(rota, { params: { ...params, de, ate }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = `${nome}_${de}_${ate}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setAberto(false);
    } catch (e: any) {
      let texto = mensagemErro(e, "Não foi possível gerar o PDF.");
      // erro vem como blob quando responseType = blob
      try { const b = e?.response?.data; if (b instanceof Blob) { const j = JSON.parse(await b.text()); texto = j.error || texto; if (j.code === "perfil_incompleto") texto += " Preencha em “Meu cadastro”."; } } catch { /* mantém texto */ }
      setErro(texto);
    } finally { setOcupado(false); }
  }

  return (
    <>
      <button className="btn btn-secundario" onClick={() => { setAberto(true); setErro(null); }}>Exportar PDF</button>
      {aberto && (
        <div className="modal-fundo" onClick={() => setAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Exportar PDF</h2>
            <p className="subtitulo">Escolha o período. O PDF leva logo, seus dados como responsável e numeração de páginas.</p>
            {erro && <div className="erro" role="alert">{erro}</div>}
            <div className="campo"><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div className="campo"><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => setAberto(false)}>Cancelar</button>
              <button className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado} onClick={exportar}>{ocupado ? "Gerando..." : "Baixar PDF"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
