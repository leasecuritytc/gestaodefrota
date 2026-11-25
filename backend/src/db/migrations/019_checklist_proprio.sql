-- Checklist PRÓPRIO da plataforma (inspeção quinzenal dos veículos das bases do
-- escopo). Independente da VEC: a VEC continua só para consulta
-- (checklist_events). Fotos ficam no próprio banco (bytea), assim entram no
-- pg_dump/backup e não exigem pasta de upload nem volume novo no Docker.

CREATE TABLE checklist_itens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria  text NOT NULL,
  texto      text NOT NULL,
  critico    boolean NOT NULL DEFAULT false,
  ordem      integer NOT NULL,
  ativo      boolean NOT NULL DEFAULT true
);

CREATE TABLE checklist_execucoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id),
  base          text NOT NULL,
  executado_por uuid REFERENCES users(id),
  data_ref      date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  data_hora     timestamptz NOT NULL DEFAULT now(),
  km            numeric,
  status        text NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho', 'Concluido')),
  num_falhas    integer NOT NULL DEFAULT 0,
  observacoes   text,
  ocorrencia_id uuid REFERENCES occurrences(id),
  concluido_em  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_checklist_exec_dia UNIQUE (vehicle_id, data_ref)
);
CREATE INDEX idx_chk_exec_base_data ON checklist_execucoes(base, data_hora DESC);

CREATE TABLE checklist_respostas (
  execucao_id uuid NOT NULL REFERENCES checklist_execucoes(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES checklist_itens(id),
  resultado   text NOT NULL CHECK (resultado IN ('OK', 'FALHA', 'NA')),
  observacao  text,
  PRIMARY KEY (execucao_id, item_id)
);

CREATE TABLE checklist_fotos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL REFERENCES checklist_execucoes(id) ON DELETE CASCADE,
  item_id     uuid REFERENCES checklist_itens(id),
  mime        text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  tamanho     integer NOT NULL,
  dados       bytea NOT NULL,
  enviado_por uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chk_fotos_exec ON checklist_fotos(execucao_id);

ALTER TABLE checklist_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_fotos ENABLE ROW LEVEL SECURITY;

-- Leitura: toda a equipe (exceto motorista). Itens: só privilegiado edita.
CREATE POLICY chk_itens_select ON checklist_itens FOR SELECT USING (is_staff_role());
CREATE POLICY chk_itens_write  ON checklist_itens FOR ALL USING (is_privileged_role()) WITH CHECK (is_privileged_role());

CREATE POLICY chk_exec_select ON checklist_execucoes FOR SELECT USING (is_staff_role());
CREATE POLICY chk_exec_insert ON checklist_execucoes FOR INSERT
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));
-- Concluído é imutável: só rascunho pode ser alterado (ou admin, para corrigir).
CREATE POLICY chk_exec_update ON checklist_execucoes FOR UPDATE
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base') AND (status = 'Rascunho' OR is_privileged_role()));
CREATE POLICY chk_exec_delete ON checklist_execucoes FOR DELETE USING (is_privileged_role());

CREATE POLICY chk_resp_select ON checklist_respostas FOR SELECT USING (is_staff_role());
CREATE POLICY chk_resp_write ON checklist_respostas FOR ALL
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'))
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));

CREATE POLICY chk_fotos_select ON checklist_fotos FOR SELECT USING (is_staff_role());
CREATE POLICY chk_fotos_write ON checklist_fotos FOR ALL
  USING (current_app_role() IN ('superadmin', 'admin', 'gestor_base'))
  WITH CHECK (current_app_role() IN ('superadmin', 'admin', 'gestor_base'));

GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_itens, checklist_execucoes, checklist_respostas, checklist_fotos TO gdf_app;

-- Itens padrão (28). Podem ser ajustados depois por admin/superadmin.
INSERT INTO checklist_itens (categoria, texto, critico, ordem) VALUES
 ('Documentos', 'CRLV em dia e a bordo', false, 1),
 ('Documentos', 'Seguro e licenciamento em dia', false, 2),
 ('Documentos', 'Documento do condutor (CNH) válido', false, 3),
 ('Pneus', 'Calibragem dos pneus', false, 4),
 ('Pneus', 'Desgaste e sulcos dos pneus', true, 5),
 ('Pneus', 'Estepe em bom estado', false, 6),
 ('Pneus', 'Macaco e chave de roda', false, 7),
 ('Freios', 'Freio de serviço (pedal)', true, 8),
 ('Freios', 'Freio de estacionamento', true, 9),
 ('Freios', 'Suspensão sem folgas ou ruídos', false, 10),
 ('Luzes', 'Faróis baixo e alto', false, 11),
 ('Luzes', 'Lanternas e luz de freio', true, 12),
 ('Luzes', 'Setas e pisca-alerta', false, 13),
 ('Luzes', 'Luz de ré', false, 14),
 ('Fluidos', 'Nível do óleo do motor', false, 15),
 ('Fluidos', 'Água do radiador / arrefecimento', false, 16),
 ('Fluidos', 'Fluido de freio', true, 17),
 ('Fluidos', 'Limpador e água do para-brisa', false, 18),
 ('Carroceria', 'Avarias, amassados e riscos', false, 19),
 ('Carroceria', 'Para-brisa e retrovisores', true, 20),
 ('Carroceria', 'Portas, travas e baú/carga', false, 21),
 ('Segurança', 'Extintor no prazo', true, 22),
 ('Segurança', 'Triângulo de sinalização', false, 23),
 ('Segurança', 'Cintos de segurança', true, 24),
 ('Segurança', 'Buzina', false, 25),
 ('Interior', 'Painel sem luzes de alerta', true, 26),
 ('Interior', 'Limpeza interna', false, 27),
 ('Interior', 'Ar-condicionado / ventilação', false, 28);
