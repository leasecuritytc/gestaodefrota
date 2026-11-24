-- A rota de login precisa consultar a tabela "users" ANTES de existir
-- qualquer "app.role" de sessão (o papel só é conhecido depois de validar a
-- senha). Como users tem RLS restrito a current_app_role() = 'admin', essa
-- consulta seria sempre bloqueada. A saída correta não é afrouxar a política
-- de SELECT da tabela, e sim expor só o necessário por uma função
-- SECURITY DEFINER, estreita e auditável: devolve password_hash somente
-- dentro desta função, nunca em uma rota de listagem.

CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (id uuid, email text, password_hash text, role text, active boolean)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT id, email, password_hash, role, active
  FROM users
  WHERE users.email = p_email;
$$;

-- Só o papel de aplicação pode executar esta função; ninguém mais.
REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC;
