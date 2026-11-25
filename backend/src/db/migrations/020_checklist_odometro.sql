-- Foto do odômetro obrigatória para concluir o checklist.
ALTER TABLE checklist_fotos ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'item'
  CHECK (tipo IN ('odometro', 'item', 'geral'));
UPDATE checklist_fotos SET tipo = 'geral' WHERE item_id IS NULL AND tipo = 'item';
