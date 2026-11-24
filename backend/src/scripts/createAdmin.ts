/**
 * Cria (ou atualiza a senha de) um usuário admin.
 * Uso, de dentro do container da API:
 *   ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='senha-forte' node dist/scripts/createAdmin.js
 *
 * Nunca roda sozinho no boot da API — é um comando manual, para você não
 * ficar com uma senha padrão documentada em lugar nenhum do repositório.
 */
import bcrypt from "bcryptjs";
import { pool } from "../db";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? "Administrador";

  if (!email || !password) {
    console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de rodar este script.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD precisa ter pelo menos 12 caracteres.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  // Esta consulta roda com o usuário de aplicação, que tem RLS restrita em
  // "users" a current_app_role() = 'admin'. Por isso usamos set_config
  // temporário igual ao resto do app — é a mesma regra para todo mundo,
  // sem atalho especial para este script.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.role', 'admin', true)");
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, hash, fullName]
    );
    await client.query("COMMIT");
    console.log(`Usuário admin pronto: ${email}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
