-- Edição de inspeção concluída: no máximo 3 vezes, cada uma com motivo e observações,
-- guardando o estado de antes e depois.
ALTER TABLE checklist_execucoes ADD COLUMN IF NOT EXISTS edicoes integer NOT NULL DEFAULT 0;
ALTER TABLE checklist_execucoes DROP CONSTRAINT IF EXISTS chk_exec_edicoes_max;
ALTER TABLE checklist_execucoes ADD CONSTRAINT chk_exec_edicoes_max CHECK (edicoes BETWEEN 0 AND 3);

CREATE TABLE IF NOT EXISTS checklist_edicoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL REFERENCES checklist_execucoes(id) ON DELETE CASCADE,
  numero      integer NOT NULL CHECK (numero BETWEEN 1 AND 3),
  motivo      text NOT NULL CHECK (char_length(btrim(motivo)) >= 10),
  observacoes text NOT NULL CHECK (char_length(btrim(observacoes)) >= 5),
  editado_por uuid REFERENCES users(id),
  editado_em  timestamptz NOT NULL DEFAULT now(),
  antes       jsonb NOT NULL,
  depois      jsonb NOT NULL,
  UNIQUE (execucao_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_chk_edicoes_exec ON checklist_edicoes(execucao_id);
ALTER TABLE checklist_edicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chk_edic_select ON checklist_edicoes;
DROP POLICY IF EXISTS chk_edic_insert ON checklist_edicoes;
CREATE POLICY chk_edic_select ON checklist_edicoes FOR SELECT USING (is_staff_role());
CREATE POLICY chk_edic_insert ON checklist_edicoes FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
GRANT SELECT, INSERT ON checklist_edicoes TO gdf_app;

-- Concluído pode ser atualizado por admin/superadmin, ou pelo próprio gestor que executou
-- (a regra dos 3 usos, motivo e observação é aplicada na API e no CHECK acima).
DROP POLICY IF EXISTS chk_exec_update ON checklist_execucoes;
CREATE POLICY chk_exec_update ON checklist_execucoes FOR UPDATE
  USING (is_privileged_role()
         OR (current_app_role() = 'gestor_base' AND (status = 'Rascunho' OR executado_por = current_app_user_id())));
