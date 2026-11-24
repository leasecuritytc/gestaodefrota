-- Rastreabilidade de origem também para "vehicles" (até agora só
-- maintenance_records/checklist_events/telemetry_events tinham
-- source/source_id/ingested_at). Necessário para a integração com Google
-- Sheets (ver backend/src/adapters/googleSheetsAdapter.ts): quando o mesmo
-- veículo é atualizado por mais de uma fonte, precisamos saber qual foi a
-- última a escrever e quando, do mesmo jeito que já fazemos para manutenção
-- e checklist.

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'planilha', 'planilha_google', 'legado_lovable', 'vec', 'bsc'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ingested_at timestamptz;

-- Veículos já existentes (seeds 003 e 008) vieram de planilha/captura manual
-- real -- marcamos como 'planilha' em vez de deixar o default genérico
-- 'manual', para já refletir a origem real sem precisar reimportar nada.
UPDATE vehicles SET source = 'planilha', ingested_at = created_at
  WHERE source = 'manual' AND source_id IS NULL;
