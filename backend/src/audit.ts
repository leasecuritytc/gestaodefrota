import { PoolClient } from "pg";

/**
 * Grava uma linha em audit_log. Chamar sempre DENTRO da mesma transação
 * (mesmo `client`) da ação que está sendo registrada, para que um erro na
 * ação principal desfaça (ROLLBACK) também o registro de auditoria —
 * nunca queremos um log "fantasma" de uma ação que na verdade falhou.
 *
 * `detalhes` vai para uma coluna jsonb: guarde aqui o "antes/depois" de
 * forma literal (ex.: { motorista_anterior: 'João', motorista_novo: 'Maria' }),
 * nunca um resumo em texto livre — isso é o que torna o log exportável
 * como relatório estruturado (ver routes/audit.routes.ts).
 */
export async function registrarAuditoria(
  client: PoolClient,
  userId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  detalhes: Record<string, unknown> | null
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (user_id, acao, entidade, entidade_id, detalhes)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, acao, entidade, entidadeId, detalhes ? JSON.stringify(detalhes) : null]
  );
}
