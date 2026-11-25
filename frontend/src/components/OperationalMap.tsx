import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTema } from "../theme";

// Coordenadas das bases do escopo atual (administrador com bases em MG).
// Fallback geográfico aproximado da cidade: a tabela `bases` ainda não guarda
// latitude/longitude. Novas bases entram aqui quando forem vinculadas a
// outros administradores.
const COORDS_BASES: Record<string, { lat: number; lng: number; cidade: string }> = {
  SMG3: { lat: -22.23, lng: -45.9364, cidade: "Pouso Alegre/MG" },
  SMG5: { lat: -21.7878, lng: -46.5614, cidade: "Poços de Caldas/MG" },
  SMG9: { lat: -21.5514, lng: -45.43, cidade: "Varginha/MG" },
};

// Tiles gratuitos e sem chave do OpenStreetMap. O modo escuro é obtido por
// filtro CSS (classe mapa-escuro), pois os tiles escuros do CARTO exigem chave.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export interface ResumoBaseMapa {
  base: string;
  status: string;
  total: number;
}

interface Props {
  porBase: ResumoBaseMapa[];
  onFiltrarBase?: (codigo: string) => void;
}

function esc(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default function OperationalMap({ porBase, onFiltrarBase }: Props) {
  const { tema } = useTema();
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const limitesRef = useRef<L.LatLngBounds | null>(null);
  const filtrarRef = useRef(onFiltrarBase);
  filtrarRef.current = onFiltrarBase;
  const [baseEscolhida, setBaseEscolhida] = useState("");

  const bases = Object.keys(COORDS_BASES).map((codigo) => {
    const linhas = porBase.filter((p) => p.base === codigo);
    const soma = (st: string) => linhas.filter((l) => l.status === st).reduce((a, l) => a + l.total, 0);
    return {
      codigo,
      ...COORDS_BASES[codigo],
      total: linhas.reduce((a, l) => a + l.total, 0),
      ativos: soma("Ativa"),
      manutencao: soma("Manutenção"),
      semCooperado: soma("Sem cooperado"),
    };
  });

  // Cria o mapa uma única vez; marcadores/popup são atualizados quando os dados mudam.
  useEffect(() => {
    if (!divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView([-21.9, -45.9], 8);
    tileRef.current = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      className: "tile-osm",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapa);
    mapaRef.current = mapa;

    // Redimensiona o mapa quando o card muda de tamanho (troca de aba/layout).
    const ro = new ResizeObserver(() => mapa.invalidateSize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      mapa.remove();
      mapaRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de tema: só alterna a classe do contêiner (filtro CSS nos tiles);
  // mantém zoom, posição e marcadores.
  useEffect(() => {
    divRef.current?.classList.toggle("mapa-escuro", tema === "dark");
    const t = setTimeout(() => mapaRef.current?.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [tema]);

  // Marcadores, malha tracejada e popups.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const grupo = L.featureGroup().addTo(mapa);
    const pontos: L.LatLngExpression[] = [];
    bases.forEach((b) => {
      const pos: L.LatLngExpression = [b.lat, b.lng];
      pontos.push(pos);
      const icone = L.divIcon({
        className: "pin-base-wrap",
        html: `<div class="pin-base"><span class="pin-base-anel"></span><span class="pin-base-ponto"></span><span class="pin-base-rotulo">${esc(b.codigo)}</span></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const marcador = L.marker(pos, { icon: icone, title: b.codigo }).addTo(grupo);
      const pct = b.total ? Math.round((b.ativos / b.total) * 100) : 0;
      const div = document.createElement("div");
      div.className = "popup-base";
      div.innerHTML =
        `<strong>${esc(b.codigo)} — ${esc(b.cidade)}</strong>` +
        `<div>Veículos: <b>${b.total}</b></div>` +
        `<div>Ativos: <b>${b.ativos}</b> (${pct}%)</div>` +
        `<div>Manutenção: <b>${b.manutencao}</b></div>` +
        `<div>Sem cooperado: <b>${b.semCooperado}</b></div>`;
      if (filtrarRef.current) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Filtrar Base";
        btn.onclick = () => filtrarRef.current?.(b.codigo);
        div.appendChild(btn);
      }
      marcador.bindPopup(div);
    });
    L.polyline(pontos, { color: "#FF6B00", weight: 2, dashArray: "6, 8", opacity: 0.7 }).addTo(grupo);
    limitesRef.current = grupo.getBounds();
    mapa.fitBounds(limitesRef.current, { padding: [40, 40] });
    return () => {
      grupo.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porBase]);

  function escolherBase(codigo: string) {
    setBaseEscolhida(codigo);
    const c = COORDS_BASES[codigo];
    if (c) mapaRef.current?.flyTo([c.lat, c.lng], 11, { duration: 1.2 });
  }

  function visaoGeral() {
    setBaseEscolhida("");
    if (limitesRef.current) mapaRef.current?.fitBounds(limitesRef.current, { padding: [40, 40] });
  }

  return (
    <div className="painel mapa-painel">
      <div className="mapa-topo">
        <h2>Malha operacional</h2>
        <div className="mapa-acoes">
          <select value={baseEscolhida} onChange={(e) => escolherBase(e.target.value)} aria-label="Centralizar em uma base">
            <option value="">Centralizar em…</option>
            {bases.map((b) => (
              <option key={b.codigo} value={b.codigo}>
                {b.codigo} — {b.cidade}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secundario" onClick={visaoGeral}>
            Visão Geral da Malha
          </button>
        </div>
      </div>
      <div ref={divRef} className="mapa-area" />
    </div>
  );
}
