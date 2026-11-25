import { useCallback, useEffect, useRef, useState } from "react";
import { api, mensagemErro } from "../api";
import { comprimirImagem } from "../utils/imagem";

interface FotoMeta { id: string; created_at: string; enviado_por: string | null }

function Miniatura({ id, onRemover }: { id: string; onRemover: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null; let vivo = true;
    api.get(`/chassi-fotos/foto/${id}`, { responseType: "blob" }).then((r) => { if (vivo) { u = URL.createObjectURL(r.data); setUrl(u); } }).catch(() => undefined);
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return (
    <div style={{ position: "relative", width: 110 }}>
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto do chassi" style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 8, display: "block" }} /></a> : <div className="carregando">...</div>}
      <button type="button" className="btn btn-secundario" style={{ marginTop: 4, width: "100%" }} onClick={onRemover}>Remover</button>
    </div>
  );
}

export function pedidoAoMotorista(placa: string) {
  return `Olá! Preciso de uma foto do CHASSI do veículo ${placa} para atualizar o cadastro da frota. ` +
    `O número fica gravado na coluna da porta, no vão do motor ou no documento (CRLV). Envie uma foto nítida, com todos os caracteres legíveis. Obrigado!`;
}

// Fotos do chassi de um veículo: anexar, ver e remover. Só admin/superadmin.
export default function ChassiFotos({ vehicleId, placa, onFechar }: { vehicleId: string; placa: string; onFechar: (mudou: boolean) => void }) {
  const [fotos, setFotos] = useState<FotoMeta[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "sucesso"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mudou, setMudou] = useState(false);
  const arq = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try { setFotos((await api.get<FotoMeta[]>(`/chassi-fotos/${vehicleId}`)).data); }
    catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e, "Não foi possível carregar as fotos.") }); }
  }, [vehicleId]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(file: File) {
    setOcupado(true); setMsg(null);
    try {
      const blob = await comprimirImagem(file);
      await api.post(`/chassi-fotos/${vehicleId}`, blob, { headers: { "Content-Type": "image/jpeg" } });
      setMudou(true); await carregar();
    } catch (e) { setMsg({ tipo: "erro", texto: (e as Error).message.startsWith("Foto muito") ? (e as Error).message : mensagemErro(e, "Não foi possível enviar a foto.") }); }
    finally { setOcupado(false); }
  }
  async function remover(id: string) {
    try { await api.delete(`/chassi-fotos/foto/${id}`); setMudou(true); await carregar(); }
    catch (e) { setMsg({ tipo: "erro", texto: mensagemErro(e) }); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(pedidoAoMotorista(placa)); setMsg({ tipo: "sucesso", texto: "Pedido copiado. Cole no WhatsApp do motorista." }); }
    catch { setMsg({ tipo: "erro", texto: "Não foi possível copiar. Selecione o texto abaixo e copie manualmente." }); }
  }

  return (
    <div className="modal-fundo" onClick={() => onFechar(mudou)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Foto do chassi — {placa}</h2>
        {msg && <div className={msg.tipo === "erro" ? "erro" : "sucesso"} role="status" aria-live="polite">{msg.texto}</div>}
        {!fotos ? <p className="carregando">Carregando...</p> : fotos.length === 0 ? <p className="vazio">Nenhuma foto anexada ainda.</p> : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>{fotos.map((f) => <Miniatura key={f.id} id={f.id} onRemover={() => remover(f.id)} />)}</div>
        )}
        <button type="button" className="btn btn-primario" style={{ width: "auto" }} disabled={ocupado || (fotos?.length ?? 0) >= 5} onClick={() => arq.current?.click()}>{ocupado ? "Enviando..." : "📷 Anexar foto do chassi"}</button>
        <input ref={arq} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviar(f); }} />
        <div className="insp-aviso" role="note" style={{ marginTop: 14 }}>
          <strong>Não tem a foto agora?</strong>
          <span>Peça ao motorista e anexe depois. Texto pronto: “{pedidoAoMotorista(placa)}”</span>
        </div>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={copiar}>Copiar pedido ao motorista</button>
          <button type="button" className="btn btn-secundario" onClick={() => onFechar(mudou)}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
