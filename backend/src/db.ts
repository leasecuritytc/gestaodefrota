import { Pool, PoolClient } from "pg";
import { env } from "./env";

export const pool = new Pool({ connectionString: env.databaseUrl });

export type AppRole = "superadmin" | "admin" | "gestor_base" | "leitor";

/**
 * Executa `work` dentro de uma transação com `app.role` definido via
 * SET LOCAL, para que as políticas de RLS (migration 002) se apliquem.
 * Nunca reaproveite um client fora desta função sem refazer o SET LOCAL:
 * ele só vale para a transação corrente.
 */
export async function withRole<T>(
  role: AppRole,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.role', $1, true)", [role]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
