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

// Legenda (quadradinho colorido + rótulo), igual à do painel de referência.
export function Legenda({ itens }: { itens: { rotulo: string; cor: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 12 }}>
      {itens.map((it) => (
        <div key={it.rotulo} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
          <span
            style={{ width: 11, height: 11, borderRadius: 3, background: it.cor, display: "inline-block" }}
            aria-hidden="true"
          />
          {it.rotulo}
        </div>
      ))}
    </div>
  );
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
function tetoEixo(max: number): number {
  // Arredonda o teto do eixo para um número "redondo" (5, 10, 15, 20, 25...),
  // igual ao painel de referência (eixos em 0/15/30/45/60).
  if (max <= 5) return 5;
  const passo = max <= 20 ? 5 : max <= 60 ? 15 : max <= 200 ? 50 : 100;
  return Math.ceil(max / passo) * passo;
}

export function BarraEmpilhadaHorizontal({
  dados,
  seriesOrdem,
  corSerie = corStatus,
  altura = 26,
}: BarraEmpilhadaProps) {
  const maiorBarra = Math.max(1, ...dados.map((d) => Object.values(d.series).reduce((a, b) => a + b, 0)));
  const eixoMax = tetoEixo(maiorBarra);
  const largura = 100;
  const marcas = [0, 0.25, 0.5, 0.75, 1];

  const seriesPresentes = seriesOrdem.filter((s) => dados.some((d) => d.series[s]));

  return (
    <div>
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
                {marcas.slice(1).map((m) => (
                  <line key={m} x1={m * largura} y1={0} x2={m * largura} y2={altura} stroke="#dfe4f0" strokeWidth={0.5} />
                ))}
                {(() => {
                  let x = 0;
                  return seriesOrdem
                    .filter((s) => d.series[s])
                    .map((s) => {
                      const w = (d.series[s] / eixoMax) * largura;
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
      <div style={{ display: "flex", marginLeft: 74, marginTop: 2 }}>
        {marcas.map((m) => (
          <div key={m} style={{ flex: m === 0 ? "0 0 0" : 1, fontSize: 10, color: "var(--muted)", textAlign: m === 0 ? "left" : "right" }}>
            {Math.round(m * eixoMax)}
          </div>
        ))}
      </div>
      <Legenda itens={seriesPresentes.map((s) => ({ rotulo: s, cor: corSerie(s) }))} />
    </div>
  );
}

interface BarraVerticalProps {
  dados: { rotulo: string; valor: number }[];
  cor?: string;
  altura?: number;
}

// Barras horizontais com eixo (ex.: veículos por tipo) — mesmo formato do
// painel de referência (rótulo à esquerda, barra, eixo numérico embaixo).
export function BarraVertical({ dados, cor = "#e08a1e" }: BarraVerticalProps) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const eixoMax = tetoEixo(max);
  const marcas = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dados.map((d) => (
          <div key={d.rotulo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 78, fontSize: 12, fontWeight: 700, color: "var(--navy)", flexShrink: 0, textAlign: "right" }}>
              {d.rotulo}
            </div>
            <svg viewBox="0 0 100 22" width="100%" height={22} preserveAspectRatio="none" role="img" aria-label={`${d.rotulo}: ${d.valor}`}>
              <rect x={0} y={0} width={100} height={22} rx={4} fill="#eef1f8" />
              {marcas.slice(1).map((m) => (
                <line key={m} x1={m * 100} y1={0} x2={m * 100} y2={22} stroke="#dfe4f0" strokeWidth={0.5} />
              ))}
              <rect x={0} y={0} width={(d.valor / eixoMax) * 100} height={22} rx={4} fill={cor} />
            </svg>
            <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
              {d.valor}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginLeft: 88, marginTop: 2 }}>
        {marcas.map((m) => (
          <div key={m} style={{ flex: m === 0 ? "0 0 0" : 1, fontSize: 10, color: "var(--muted)", textAlign: m === 0 ? "left" : "right" }}>
            {Math.round(m * eixoMax)}
          </div>
        ))}
      </div>
    </div>
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
