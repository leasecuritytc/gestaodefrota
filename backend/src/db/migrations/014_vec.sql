-- Integração com o portal VEC Fleet (Mercado Livre).
--
-- vec_veiculos: foto mais recente de cada veículo como a VEC mostra
-- (estado "ATIVO - BIPANDO" / "FROTA OCIOSA" / "EM MANUTENÇÃO", km, último
-- BIP, SVC, locadora...). Fica numa tabela PRÓPRIA, de propósito: a VEC
-- enxerga toda a frota RodaCoop (centenas de veículos, várias bases), com
-- status num vocabulário diferente do nosso. Misturar direto em "vehicles"
-- sobrescreveria os dados de campo já conferidos (planilha da base). A
-- tela de Veículos junta as duas pela placa.
--
-- vec_sync_log: histórico de cada sincronização (quando, quanto, erro) —
-- para o admin saber se a integração está viva.

CREATE TABLE vec_veiculos (
  placa           text PRIMARY KEY,
  vec_id          text,
  estado          text,
  utilizacao      text,
  marca           text,
  modelo          text,
  tipo            text,
  regiao          text,
  subregiao       text,
  svc             text,
  transportadora  text,
  locadora        text,
  km              numeric,
  ultimo_bip      timestamptz,
  payload         jsonb,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vec_veiculos_svc ON vec_veiculos(svc);

CREATE TABLE vec_sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  origem       text NOT NULL,           -- 'automatico' | 'manual'
  ok           boolean,
  veiculos     integer NOT NULL DEFAULT 0,
  checklists   integer NOT NULL DEFAULT 0,
  erro         text
);

ALTER TABLE vec_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vec_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY vec_veiculos_select_staff ON vec_veiculos FOR SELECT USING (is_staff_role());
CREATE POLICY vec_veiculos_write ON vec_veiculos FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY vec_veiculos_update ON vec_veiculos FOR UPDATE USING (is_privileged_role());

CREATE POLICY vec_sync_log_select ON vec_sync_log FOR SELECT USING (is_privileged_role());
CREATE POLICY vec_sync_log_write ON vec_sync_log FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY vec_sync_log_update ON vec_sync_log FOR UPDATE USING (is_privileged_role());

-- checklist_events já tem RLS de leitura para staff e escrita privilegiada
-- (002_rls.sql). Falta só permitir atualizar (reimportar a mesma inspeção).
CREATE POLICY checklist_update ON checklist_events FOR UPDATE USING (is_privileged_role());
