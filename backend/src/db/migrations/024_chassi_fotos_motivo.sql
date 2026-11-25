-- Motivo (menu de opções) ao dispensar alertas + fotos do chassi por veículo.
ALTER TABLE pendencias_conferidas ADD COLUMN IF NOT EXISTS motivo text;

CREATE TABLE IF NOT EXISTS veiculo_fotos_chassi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  mime        text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  tamanho     integer NOT NULL,
  dados       bytea NOT NULL,
  enviado_por uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fotos_chassi_veiculo ON veiculo_fotos_chassi(vehicle_id);
ALTER TABLE veiculo_fotos_chassi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fotos_chassi_privilegiado ON veiculo_fotos_chassi;
CREATE POLICY fotos_chassi_privilegiado ON veiculo_fotos_chassi FOR ALL USING (is_privileged_role()) WITH CHECK (is_privileged_role());
GRANT SELECT, INSERT, UPDATE, DELETE ON veiculo_fotos_chassi TO gdf_app;

-- Completa o cadastro com o que a VEC já trouxe, sem sobrescrever o que já está preenchido.
UPDATE vehicles v SET chassi = e.chassi
  FROM (SELECT DISTINCT ON (placa) placa, btrim(chassi) AS chassi FROM checklist_events
         WHERE chassi IS NOT NULL AND btrim(chassi) <> '' ORDER BY placa, data_hora DESC) e
 WHERE e.placa = v.placa AND (v.chassi IS NULL OR btrim(v.chassi) = '');
UPDATE vehicles v SET tipo = btrim(vv.tipo)
  FROM vec_veiculos vv
 WHERE vv.placa = v.placa AND vv.tipo IS NOT NULL AND btrim(vv.tipo) <> '' AND (v.tipo IS NULL OR btrim(v.tipo) = '');
