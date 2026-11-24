-- Completa a RLS de "users": a migration 002 só tinha política de SELECT.
-- Sem política de INSERT/UPDATE, a tabela fica travada até para o script
-- de criação do admin (009createAdmin.ts), que é exatamente quem precisa
-- escrever nela.

CREATE POLICY users_insert_admin ON users FOR INSERT
  WITH CHECK (current_app_role() = 'admin');

CREATE POLICY users_update_admin ON users FOR UPDATE
  USING (current_app_role() = 'admin');
