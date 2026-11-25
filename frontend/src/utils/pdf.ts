import { api, mensagemErro } from "../api";

// Baixa um PDF gerado pelo servidor. Erros vêm como blob (responseType = blob): lê a mensagem de dentro dele.
export async function baixarPdf(rota: string, params: Record<string, unknown>, nomeArquivo: string): Promise<string | null> {
  try {
    const resp = await api.get(rota, { params, responseType: "blob" });
    const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
    const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return null;
  } catch (e: any) {
    let texto = mensagemErro(e, "Não foi possível gerar o PDF.");
    try {
      const b = e?.response?.data;
      if (b instanceof Blob) { const j = JSON.parse(await b.text()); texto = j.error || texto; if (j.code === "perfil_incompleto") texto += " Preencha em “Meu cadastro”."; }
    } catch { /* mantém texto */ }
    return texto;
  }
}
