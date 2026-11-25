-- Km de referência definido pelo admin (corrige/complementa VEC e checklists) e
-- "conferidos" das pendências de dados.

-- Quando preenchido, substitui a VEC e os checklists ANTERIORES à data da definição
-- como piso de quilometragem do veículo (checklists concluídos depois continuam valendo).
CREATE TABLE IF NOT EXISTS veiculo_km_referencia (
  vehicle_id   uuid PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  km           numeric NOT NULL CHECK (km >= 0 AND km <= 5000000),
  observacao   text NOT NULL CHECK (length(btrim(observacao)) >= 10),
  definido_por uuid REFERENCES users(id),
  definido_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE veiculo_km_referencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY km_ref_select ON veiculo_km_referencia FOR SELECT USING (is_staff_role());
CREATE POLICY km_ref_write ON veiculo_km_referencia FOR ALL USING (is_privileged_role()) WITH CHECK (is_privileged_role());
GRANT SELECT, INSERT, UPDATE, DELETE ON veiculo_km_referencia TO gdf_app;

-- Correção de km de um checklist já concluído (histórico preservado).
ALTER TABLE checklist_execucoes ADD COLUMN IF NOT EXISTS km_original numeric;
ALTER TABLE checklist_execucoes ADD COLUMN IF NOT EXISTS km_corrigido_por uuid REFERENCES users(id);
ALTER TABLE checklist_execucoes ADD COLUMN IF NOT EXISTS km_corrigido_em timestamptz;
ALTER TABLE checklist_execucoes ADD COLUMN IF NOT EXISTS km_observacao text;

-- Pendências já conferidas pelo admin. A chave inclui a data da informação de origem:
-- se a fonte trouxer dado novo, o alerta volta.
CREATE TABLE IF NOT EXISTS pendencias_conferidas (
  chave        text PRIMARY KEY,
  observacao   text NOT NULL CHECK (length(btrim(observacao)) >= 5),
  conferido_por uuid REFERENCES users(id),
  conferido_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pendencias_conferidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pend_conf_select ON pendencias_conferidas FOR SELECT USING (is_privileged_role());
CREATE POLICY pend_conf_write ON pendencias_conferidas FOR ALL USING (is_privileged_role()) WITH CHECK (is_privileged_role());
GRANT SELECT, INSERT, UPDATE, DELETE ON pendencias_conferidas TO gdf_app;
