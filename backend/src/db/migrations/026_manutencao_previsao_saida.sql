-- Previsão de saída da oficina (editável por admin/superadmin).
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS previsao_saida date;
