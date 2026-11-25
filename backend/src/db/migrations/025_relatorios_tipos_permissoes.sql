-- Novos tipos de relatório (semanal, quinzenal, personalizado por datas).
ALTER TABLE relatorios DROP CONSTRAINT IF EXISTS relatorios_tipo_check;
ALTER TABLE relatorios ADD CONSTRAINT relatorios_tipo_check
  CHECK (tipo IN ('semanal', 'quinzenal', 'mensal', 'bimestral', 'semestral', 'anual', 'personalizado'));

-- Auditoria: somente superadmin (admin não lê mais o log, nem por concessão).
CREATE OR REPLACE FUNCTION pode_ver_auditoria() RETURNS boolean AS $$
  SELECT current_app_role() = 'superadmin';
$$ LANGUAGE sql STABLE;
UPDATE users SET acesso_auditoria = false WHERE acesso_auditoria;
