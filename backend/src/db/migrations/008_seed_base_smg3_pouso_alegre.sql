-- Dados REAIS da base SMG3 (Pouso Alegre/MG) e SMG5 (Frota Locada), fonte:
-- planilha 'Copia de BASE_SMG3 - POUSO ALEGRE', enviada pelo usuario em 24/11/2026,
-- coordenador responsavel CRISVER. Arquivo original preservado em
-- docs/fontes/BASE_SMG3_POUSO_ALEGRE_24-11-2026.xlsx para auditoria.
--
-- Esta e a FOTO ATUAL (24/11/2026) operacional da base, mais recente que o
-- snapshot legado inserido em 003_seed_dados_reais.sql. Por isso os veiculos
-- ja existentes (ex.: TZK0E08, TZK0E09, TZK0E18, TZK0E20, TZK0E24, TZK0E33,
-- TZK0E37, TZK0E38, TZK0E44, TKN8F67) sao ATUALIZADOS (status/motorista/obs),
-- nao duplicados -- ON CONFLICT (placa) DO UPDATE.
--
-- Nada aqui foi inventado: nome de motorista, placa, status e observacao sao
-- transcricao literal da planilha. Onde o mesmo motorista aparece em mais de
-- um veiculo (ex.: RENAN VAZ GONCALVES, RONDEVALDO NOVATO PEDRO), isso reflete
-- a propria planilha (troca recente de veiculo) -- ver docs/base-smg3-pouso-alegre.md.

-- ===================== Motoristas (novos, por nome) =====================

INSERT INTO drivers (nome) VALUES
  ('JULIO CESAR DANIEL'),
  ('MAYCON JOAQUIM ALMEIDA'),
  ('MARCOS VINICIUS BATISTA DA SILVA'),
  ('LUCAS ALBUQUEQUER DUARTE'),
  ('RENAN VAZ GONÇALVES'),
  ('JANAINA VARGAS'),
  ('NAYRON DANIEL'),
  ('RONDEVALDO NOVATO PEDRO'),
  ('LUCAS ANCELMO'),
  ('DOUGLAS BENEDITO'),
  ('JONATHAN CAMPIONI RAIMUNDO'),
  ('MARCIO SILVA PERDÃO'),
  ('ARISTON DA SILVA FERNANDES'),
  ('PAULO HENRIQUE ROCHA'),
  ('LEOMAR MONTEIRO REZENDE DA SILVA'),
  ('LUIZ ANTONIO ANDRADE PEREIRA'),
  ('HENRIQUE JUNIOR DO COUTO'),
  ('ADRIAN  FONSECA FERNANDES'),
  ('JOSIAS DE JESUS DA SILVA'),
  ('IGOR VELOSO DA SILVA'),
  ('GUSTAVO HENRIQUE FERREIRA'),
  ('MARCOS VINICIUS BATISTA'),
  ('FRANCYS HENRIQUE DE SOUZA'),
  ('CAIO DANTAS LISA'),
  ('MARCIO HENRIQUE DOMINGOS')
ON CONFLICT ((lower(btrim(nome)))) DO NOTHING;

-- ===================== Veiculos (upsert por placa) =====================

INSERT INTO vehicles (placa, base, rentadora, subregiao, status, tipo)
VALUES
  ('RUV4F08', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4E78', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4F15', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUX2B36', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4F95', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4F04', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUX2B41', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4E85', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('RUV4E79', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Desmobilizado', 'Utilitário'),
  ('TZK0E35', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Sem cooperado', 'Utilitário'),
  ('TZK0E46', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E43', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E42', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E15', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E24', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Manutenção', 'Utilitário'),
  ('TZK0E13', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E40', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E33', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Manutenção', 'Utilitário'),
  ('TZK0E09', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E29', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Sem cooperado', 'Utilitário'),
  ('TZK0E36', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E14', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E21', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK7F75', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E16', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK7G28', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK7I63', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK7F84', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E44', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK7I48', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E37', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Manutenção', 'Utilitário'),
  ('TZK0E20', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E18', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E25', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E38', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Manutenção', 'Utilitário'),
  ('TZK0E39', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E32', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TZK0E08', 'SMG3', 'LOCALIZA', 'Pouso Alegre (MG)', 'Ativa', 'Utilitário'),
  ('TKN8F67', 'SMG5', 'MOVIDA', 'Frota Locada', 'Ativa', 'Utilitário'),
  ('TKH8D41', 'SMG5', 'MOVIDA', 'Frota Locada', 'Sem cooperado', 'Utilitário'),
  ('TJB5I07', 'SMG5', 'MOVIDA', 'Frota Locada', 'Ativa', 'Utilitário'),
  ('TKG1G68', 'SMG5', 'MOVIDA', 'Frota Locada', 'Ativa', 'Utilitário')
ON CONFLICT (placa) DO UPDATE SET
  base       = EXCLUDED.base,
  rentadora  = EXCLUDED.rentadora,
  subregiao  = EXCLUDED.subregiao,
  status     = EXCLUDED.status,
  updated_at = now();

-- ===================== Observacoes literais por veiculo =====================

UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4F08';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4E78';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4F15';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUX2B36';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4F95';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4F04';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUX2B41';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4E85';
UPDATE vehicles SET observacoes = 'DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS' WHERE placa = 'RUV4E79';
UPDATE vehicles SET observacoes = 'entregue a operação 19/11/26 | tirar hj manutenção' WHERE placa = 'TZK0E35';
UPDATE vehicles SET observacoes = 'ASSUMIU VEICULO DEVIDO MANUTENÇÃO DA 0E38' WHERE placa = 'TZK0E42';
UPDATE vehicles SET observacoes = 'AFASTADO DEVIDO SAUDE DA ESPOSA,VOLTA AMANHA 23/10' WHERE placa = 'TZK0E15';
UPDATE vehicles SET observacoes = 'TKZ0E37 SINISTRO ,solicitado reserva 20/10' WHERE placa = 'TZK0E24';
UPDATE vehicles SET observacoes = '21/10 ESTAVA OFICINA PREVENTICA 10 MIL KMS' WHERE placa = 'TZK0E13';
UPDATE vehicles SET observacoes = 'CENTRO AUTOMOTIVO VAREJÃO' WHERE placa = 'TZK0E33';
UPDATE vehicles SET observacoes = 'INDISPONIBILIDADE' WHERE placa = 'TZK0E09';
UPDATE vehicles SET observacoes = 'ENTREGOU A FROTA 19/11,AINDA NÃO ENTREGOU A CHAVE | INDISPONIBILIDADE' WHERE placa = 'TZK0E29';
UPDATE vehicles SET observacoes = 'apresentou falha eletrica  em rota ,reserva solicitada' WHERE placa = 'TZK7I63';
UPDATE vehicles SET observacoes = 'ASSUMIU DEPOIS DA 0E33 IR PRA MAUTENÇÃO | VEICULO GUINCHADO 20/10' WHERE placa = 'TZK7F84';
UPDATE vehicles SET observacoes = 'ja esta manutenção' WHERE placa = 'TZK7I48';
UPDATE vehicles SET observacoes = 'SINISTRO,CENTRO AUTOMOTIVO VA' WHERE placa = 'TZK0E37';
UPDATE vehicles SET observacoes = 'VEICULO TITULAR TZK0E35 APRESENTOU FALHAS ,ARRENDAMENTO OK' WHERE placa = 'TZK0E20';
UPDATE vehicles SET observacoes = 'DEU ENTRADA MANUTENÇÃO 19/11 CENTRO AUTOMOTIVO VA' WHERE placa = 'TZK0E38';

-- ===================== Motorista atual de cada veiculo =====================

UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('JULIO CESAR DANIEL'))) WHERE placa = 'TZK0E46';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('MAYCON JOAQUIM ALMEIDA'))) WHERE placa = 'TZK0E43';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('MARCOS VINICIUS BATISTA DA SILVA'))) WHERE placa = 'TZK0E42';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('LUCAS ALBUQUEQUER DUARTE'))) WHERE placa = 'TZK0E15';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('RENAN VAZ GONÇALVES'))) WHERE placa = 'TZK0E24';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('JANAINA VARGAS'))) WHERE placa = 'TZK0E13';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('NAYRON DANIEL'))) WHERE placa = 'TZK0E40';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('RONDEVALDO NOVATO PEDRO'))) WHERE placa = 'TZK0E33';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('LUCAS ANCELMO'))) WHERE placa = 'TZK0E09';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('DOUGLAS BENEDITO'))) WHERE placa = 'TZK0E29';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('JONATHAN CAMPIONI RAIMUNDO'))) WHERE placa = 'TZK0E36';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('RENAN VAZ GONÇALVES'))) WHERE placa = 'TZK0E14';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('MARCIO SILVA PERDÃO'))) WHERE placa = 'TZK0E21';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('ARISTON DA SILVA FERNANDES'))) WHERE placa = 'TZK7F75';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('PAULO HENRIQUE ROCHA'))) WHERE placa = 'TZK0E16';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('LEOMAR MONTEIRO REZENDE DA SILVA'))) WHERE placa = 'TZK7G28';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('LUIZ ANTONIO ANDRADE PEREIRA'))) WHERE placa = 'TZK7I63';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('RONDEVALDO NOVATO PEDRO'))) WHERE placa = 'TZK7F84';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('HENRIQUE JUNIOR DO COUTO'))) WHERE placa = 'TZK0E44';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('ADRIAN  FONSECA FERNANDES'))) WHERE placa = 'TZK7I48';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('RENAN VAZ GONÇALVES'))) WHERE placa = 'TZK0E37';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('JOSIAS DE JESUS DA SILVA'))) WHERE placa = 'TZK0E20';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('IGOR VELOSO DA SILVA'))) WHERE placa = 'TZK0E18';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('GUSTAVO HENRIQUE FERREIRA'))) WHERE placa = 'TZK0E25';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('MARCOS VINICIUS BATISTA'))) WHERE placa = 'TZK0E38';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('FRANCYS HENRIQUE DE SOUZA'))) WHERE placa = 'TZK0E39';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('CAIO DANTAS LISA'))) WHERE placa = 'TZK0E32';
UPDATE vehicles SET motorista_atual_id = (SELECT id FROM drivers WHERE lower(btrim(nome)) = lower(btrim('MARCIO HENRIQUE DOMINGOS'))) WHERE placa = 'TZK0E08';

-- ===================== Historico de motorista por veiculo =====================
-- Registra, para cada veiculo com motorista atual nesta captura, o inicio do
-- vinculo na data desta planilha (24/11/2026). Nao ha data exata de inicio na
-- fonte, entao usamos a data da propria captura -- nunca uma data anterior
-- inventada. fim fica NULL (vinculo em aberto).

INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E46' AND lower(btrim(d.nome)) = lower(btrim('JULIO CESAR DANIEL'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E43' AND lower(btrim(d.nome)) = lower(btrim('MAYCON JOAQUIM ALMEIDA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E42' AND lower(btrim(d.nome)) = lower(btrim('MARCOS VINICIUS BATISTA DA SILVA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E15' AND lower(btrim(d.nome)) = lower(btrim('LUCAS ALBUQUEQUER DUARTE'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E24' AND lower(btrim(d.nome)) = lower(btrim('RENAN VAZ GONÇALVES'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E13' AND lower(btrim(d.nome)) = lower(btrim('JANAINA VARGAS'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E40' AND lower(btrim(d.nome)) = lower(btrim('NAYRON DANIEL'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E33' AND lower(btrim(d.nome)) = lower(btrim('RONDEVALDO NOVATO PEDRO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E09' AND lower(btrim(d.nome)) = lower(btrim('LUCAS ANCELMO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E29' AND lower(btrim(d.nome)) = lower(btrim('DOUGLAS BENEDITO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E36' AND lower(btrim(d.nome)) = lower(btrim('JONATHAN CAMPIONI RAIMUNDO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E14' AND lower(btrim(d.nome)) = lower(btrim('RENAN VAZ GONÇALVES'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E21' AND lower(btrim(d.nome)) = lower(btrim('MARCIO SILVA PERDÃO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK7F75' AND lower(btrim(d.nome)) = lower(btrim('ARISTON DA SILVA FERNANDES'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E16' AND lower(btrim(d.nome)) = lower(btrim('PAULO HENRIQUE ROCHA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK7G28' AND lower(btrim(d.nome)) = lower(btrim('LEOMAR MONTEIRO REZENDE DA SILVA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK7I63' AND lower(btrim(d.nome)) = lower(btrim('LUIZ ANTONIO ANDRADE PEREIRA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK7F84' AND lower(btrim(d.nome)) = lower(btrim('RONDEVALDO NOVATO PEDRO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E44' AND lower(btrim(d.nome)) = lower(btrim('HENRIQUE JUNIOR DO COUTO'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK7I48' AND lower(btrim(d.nome)) = lower(btrim('ADRIAN  FONSECA FERNANDES'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E37' AND lower(btrim(d.nome)) = lower(btrim('RENAN VAZ GONÇALVES'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E20' AND lower(btrim(d.nome)) = lower(btrim('JOSIAS DE JESUS DA SILVA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E18' AND lower(btrim(d.nome)) = lower(btrim('IGOR VELOSO DA SILVA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E25' AND lower(btrim(d.nome)) = lower(btrim('GUSTAVO HENRIQUE FERREIRA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E38' AND lower(btrim(d.nome)) = lower(btrim('MARCOS VINICIUS BATISTA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E39' AND lower(btrim(d.nome)) = lower(btrim('FRANCYS HENRIQUE DE SOUZA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E32' AND lower(btrim(d.nome)) = lower(btrim('CAIO DANTAS LISA'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
INSERT INTO vehicle_driver_history (vehicle_id, driver_id, inicio)
  SELECT v.id, d.id, '2026-11-24'::timestamptz
  FROM vehicles v, drivers d
  WHERE v.placa = 'TZK0E08' AND lower(btrim(d.nome)) = lower(btrim('MARCIO HENRIQUE DOMINGOS'))
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_driver_history h
    WHERE h.vehicle_id = v.id AND h.driver_id = d.id AND h.fim IS NULL
  );
