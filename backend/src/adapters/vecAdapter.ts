import { env } from "../env";
import { withRole } from "../db";

/**
 * Adaptador da VEC (checklist e segurança).
 *
 * Propositalmente NÃO FAZ NADA até existir VEC_API_BASE_URL e VEC_API_TOKEN
 * configurados — nunca gera dado fictício para preencher a tela. Enquanto
 * isso, os registros em checklist_events vêm só da amostra real importada em
 * 003_seed_dados_reais.sql (origem = 'vec', coletada manualmente em
 * 24/11/2026).
 *
 * Quando a RodaCoop tiver um token oficial da VEC (ou da API do Mercado
 * Livre, se for por ela que o checklist passa a ser exposto), preencher
 * VEC_API_BASE_URL/VEC_API_TOKEN no .env e implementar fetchInspections()
 * abaixo, no mesmo formato de linhas que a tela "Lista de Inspeções" mostra.
 */
export async function isVecConfigured(): Promise<boolean> {
  return Boolean(env.vec.baseUrl && env.vec.apiToken);
}

export async function syncVecChecklist(): Promise<{ synced: number; skipped: string }> {
  if (!(await isVecConfigured())) {
    return {
      synced: 0,
      skipped:
        "VEC_API_BASE_URL/VEC_API_TOKEN não configurados. Nenhum dado sintético foi gerado.",
    };
  }
  // TODO: implementar a chamada real à API da VEC assim que o token chegar.
  // const resp = await fetch(`${env.vec.baseUrl}/...`, { headers: { Authorization: `Bearer ${env.vec.apiToken}` } });
  // ... mapear para checklist_events com source='vec', source_id=<ID real>, ON CONFLICT (source, source_id) DO NOTHING
  return { synced: 0, skipped: "Integração ainda não implementada." };
}

void withRole; // mantém a importação ligada ao padrão usado pelos outros adapters
