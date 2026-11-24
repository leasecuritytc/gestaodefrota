// Gráficos em SVG puro — sem dependência nova de terceiros (o projeto não
// tinha nenhuma lib de gráfico instalada; para duas telas de leitura, um
// componente próprio e leve evita inflar o bundle e o lockfile).

const CORES_STATUS: Record<string, string> = {
  Ativa: "#1e8e5a",
  "Manutenção": "#e08a1e",
  Desmobilizado: "#8a93a6",
  "Sem cooperado": "#c0392b",
};
const COR_PADRAO = "#2563eb";

export function corStatus(status: string): string {
  return CORES_STATUS[status] ?? COR_PADRAO;
}

interface BarraEmpilhadaProps {
  // grupo -> { serie -> valor }
  dados: { grupo: string; series: Record<string, number> }[];
  seriesOrdem: string[];
  corSerie?: (serie: string) => string;
  altura?: number;
}

// Barras horizontais empilhadas — uma linha por grupo (ex.: por base),
// segmentos coloridos por série (ex.: por status). Mais legível que barras
// verticais quando os rótulos dos grupos são textos (códigos de base).
export function BarraEmpilhadaHorizontal({
  dados,
  seriesOrdem,
  corSerie = corStatus,
  altura = 26,
}: BarraEmpilhadaProps) {
  const maxTotal = Math.max(1, ...dados.map((d) => Object.values(d.series).reduce((a, b) => a + b, 0)));
  const largura = 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {dados.map((d) => {
        const total = Object.values(d.series).reduce((a, b) => a + b, 0);
        return (
          <div key={d.grupo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 64, fontSize: 12, fontWeight: 700, color: "var(--navy)", flexShrink: 0 }}>
              {d.grupo}
            </div>
            <svg
              viewBox={`0 0 ${largura} ${altura}`}
              width="100%"
              height={altura}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${d.grupo}: ${total} veículos`}
            >
              <rect x={0} y={0} width={largura} height={altura} rx={4} fill="#eef1f8" />
              {(() => {
                let x = 0;
                return seriesOrdem
                  .filter((s) => d.series[s])
                  .map((s) => {
                    const w = (d.series[s] / maxTotal) * largura;
                    const rect = (
                      <rect key={s} x={x} y={0} width={w} height={altura} fill={corSerie(s)}>
                        <title>
                          {s}: {d.series[s]}
                        </title>
                      </rect>
                    );
                    x += w;
                    return rect;
                  });
              })()}
            </svg>
            <div style={{ width: 28, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
              {total}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface BarraVerticalProps {
  dados: { rotulo: string; valor: number }[];
  cor?: string;
  altura?: number;
}

// Barras verticais simples (ex.: veículos por tipo).
export function BarraVertical({ dados, cor = "#e08a1e", altura = 160 }: BarraVerticalProps) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const largura = Math.max(60, dados.length * 56);

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" height={altura} preserveAspectRatio="xMinYMax meet">
      {dados.map((d, i) => {
        const h = (d.valor / max) * (altura - 34);
        const x = i * 56 + 8;
        return (
          <g key={d.rotulo}>
            <rect x={x} y={altura - 24 - h} width={32} height={h} rx={4} fill={cor}>
              <title>
                {d.rotulo}: {d.valor}
              </title>
            </rect>
            <text x={x + 16} y={altura - 26 - h} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--navy)">
              {d.valor}
            </text>
            <text x={x + 16} y={altura - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {d.rotulo.length > 9 ? d.rotulo.slice(0, 8) + "…" : d.rotulo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface LinhaEvolucaoProps {
  pontos: { data: string; valor: number }[];
  cor?: string;
  altura?: number;
}

// Linha de evolução (série temporal) com área preenchida suave.
export function LinhaEvolucao({ pontos, cor = "#e08a1e", altura = 160 }: LinhaEvolucaoProps) {
  if (pontos.length === 0) return <p className="vazio">Sem snapshots suficientes ainda.</p>;
  const largura = 560;
  const padding = 28;
  const max = Math.max(...pontos.map((p) => p.valor));
  const min = Math.min(...pontos.map((p) => p.valor));
  const faixa = Math.max(1, max - min);

  const coord = (i: number, v: number) => {
    const x = pontos.length === 1 ? largura / 2 : padding + (i / (pontos.length - 1)) * (largura - padding * 2);
    const y = altura - padding - ((v - min) / faixa) * (altura - padding * 2);
    return [x, y];
  };

  const linha = pontos.map((p, i) => coord(i, p.valor)).map(([x, y]) => `${x},${y}`).join(" ");
  const [x0] = coord(0, pontos[0].valor);
  const [xN] = coord(pontos.length - 1, pontos[pontos.length - 1].valor);
  const area = `${x0},${altura - padding} ${linha} ${xN},${altura - padding}`;

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} width="100%" height={altura} preserveAspectRatio="xMidYMid meet">
      <polygon points={area} fill={cor} opacity={0.12} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((p, i) => {
        const [x, y] = coord(i, p.valor);
        return (
          <g key={p.data}>
            <circle cx={x} cy={y} r={3.5} fill={cor} stroke="#fff" strokeWidth={1.5}>
              <title>
                {new Date(p.data).toLocaleDateString("pt-BR")}: {p.valor}
              </title>
            </circle>
            <text x={x} y={altura - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
