-- Row Level Security: defesa em profundidade além do RBAC da API.
-- A API, em cada conexão, roda: SET LOCAL app.role = '<admin|gestor_base|leitor>';
-- Sem essa variável definida, current_setting(...) cai em '' e nenhuma política libera acesso.

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Nenhuma tabela tem política para o papel padrão (PUBLIC) além das criadas abaixo:
-- por padrão, RLS ativado sem política = nega tudo, inclusive para o dono da tabela
-- a menos que ele use BYPASSRLS. O usuário da aplicação (gdf_app) NÃO é superuser,
-- então fica sujeito às políticas.

CREATE OR REPLACE FUNCTION current_app_role() RETURNS text AS $$
  SELECT COALESCE(current_setting('app.role', true), '');
$$ LANGUAGE sql STABLE;

-- Leitura: os três papéis autenticados podem ler.
CREATE POLICY vehicles_select ON vehicles FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY drivers_select ON drivers FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY maintenance_select ON maintenance_records FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY checklist_select ON checklist_events FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY telemetry_select ON telemetry_events FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY snapshots_select ON fleet_snapshots FOR SELECT
  USING (current_app_role() IN ('admin', 'gestor_base', 'leitor'));

-- Escrita: só admin e gestor_base.
CREATE POLICY vehicles_write ON vehicles FOR INSERT WITH CHECK (current_app_role() IN ('admin', 'gestor_base'));
CREATE POLICY vehicles_update ON vehicles FOR UPDATE USING (current_app_role() IN ('admin', 'gestor_base'));
CREATE POLICY vehicles_delete ON vehicles FOR DELETE USING (current_app_role() = 'admin');

CREATE POLICY maintenance_write ON maintenance_records FOR INSERT WITH CHECK (current_app_role() IN ('admin', 'gestor_base'));
CREATE POLICY maintenance_update ON maintenance_records FOR UPDATE USING (current_app_role() IN ('admin', 'gestor_base'));
CREATE POLICY maintenance_delete ON maintenance_records FOR DELETE USING (current_app_role() = 'admin');

-- Checklist e telemetria: só os adaptadores de sincronização (papel 'admin') escrevem.
CREATE POLICY checklist_write ON checklist_events FOR INSERT WITH CHECK (current_app_role() = 'admin');
CREATE POLICY telemetry_write ON telemetry_events FOR INSERT WITH CHECK (current_app_role() = 'admin');
CREATE POLICY snapshots_write ON fleet_snapshots FOR INSERT WITH CHECK (current_app_role() = 'admin');

-- Auditoria: todo mundo autenticado grava seu próprio evento; só admin lê tudo.
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (current_app_role() IN ('admin', 'gestor_base', 'leitor'));
CREATE POLICY audit_select_admin ON audit_log FOR SELECT USING (current_app_role() = 'admin');

-- Usuários: ninguém lê a tabela de usuários por SQL direto fora do papel admin
-- (a API nunca expõe password_hash em nenhuma rota, isso é defesa adicional).
CREATE POLICY users_select_admin ON users FOR SELECT USING (current_app_role() = 'admin');
