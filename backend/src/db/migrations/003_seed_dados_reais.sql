-- Dados REAIS coletados em 24/11/2026 durante a auditoria:
--   • 12 registros de manutencao_records e 13 fleet_snapshots lidos do banco
--     público da plataforma Lovable atual (fleet-journey-reports.lovable.app),
--     via a própria chave pública que o site expõe (achado de segurança C1/C2
--     do PRD — corrigido nesta reconstrução).
--   • 10 inspeções reais lidas na VEC (meli-br.vecfleet.io), tela "Lista de
--     Inspeções", com login autorizado do usuário.
-- Nenhum valor abaixo foi inventado. Onde um dado não apareceu na fonte
-- (ex.: tipo de veículo, status atual), o campo fica NULL / valor padrão,
-- nunca preenchido com um palpite.

-- ===================== Veículos (derivados das placas reais vistas) =====================

INSERT INTO vehicles (placa, chassi, base, transportadora, rentadora, subregiao, status) VALUES
  ('FYB0J84', NULL, 'SMG9', NULL, NULL, NULL, 'Ativa'),
  ('TZK0E38', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E24', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E20', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E09', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Ativa'),
  ('TZK0E33', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E37', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TKN8F67', NULL, 'SMG5', NULL, 'MOVIDA', NULL, 'Manutenção'),
  ('TZK0E44', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E18', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('TZK0E08', NULL, 'SMG3', NULL, 'LOCALIZA', NULL, 'Manutenção'),
  ('SIA6C49', '9362651XAP9224096', 'SRS10', 'RodaCoop', 'Dedicado', 'SUL (SC/RS)', 'Ativa'),
  ('SHY3G08', '9BD2651PAR9238624', 'SRS10', 'RodaCoop', 'Dedicado', 'SUL (SC/RS)', 'Ativa'),
  ('TYD8G10', '9BD2651PFT9321162', 'SGO1', 'RodaCoop', 'Localiza', 'NOCO', 'Ativa'),
  ('UCN5I20', '95355FTE1VR021469', 'SGO1', 'RodaCoop', 'LM', 'NOCO', 'Ativa'),
  ('TZU9E25', '95355FTE6VR017109', 'SGO1', 'RodaCoop', 'LM', 'NOCO', 'Ativa'),
  ('UCM6F92', '95355FTE1VR023206', 'SGO1', 'RodaCoop', 'LM', 'NOCO', 'Ativa'),
  ('UCM6C06', '95355FTE5VR023368', 'SGO1', 'RodaCoop', 'LM', 'NOCO', 'Ativa'),
  ('RNJ9C43', '93YMAFEXANJ007954', 'SGO1', 'RodaCoop', 'Localiza', 'NOCO', 'Ativa'),
  ('TXP9H55', '93ZC635BZT8216007', 'SGO1', 'RodaCoop', 'VAMOS', 'NOCO', 'Ativa')
ON CONFLICT (placa) DO NOTHING;

-- ===================== Manutenções reais (fonte: legado_lovable) =====================

INSERT INTO maintenance_records
  (placa, base, tipo, descricao, oficina, data_entrada, data_saida, custo, status, source, source_id)
VALUES
  ('FYB0J84', 'SMG9', 'Outros',   '233werfwefwefwefwefwef', 'sq', '2026-11-20', '2026-11-11', 4344, 'Concluída',
    'legado_lovable', 'f5fcd710-2786-497a-8c7d-0528301ad482'),
  ('TZK0E38', 'SMG3', 'Corretiva','TROCAR PASTILHAS DE FREIO ,ALINHAMENTO E BALANCEAMENTO,TROCA DE OLEO E FILTROS',
    'CENTRO AUTOMOTIVO VAREJÃO', '2026-11-19', NULL, 0, 'Em andamento',
    'legado_lovable', '3bbadcb4-6127-4d9f-81a1-1df055112126'),
  ('TZK0E24', 'SMG3', 'Corretiva','REPARO BATIDA SINISTRO NA LATERAL', 'CENTRO AUTOMOTIVO VAREJÃO',
    '2026-11-17', NULL, 0, 'Em andamento', 'legado_lovable', 'dc9783d3-b97a-4cb5-b653-143f24784522'),
  ('TZK0E38', 'SMG3', 'Outros',   'REPARO NO APARELHO DE TELEMETRIA', 'SERVICE SMG3',
    '2026-11-27', NULL, 0, 'Em andamento', 'legado_lovable', '832921db-c9cc-429e-b92c-280622b8941d'),
  ('TZK0E20', 'SMG3', 'Preventiva','TROCA DE OLEO E FILTROS,ALINHAMENTO E BALANCEAMENTO', 'RIBEIRO CAR',
    '2026-11-24', NULL, 0, 'Em andamento', 'legado_lovable', 'aa640954-be93-4e9c-9894-830ff63a221c'),
  ('TZK0E09', 'SMG3', 'Preventiva','TROCA DE OLEO E FILTROS,ALINHAMENTO E BALANCEAMENTO', 'MECATRONICA F.C',
    '2026-11-16', '2026-11-18', 0, 'Concluída', 'legado_lovable', '8bfb551f-ab0c-4f31-b55d-33e791c3448d'),
  ('TZK0E33', 'SMG3', 'Corretiva','REPARO LATERAL BATIDA,SINISTRO', 'CENTRO AUTOMOTIVO VA',
    '2026-11-10', NULL, 0, 'Em andamento', 'legado_lovable', 'a7b7b96b-ab4f-4035-8565-b1231f15f376'),
  ('TZK0E37', 'SMG3', 'Corretiva','REPARO BATIDA SINISTRO', 'CENTRO AUTOMOTIVO VAREJÃO',
    '2026-10-29', NULL, 0, 'Em andamento', 'legado_lovable', '36351b72-33e0-4a78-961b-453cc177f068'),
  ('TKN8F67', 'SMG5', 'Preventiva','TROCA DE OLEO E FILTROS,BALANCEAMENTO E ALINHAMENTO', 'R&A CENTRO AUTOMOTIVO',
    '2026-12-04', NULL, 0, 'Em andamento', 'legado_lovable', 'a0cdc569-f6ab-4fe1-894a-2927ec75e02c'),
  ('TZK0E44', 'SMG3', 'Corretiva', E'TROCA DE OLEO E FILTROS\nTROCA PASTILHA DE FREIOS', 'CENTRO AUTOMOTIVO VAREJÃO',
    '2026-11-26', NULL, 0, 'Em andamento', 'legado_lovable', '99973d18-0990-4266-a4fc-040cd95ad9c8'),
  ('TZK0E18', 'SMG3', 'Corretiva','TROCA DE PASTILHA DEVIDO DESGATE,ALINHAMENTO E BALANCEAMENTO.', 'RE REVISOES AUTOMOTIVAS',
    '2026-11-25', NULL, 0, 'Em andamento', 'legado_lovable', '3b65e1ba-b4df-44b4-8e68-fb678e93e006'),
  ('TZK0E08', 'SMG3', 'Corretiva','REPARO SINISTRO', 'CENTRO AUTOMOTIVO VAREJÃO',
    '2026-12-01', NULL, 0, 'Em andamento', 'legado_lovable', '44acf186-76b5-478c-8466-55e4ccef243d')
ON CONFLICT (source, source_id) DO NOTHING;

-- NOTA DE INTEGRIDADE (mantida de propósito, não corrigida no seed):
-- o registro f5fcd710... tem data_saida (2026-11-11) ANTERIOR à data_entrada
-- (2026-11-20). A constraint chk_datas da migration 001 bloqueia isso em
-- qualquer INSERT/UPDATE futuro; este seed usa dados históricos tal como
-- estavam na fonte, então o valor é ajustado para respeitar a constraint
-- (ver linha abaixo) e o caso fica registrado aqui como achado, não escondido.
UPDATE maintenance_records
   SET data_saida = data_entrada
 WHERE source_id = 'f5fcd710-2786-497a-8c7d-0528301ad482'
   AND data_saida < data_entrada;

-- ===================== Snapshots reais da frota (fonte: legado_lovable) =====================

INSERT INTO fleet_snapshots (snapshot_date, base, total, by_status, by_type, by_locadora, source, source_id) VALUES
  ('2026-11-20','SMG5', 4,  '{"Ativa":3,"Sem cooperado":1}', '{"Utilitário":4}', '{"MOVIDA":4}', 'legado_lovable', 'b315f928-1abd-463d-97a6-f88d7f77aa7c'),
  ('2026-11-20','SMG9', 322,'{"Ativa":322}', '{"VUC":31,"Passeio":42,"Utilitário":249}', '{"NÃO INFORMADA":322}', 'legado_lovable', '0ebfabb5-bcaf-465a-ab4c-6735c2ec6d7b'),
  ('2026-11-20','SMG11',10, '{"Ativa":10}', '{"VUC":1,"Utilitário":9}', '{"NÃO INFORMADA":10}', 'legado_lovable', '967cbb5c-2201-4201-a214-f740e6ace665'),
  ('2026-11-20','SMG3', 38, '{"Ativa":23,"Manutenção":4,"Desmobilizado":9,"Sem cooperado":2}', '{"Utilitário":38}', '{"LOCALIZA":38}', 'legado_lovable', '49ddb4ef-8d32-4ee3-93b5-9d3788d30acd'),
  ('2026-11-20','SMG6', 302,'{"Ativa":302}', '{"VUC":42,"Passeio":13,"Utilitário":247}', '{"NÃO INFORMADA":302}', 'legado_lovable', 'e1f4bc41-a655-4810-8e2f-b73d8c974210'),
  ('2026-11-21','SMG3', 38, '{"Ativa":23,"Manutenção":4,"Desmobilizado":9,"Sem cooperado":2}', '{"Utilitário":38}', '{"LOCALIZA":38}', 'legado_lovable', 'c42a9395-dd5a-496d-8910-9ce30c1bd38c'),
  ('2026-11-21','SMG5', 4,  '{"Ativa":3,"Sem cooperado":1}', '{"Utilitário":4}', '{"MOVIDA":4}', 'legado_lovable', 'b7002b0e-2e9d-4566-a03b-d07320d5e555'),
  ('2026-11-22','SMG3', 38, '{"Ativa":23,"Manutenção":4,"Desmobilizado":9,"Sem cooperado":2}', '{"Utilitário":38}', '{"LOCALIZA":38}', 'legado_lovable', 'd551f7a1-a9ad-492e-bf97-649017b22a09'),
  ('2026-11-22','SMG5', 4,  '{"Ativa":3,"Sem cooperado":1}', '{"Utilitário":4}', '{"MOVIDA":4}', 'legado_lovable', 'b74278e3-ba5f-46b1-8eda-9df8bb8fda6f'),
  ('2026-11-23','SMG5', 4,  '{"Ativa":3,"Sem cooperado":1}', '{"Utilitário":4}', '{"MOVIDA":4}', 'legado_lovable', 'f5fe4c50-fcc5-4830-8fe6-864b356ca892'),
  ('2026-11-23','SMG3', 38, '{"Ativa":23,"Manutenção":4,"Desmobilizado":9,"Sem cooperado":2}', '{"Utilitário":38}', '{"LOCALIZA":38}', 'legado_lovable', '195f0d4d-0734-46d8-b924-a17d6ccdfd72'),
  ('2026-11-24','SMG3', 38, '{"Ativa":23,"Manutenção":4,"Desmobilizado":9,"Sem cooperado":2}', '{"Utilitário":38}', '{"LOCALIZA":38}', 'legado_lovable', 'ae1149b5-9dd8-4abe-98a2-6ff3ab1b2de2'),
  ('2026-11-24','SMG5', 4,  '{"Ativa":3,"Sem cooperado":1}', '{"Utilitário":4}', '{"MOVIDA":4}', 'legado_lovable', '245325b7-8327-4320-a22b-83df8e72d0d6')
ON CONFLICT (snapshot_date, base, source) DO NOTHING;

-- ===================== Checklist reais da VEC (amostra de 24/11/2026) =====================

INSERT INTO checklist_events
  (placa, tipo_formulario, data_hora, unidade, chassi, usuario_vec, num_falhas, svc, transportadora, rentadora, subregiao, source, source_id)
VALUES
  ('SIA6C49','CHECKLIST QUINZENAL 2.0','2026-11-24 10:14:00-03','SRS10 - Lajeado','9362651XAP9224096','SRS10, BASE RODACOOP',0,'SRS10','RodaCoop','Dedicado','SUL (SC/RS)','vec','768094'),
  ('SHY3G08','CHECKLIST QUINZENAL 2.0','2026-11-24 10:12:00-03','SRS10 - Lajeado','9BD2651PAR9238624','SRS10, BASE RODACOOP',0,'SRS10','RodaCoop','Dedicado','SUL (SC/RS)','vec','768091'),
  ('TYD8G10','CHECKLIST QUINZENAL 2.0','2026-11-24 10:06:00-03',NULL,'9BD2651PFT9321162','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','Localiza','NOCO','vec','768080'),
  ('UCN5I20','CHECKLIST QUINZENAL 2.0','2026-11-24 10:05:00-03','SGO1 - Goiânia','95355FTE1VR021469','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','LM','NOCO','vec','768079'),
  ('TZU9E25','CHECKLIST QUINZENAL 2.0','2026-11-24 10:04:00-03','SGO1 - Goiânia','95355FTE6VR017109','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','LM','NOCO','vec','768074'),
  ('TZU9E25','CHECKLIST QUINZENAL 2.0','2026-11-24 10:03:00-03','SGO1 - Goiânia','95355FTE6VR017109','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','LM','NOCO','vec','768073'),
  ('UCM6F92','CHECKLIST QUINZENAL 2.0','2026-11-24 10:02:00-03','SGO1 - Goiânia','95355FTE1VR023206','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','LM','NOCO','vec','768068'),
  ('UCM6C06','CHECKLIST QUINZENAL 2.0','2026-11-24 10:00:00-03','SGO1 - Goiânia','95355FTE5VR023368','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','LM','NOCO','vec','768064'),
  ('RNJ9C43','CHECKLIST QUINZENAL 2.0','2026-11-24 09:59:00-03','SGO1 - Goiânia','93YMAFEXANJ007954','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','Localiza','NOCO','vec','768055'),
  ('TXP9H55','CHECKLIST QUINZENAL 2.0','2026-11-24 09:58:00-03','SGO1 - Goiânia','93ZC635BZT8216007','SGO1, BASE RODACOOP',0,'SGO1','RodaCoop','VAMOS','NOCO','vec','768053')
ON CONFLICT (source, source_id) DO NOTHING;

-- Observação sobre TZU9E25: duas inspeções reais com 1 minuto de diferença
-- (768073 e 768074) — achado de possível duplicidade/reenvio, mantido como
-- está na fonte (ver PRD, M1, achado C4/placa duplicada).
