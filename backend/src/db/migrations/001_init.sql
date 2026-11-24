-- Modelo canônico da GESTÃO DE FROTA
-- Cada fonte externa (planilha, VEC, BSC/Mercado Livre) entra por um adaptador
-- e grava aqui com rastreabilidade de origem (source, source_id, ingested_at).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===================== Usuários e papéis =====================

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  -- superadmin: dono/desenvolvedor do projeto (papel de praxe em todo projeto
  -- seu); admin: administração da operação; gestor_base: gestão de uma base;
  -- leitor: consulta.
  role          text NOT NULL CHECK (role IN ('superadmin', 'admin', 'gestor_base', 'leitor')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ===================== Veículos =====================

CREATE TABLE vehicles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa         text UNIQUE NOT NULL,
  chassi        text,
  base          text NOT NULL,
  tipo          text,
  rentadora     text,
  transportadora text,
  subregiao     text,
  status        text NOT NULL DEFAULT 'Ativa'
                CHECK (status IN ('Ativa', 'Manutenção', 'Desmobilizado', 'Sem cooperado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_base ON vehicles(base);
CREATE INDEX idx_vehicles_status ON vehicles(status);

-- ===================== Motoristas =====================

CREATE TABLE drivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text,
  documento   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===================== Manutenção =====================

CREATE TABLE maintenance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid REFERENCES vehicles(id),
  placa         text NOT NULL, -- mantido mesmo sem vehicle_id casado ainda
  base          text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('Preventiva', 'Corretiva', 'Outros')),
  descricao     text,
  oficina       text,
  data_entrada  date NOT NULL,
  data_saida    date,
  custo         numeric(12,2) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  status        text NOT NULL CHECK (status IN ('Em andamento', 'Concluída', 'Cancelada')),

  -- rastreabilidade de origem
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'planilha', 'legado_lovable')),
  source_id     text,
  ingested_at   timestamptz NOT NULL DEFAULT now(),

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_datas CHECK (data_saida IS NULL OR data_saida >= data_entrada),
  CONSTRAINT uq_manutencao_origem UNIQUE (source, source_id)
);

CREATE INDEX idx_maintenance_placa ON maintenance_records(placa);
CREATE INDEX idx_maintenance_status ON maintenance_records(status);

-- ===================== Checklist / segurança (VEC) =====================

CREATE TABLE checklist_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid REFERENCES vehicles(id),
  placa           text NOT NULL,
  tipo_formulario text NOT NULL,
  data_hora       timestamptz NOT NULL,
  unidade         text,
  chassi          text,
  usuario_vec     text,
  num_falhas      integer NOT NULL DEFAULT 0,
  svc             text,
  transportadora  text,
  rentadora       text,
  subregiao       text,
  motorista       text,

  source          text NOT NULL DEFAULT 'vec',
  source_id       text NOT NULL, -- ID da inspeção na VEC
  ingested_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_checklist_origem UNIQUE (source, source_id)
);

CREATE INDEX idx_checklist_placa ON checklist_events(placa);
CREATE INDEX idx_checklist_data ON checklist_events(data_hora);

-- ===================== Telemetria / desempenho (BSC / Mercado Livre) =====================
-- Observação: até a API do Mercado Livre ser confirmada, esta tabela fica
-- pronta para receber agregados diários (odômetro, posição, indicadores de
-- scorecard), nunca o fluxo bruto completo (ver M0, decisão D5).

CREATE TABLE telemetry_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid REFERENCES vehicles(id),
  placa         text NOT NULL,
  data_evento   date NOT NULL,
  metrica       text NOT NULL, -- ex.: 'odometro_km', 'score_safety', 'indicador_bsc'
  valor         numeric,
  payload       jsonb,

  source        text NOT NULL DEFAULT 'bsc',
  source_id     text,
  ingested_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_telemetria_origem UNIQUE (source, source_id, metrica, data_evento)
);

CREATE INDEX idx_telemetry_placa_data ON telemetry_events(placa, data_evento);

-- ===================== Snapshots agregados da frota (migrados da plataforma atual) =====================

CREATE TABLE fleet_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date NOT NULL,
  base            text NOT NULL,
  total           integer NOT NULL,
  by_status       jsonb,
  by_type         jsonb,
  by_locadora     jsonb,

  source          text NOT NULL DEFAULT 'legado_lovable',
  source_id       text,
  ingested_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_snapshot_origem UNIQUE (snapshot_date, base, source)
);

-- ===================== Auditoria =====================

CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id),
  acao        text NOT NULL,
  entidade    text NOT NULL,
  entidade_id text,
  detalhes    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
