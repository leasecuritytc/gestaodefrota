-- Completa a RLS de "users": a migration 002 só tinha política de SELECT.
-- Sem política de INSERT/UPDATE, a tabela fica travada até para o script
-- de criação do admin (createAdmin.ts), que é exatamente quem precisa
-- escrever nela. Só papel privilegiado (superadmin/admin) gerencia usuários.

CREATE POLICY users_insert_admin ON users FOR INSERT
  WITH CHECK (is_privileged_role());

CREATE POLICY users_update_admin ON users FOR UPDATE
  USING (is_privileged_role());
