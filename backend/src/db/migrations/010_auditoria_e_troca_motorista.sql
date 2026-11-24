-- Suporte para:
--   1) troca de motorista de veículo (rota PATCH /api/vehicles/:id/motorista,
--      liberada para gestor_base, admin e superadmin — decisão do dono do
--      projeto em 24/11/2026);
--   2) auditoria: por padrão só superadmin enxerga o log de auditoria;
--      superadmin pode liberar o acesso para um admin específico depois
--      (nunca automático, nunca para gestor_base/leitor/motorista).

-- Flag de concessão de acesso à auditoria, só tem efeito para quem já é
-- 'admin' (um gestor_base/leitor com a flag true não ganha nada — a função
-- pode_ver_auditoria() abaixo só olha essa flag quando o papel já é admin).
ALTER TABLE users ADD COLUMN IF NOT EXISTS acesso_auditoria boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION pode_ver_auditoria() RETURNS boolean AS $$
  SELECT current_app_role() = 'superadmin'
    OR (
      current_app_role() = 'admin'
      AND EXISTS (
        SELECT 1 FROM users
        WHERE id = current_app_user_id() AND acesso_auditoria = true
      )
    );
$$ LANGUAGE sql STABLE;

-- Substitui a política antiga (liberava para qualquer papel privilegiado,
-- ou seja, todo admin via is_privileged_role()) por uma mais restrita:
-- só superadmin, ou admin com a flag concedida.
DROP POLICY IF EXISTS audit_select_admin ON audit_log;
CREATE POLICY audit_select_auditoria ON audit_log FOR SELECT USING (pode_ver_auditoria());

-- audit_insert (qualquer papel autenticado pode gravar seu próprio evento)
-- já existe desde 002_rls.sql e continua valendo — toda ação relevante da
-- API grava aqui, independente de quem tem permissão de LER o log depois.
