import { env } from "../env";

/**
 * Adaptador do BSC / Mercado Livre (scorecard de fornecedor).
 *
 * Importante (ver PRD, M0/M1): o que foi chamado de "BSC = telemetria" na
 * primeira leitura do projeto NÃO é telemetria bruta — é um relatório de
 * desempenho de fornecedor (Looker Studio "2.0 SRM - BSC Supplier"), de
 * propriedade do cliente (Mercado Livre). Este adaptador só grava em
 * telemetry_events os indicadores agregados que a API do Mercado Livre
 * autorizar oficialmente — nunca o fluxo bruto de posição/odômetro, que
 * pertence ao cliente, e nunca um número inventado para preencher a tela.
 */
export async function isMlConfigured(): Promise<boolean> {
  return Boolean(env.ml.baseUrl && (env.ml.accessToken || (env.ml.clientId && env.ml.clientSecret)));
}

export async function syncBscIndicadores(): Promise<{ synced: number; skipped: string }> {
  if (!(await isMlConfigured())) {
    return {
      synced: 0,
      skipped:
        "Credenciais da API do Mercado Livre ainda não configuradas (ML_API_BASE_URL / ML_ACCESS_TOKEN). " +
        "Nenhum dado de telemetria sintético foi gerado.",
    };
  }
  // TODO: implementar assim que a documentação/credenciais da API do
  // Mercado Livre forem confirmadas. Mapear para telemetry_events com
  // source='bsc', source_id=<id real do indicador/registro>,
  // ON CONFLICT (source, source_id, metrica, data_evento) DO NOTHING.
  return { synced: 0, skipped: "Integração ainda não implementada." };
}
