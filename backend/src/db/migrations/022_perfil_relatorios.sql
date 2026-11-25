-- Cadastro completo do admin (aparece nos relatórios) e relatórios gerenciais em PDF.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cargo     text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telefone  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS empresa   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS matricula text;

-- Retrato (snapshot) do relatório: o PDF é sempre gerado a partir dele, então abrir
-- o relatório (inclusive pelo link) mostra exatamente o que foi apresentado.
CREATE TABLE IF NOT EXISTS relatorios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL CHECK (tipo IN ('mensal', 'bimestral', 'semestral', 'anual')),
  periodo_inicio date NOT NULL,
  periodo_fim    date NOT NULL,
  titulo         text NOT NULL,
  dados          jsonb NOT NULL,
  autor          jsonb NOT NULL,           -- nome, cargo, empresa, telefone, e-mail, matrícula no momento da geração
  gerado_por     uuid REFERENCES users(id),
  gerado_em      timestamptz NOT NULL DEFAULT now(),
  link_token     text UNIQUE,
  link_expira_em timestamptz,
  link_criado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_relatorios_gerado_em ON relatorios (gerado_em DESC);

ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY relatorios_select ON relatorios FOR SELECT USING (is_privileged_role());
CREATE POLICY relatorios_insert ON relatorios FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY relatorios_update ON relatorios FOR UPDATE USING (is_privileged_role());
CREATE POLICY relatorios_delete ON relatorios FOR DELETE USING (is_privileged_role());
GRANT SELECT, INSERT, UPDATE, DELETE ON relatorios TO gdf_app;
