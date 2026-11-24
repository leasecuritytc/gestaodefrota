-- Suporte para a base operacional real (SMG3 - Pouso Alegre / SMG5 - Frota
-- Locada), capturada em planilha de campo do coordenador responsavel: ver
-- 008_seed_base_smg3_pouso_alegre.sql e docs/base-smg3-pouso-alegre.md.

-- Campo livre para a observação operacional mais recente de cada veículo
-- (ex.: "DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS", "SINISTRO,CENTRO
-- AUTOMOTIVO VA"). Não substitui maintenance_records/occurrences -- é a nota
-- de campo do responsável pela base, como veio na fonte.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS observacoes text;

-- Até aqui, nada impedia dois registros de driver com o mesmo nome (a
-- aplicação sempre criou/consultou por id). Como a planilha de campo real
-- traz o mesmo motorista citado em mais de um veículo (troca recente,
-- registrada em texto livre na própria planilha -- ver docs), precisamos de
-- uma forma segura de "achar ou criar" um motorista pelo nome sem duplicar.
-- Índice único por nome normalizado (minúsculo, sem espaço nas pontas):
-- permite ON CONFLICT ((lower(btrim(nome)))) DO NOTHING nos seeds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_nome_normalizado
  ON drivers (lower(btrim(nome)));
