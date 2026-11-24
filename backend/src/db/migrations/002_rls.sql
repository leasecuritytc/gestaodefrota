-- Row Level Security: defesa em profundidade além do RBAC da API.
-- A API, em cada conexão, roda:
--   SET LOCAL app.role = '<superadmin|admin|gestor_base|leitor|motorista>';
--   SET LOCAL app.user_id = '<uuid do usuário autenticado>';
-- Sem essas variáveis definidas, current_setting(...) cai em '' e nenhuma política libera acesso.
--
-- Hierarquia de papéis (de praxe em todo projeto): superadmin (dono/
-- desenvolvedor) > admin (administração da operação) > gestor_base
-- (gestão de uma base) > leitor (só consulta). superadmin tem tudo que
-- admin tem, e mais. "motorista" é um papel à parte, de escopo estreito:
-- só vê o próprio registro de motorista, o veículo que dirige hoje e as
-- ocorrências que ele mesmo relatou.

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_driver_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Nenhuma tabela tem política para o papel padrão (PUBLIC) além das criadas abaixo:
-- por padrão, RLS ativado sem política = nega tudo, inclusive para o dono da tabela
-- a menos que ele use BYPASSRLS. O usuário da aplicação (gdf_app) NÃO é superuser,
-- então fica sujeito às políticas.

CREATE OR REPLACE FUNCTION current_app_role() RETURNS text AS $$
  SELECT COALESCE(current_setting('app.role', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- "Privilegiado" = superadmin ou admin (as duas únicas funções que podem
-- apagar registros, escrever em checklist/telemetria e administrar usuários).
CREATE OR REPLACE FUNCTION is_privileged_role() RETURNS boolean AS $$
  SELECT current_app_role() IN ('superadmin', 'admin');
$$ LANGUAGE sql STABLE;

-- "Staff" = os quatro papéis de escritório (tudo, menos motorista).
CREATE OR REPLACE FUNCTION is_staff_role() RETURNS boolean AS $$
  SELECT current_app_role() IN ('superadmin', 'admin', 'gestor_base', 'leitor');
$$ LANGUAGE sql STABLE;

-- id do registro "drivers" ligado ao usuário logado, quando ele é motorista.
CREATE OR REPLACE FUNCTION current_driver_id() RETURNS uuid AS $$
  SELECT id FROM drivers WHERE user_id = current_app_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ===================== Leitura (staff) =====================

CREATE POLICY vehicles_select_staff ON vehicles FOR SELECT USING (is_staff_role());
CREATE POLICY drivers_select_staff ON drivers FOR SELECT USING (is_staff_role());
CREATE POLICY vdh_select_staff ON vehicle_driver_history FOR SELECT USING (is_staff_role());
CREATE POLICY maintenance_select_staff ON maintenance_records FOR SELECT USING (is_staff_role());
CREATE POLICY checklist_select_staff ON checklist_events FOR SELECT USING (is_staff_role());
CREATE POLICY telemetry_select_staff ON telemetry_events FOR SELECT USING (is_staff_role());
CREATE POLICY snapshots_select_staff ON fleet_snapshots FOR SELECT USING (is_staff_role());
CREATE POLICY occurrences_select_staff ON occurrences FOR SELECT USING (is_staff_role());

-- ===================== Leitura (motorista — só o que é seu) =====================

CREATE POLICY drivers_select_self ON drivers FOR SELECT
  USING (current_app_role() = 'motorista' AND user_id = current_app_user_id());

CREATE POLICY vehicles_select_motorista ON vehicles FOR SELECT
  USING (current_app_role() = 'motorista' AND motorista_atual_id = current_driver_id());

CREATE POLICY occurrences_select_motorista ON occurrences FOR SELECT
  USING (current_app_role() = 'motorista' AND driver_id = current_driver_id());

-- ===================== Escrita (staff) =====================
-- superadmin, admin e gestor_base escrevem; exclusão só superadmin/admin.

CREATE POLICY vehicles_write ON vehicles FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY vehicles_update ON vehicles FOR UPDATE
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY vehicles_delete ON vehicles FOR DELETE
  USING (is_privileged_role());

CREATE POLICY drivers_write ON drivers FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY drivers_update ON drivers FOR UPDATE
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));

CREATE POLICY vdh_write ON vehicle_driver_history FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));

CREATE POLICY maintenance_write ON maintenance_records FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY maintenance_update ON maintenance_records FOR UPDATE
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY maintenance_delete ON maintenance_records FOR DELETE
  USING (is_privileged_role());

-- Checklist e telemetria: só os adaptadores de sincronização (papel privilegiado) escrevem.
CREATE POLICY checklist_write ON checklist_events FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY telemetry_write ON telemetry_events FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY snapshots_write ON fleet_snapshots FOR INSERT WITH CHECK (is_privileged_role());

-- ===================== Ocorrências: escrita (staff registra em nome de qualquer motorista) ====

CREATE POLICY occurrences_write_staff ON occurrences FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
CREATE POLICY occurrences_update_staff ON occurrences FOR UPDATE
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));

-- Motorista só cria ocorrência em seu próprio nome, para o veículo que dirige hoje.
CREATE POLICY occurrences_write_motorista ON occurrences FOR INSERT
  WITH CHECK (
    current_app_role() = 'motorista'
    AND driver_id = current_driver_id()
    AND vehicle_id IN (SELECT id FROM vehicles WHERE motorista_atual_id = current_driver_id())
  );

-- Auditoria: todo mundo autenticado grava seu próprio evento; só papel privilegiado lê tudo.
CREATE POLICY audit_insert ON audit_log FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base', 'leitor', 'motorista'));
CREATE POLICY audit_select_admin ON audit_log FOR SELECT USING (is_privileged_role());

-- Usuários: ninguém lê/escreve a tabela de usuários fora do papel privilegiado
-- (a API nunca expõe password_hash em nenhuma rota, isso é defesa adicional).
CREATE POLICY users_select_admin ON users FOR SELECT USING (is_privileged_role());
