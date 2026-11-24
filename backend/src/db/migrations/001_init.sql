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
  -- leitor: consulta; motorista: acesso restrito ao próprio veículo, só para
  -- reportar ocorrências (ver tabela "occurrences" e RLS em 002_rls.sql).
  role          text NOT NULL CHECK (role IN ('superadmin', 'admin', 'gestor_base', 'leitor', 'motorista')),
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
  nome        text NOT NULL,
  documento   text, -- CPF, quando informado
  cnh         text, -- número da CNH, quando informado
  telefone    text,
  -- Login próprio do motorista (papel 'motorista' em users), opcional: um
  -- motorista pode existir só como registro (vindo da VEC, por exemplo) sem
  -- nunca ter acessado o sistema.
  user_id     uuid UNIQUE REFERENCES users(id),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Veículo que o motorista dirige hoje. Histórico de trocas fica em
-- vehicle_driver_history (abaixo) — importante para apurar quem dirigia o
-- veículo na data de um sinistro ou acidente relatado depois.
ALTER TABLE vehicles ADD COLUMN motorista_atual_id uuid REFERENCES drivers(id);

CREATE TABLE vehicle_driver_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  uuid NOT NULL REFERENCES vehicles(id),
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  inicio      timestamptz NOT NULL DEFAULT now(),
  fim         timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_periodo CHECK (fim IS NULL OR fim >= inicio)
);

CREATE INDEX idx_vdh_vehicle ON vehicle_driver_history(vehicle_id, inicio);

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

-- ===================== Ocorrências reportadas (motorista) =====================
-- O que o motorista relata do campo: pedido de manutenção, sinistro, avaria,
-- acidente, multa ou outro. Uma ocorrência pode, depois, originar um
-- registro em maintenance_records (campo maintenance_id) — a ocorrência em
-- si nunca é apagada, só ligada ao registro que resolveu o caso.

CREATE TABLE occurrences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid NOT NULL REFERENCES vehicles(id),
  driver_id      uuid REFERENCES drivers(id), -- quem relatou (nulo se um admin registrou em nome do motorista)
  tipo           text NOT NULL CHECK (tipo IN (
                   'manutencao_solicitada', 'sinistro', 'avaria', 'acidente', 'multa', 'outro'
                 )),
  descricao      text NOT NULL,
  local          text, -- endereço ou referência livre de onde ocorreu
  data_hora      timestamptz NOT NULL DEFAULT now(),
  -- Espaço para anexos (fotos do dano, boletim de ocorrência, notificação de
  -- multa) quando o upload de arquivos for implementado; fica pronto desde já
  -- para não exigir outra migration só por causa disso.
  anexos         jsonb NOT NULL DEFAULT '[]'::jsonb,

  status         text NOT NULL DEFAULT 'aberta'
                 CHECK (status IN ('aberta', 'em_analise', 'aprovada', 'rejeitada', 'resolvida')),
  maintenance_id uuid REFERENCES maintenance_records(id),
  resolved_by    uuid REFERENCES users(id),
  resolved_at    timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_resolucao CHECK (
    (status IN ('resolvida', 'rejeitada')) = (resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_occurrences_vehicle ON occurrences(vehicle_id, data_hora DESC);
CREATE INDEX idx_occurrences_status ON occurrences(status);
CREATE INDEX idx_occurrences_driver ON occurrences(driver_id);

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
