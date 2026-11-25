import { useEffect, useRef, useState } from "react";
import { useTema } from "../theme";

// Coordenadas das bases do escopo atual (administrador Mercado Livre/MG).
// Ficam aqui no frontend porque a tabela `bases` ainda não guarda
// latitude/longitude. Novas bases entram nesta lista quando forem
// vinculadas a outros administradores.
const COORDS_BASES: Record<string, { lat: number; lng: number; cidade: string }> = {
  SMG3: { lat: -22.23, lng: -45.9364, cidade: "Pouso Alegre/MG" },
  SMG5: { lat: -21.7878, lng: -46.5614, cidade: "Poços de Caldas/MG" },
  SMG9: { lat: -21.5514, lng: -45.43, cidade: "Varginha/MG" },
};

export interface ResumoBaseMapa {
  base: string;
  status: string;
  total: number;
}

interface Props {
  porBase: ResumoBaseMapa[];
  baseSelecionada?: string;
  onFiltrarBase?: (codigo: string) => void;
}

const CHAVE = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

// Estilos do mapa (JSON de styles da Maps JavaScript API).
const ESTILO_ESCURO = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#09090b" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#ff6b00" }, { weight: 1 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#27272a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3f3f46" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#05070a" }] },
];
const ESTILO_CLARO = [
  { elementType: "geometry", stylers: [{ color: "#f4f4f5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52525b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e4e4e7" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d4d4d8" }] },
];

// Carrega a API do Google uma única vez por página (script oficial assíncrono).
let promessaApi: Promise<void> | null = null;
function carregarGoogleMaps(): Promise<void> {
  if (!CHAVE) return Promise.reject(new Error("sem-chave"));
  if ((window as any).google?.maps) return Promise.resolve();
  if (!promessaApi) {
    promessaApi = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CHAVE)}&v=weekly&loading=async`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        promessaApi = null;
        reject(new Error("falha-carga"));
      };
      document.head.appendChild(s);
    });
  }
  return promessaApi;
}

function esc(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function OperationalMap({ porBase, baseSelecionada, onFiltrarBase }: Props) {
  const { tema } = useTema();
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<any>(null);
  const limitesRef = useRef<any>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "sem-chave" | "erro">(CHAVE ? "carregando" : "sem-chave");

  const bases = Object.keys(COORDS_BASES).map((codigo) => {
    const linhas = porBase.filter((p) => p.base === codigo);
    const soma = (st: string) => linhas.filter((l) => l.status === st).reduce((a, l) => a + l.total, 0);
    const total = linhas.reduce((a, l) => a + l.total, 0);
    return { codigo, ...COORDS_BASES[codigo], total, ativos: soma("Ativa"), manutencao: soma("Manutenção"), semCooperado: soma("Sem cooperado") };
  });

  // Cria o mapa uma vez (marcadores, linha tracejada, InfoWindow).
  useEffect(() => {
    if (!CHAVE) return;
    let cancelado = false;
    carregarGoogleMaps()
      .then(async () => {
        if (cancelado || !divRef.current) return;
        const g = (window as any).google.maps;
        await g.importLibrary("maps");
        const mapa = new g.Map(divRef.current, {
          center: { lat: -21.9, lng: -45.9 },
          zoom: 8,
          disableDefaultUI: true,
          zoomControl: true,
          styles: tema === "dark" ? ESTILO_ESCURO : ESTILO_CLARO,
        });
        mapaRef.current = mapa;
        const limites = new g.LatLngBounds();
        const info = new g.InfoWindow();
        bases.forEach((b) => {
          const pos = { lat: b.lat, lng: b.lng };
          limites.extend(pos);
          const marcador = new g.Marker({
            map: mapa,
            position: pos,
            title: b.codigo,
            label: { text: b.codigo, color: "#ffffff", fontSize: "11px", fontWeight: "700" },
            icon: { path: g.SymbolPath.CIRCLE, scale: 16, fillColor: "#ff6b00", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
          });
          marcador.addListener("click", () => {
            const pct = b.total ? Math.round((b.ativos / b.total) * 100) : 0;
            const div = document.createElement("div");
            div.style.cssText = "font:13px Segoe UI,Arial,sans-serif;color:#18181b;min-width:190px";
            div.innerHTML =
              `<strong style="font-size:14px">${esc(b.codigo)} — ${esc(b.cidade)}</strong>` +
              `<div style="margin-top:6px">Veículos: <b>${b.total}</b></div>` +
              `<div>Ativos: <b>${b.ativos}</b> (${pct}%)</div>` +
              `<div>Manutenção: <b>${b.manutencao}</b></div>` +
              `<div>Sem cooperado: <b>${b.semCooperado}</b></div>`;
            if (onFiltrarBase) {
              const btn = document.createElement("button");
              btn.textContent = "Filtrar Base";
              btn.style.cssText = "margin-top:8px;background:#ff6b00;color:#fff;border:0;border-radius:6px;padding:6px 12px;font-weight:600;cursor:pointer";
              btn.onclick = () => onFiltrarBase(b.codigo);
              div.appendChild(btn);
            }
            info.setContent(div);
            info.open({ map: mapa, anchor: marcador });
          });
        });
        new g.Polyline({
          map: mapa,
          path: bases.map((b) => ({ lat: b.lat, lng: b.lng })),
          strokeColor: "#ff6b00",
          strokeOpacity: 0,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.65, strokeColor: "#ff6b00", scale: 3 }, offset: "0", repeat: "14px" }],
        });
        limitesRef.current = limites;
        mapa.fitBounds(limites, 60);
        setEstado("pronto");
      })
      .catch((e) => {
        if (!cancelado) setEstado(e?.message === "sem-chave" ? "sem-chave" : "erro");
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de tema: só atualiza o estilo, sem recriar o mapa.
  useEffect(() => {
    mapaRef.current?.setOptions({ styles: tema === "dark" ? ESTILO_ESCURO : ESTILO_CLARO });
  }, [tema]);

  // Base escolhida em outro lugar do painel: centraliza nela.
  useEffect(() => {
    const c = baseSelecionada ? COORDS_BASES[baseSelecionada] : undefined;
    if (c && mapaRef.current) {
      mapaRef.current.panTo({ lat: c.lat, lng: c.lng });
      mapaRef.current.setZoom(11);
    }
  }, [baseSelecionada]);

  function visaoGeral() {
    if (mapaRef.current && limitesRef.current) mapaRef.current.fitBounds(limitesRef.current, 60);
  }

  return (
    <div className="painel mapa-painel">
      <div className="mapa-topo">
        <h2>Malha operacional</h2>
        {estado === "pronto" && (
          <button className="btn btn-secundario" onClick={visaoGeral}>
            Visão Geral da Malha
          </button>
        )}
      </div>
      {estado === "sem-chave" && (
        <div className="mapa-aviso">
          <strong>Mapa aguardando a chave do Google Maps.</strong>
          <p>
            Para ativar, crie uma chave da <em>Maps JavaScript API</em> no Google Cloud, restrinja-a ao domínio
            alexander-log.com.br e coloque no arquivo <code>frontend/.env</code> do servidor:
          </p>
          <code className="copiavel">VITE_GOOGLE_MAPS_API_KEY=sua_chave_aqui</code>
          <p>Depois rode o build do frontend. Enquanto isso, as bases do escopo atual são:</p>
          <ul>
            {bases.map((b) => (
              <li key={b.codigo}>
                <strong>{b.codigo}</strong> — {b.cidade}: {b.total} veículos
              </li>
            ))}
          </ul>
        </div>
      )}
      {estado === "erro" && (
        <div className="erro">
          Não foi possível carregar o Google Maps. Confira se a chave está correta, se a Maps JavaScript API está
          ativada e se o domínio está liberado na chave.
        </div>
      )}
      {estado !== "sem-chave" && <div ref={divRef} className="mapa-area" />}
    </div>
  );
}
