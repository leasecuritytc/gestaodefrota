-- Cadastro de bases (unidades operacionais, ex.: SMG3 - Pouso Alegre, SMG5 -
-- Frota Locada). Até aqui "base" era só um texto livre na própria tabela
-- vehicles (ver 001_init.sql); isso funcionava para os dados importados da
-- planilha, mas não dava um lugar único para administrar a lista de bases
-- válidas. Esta tabela NÃO substitui vehicles.base (mantido como texto, para
-- não arriscar nenhuma linha existente) — ela é o registro canônico que a
-- API e o frontend passam a usar para alimentar os seletores de "base" e
-- para controlar quem pode criar/editar/desativar uma base.
--
-- Decisão do dono do projeto (24/11/2026): cadastro de base é função só de
-- admin e superadmin — ninguém mais cria ou altera uma base.

CREATE TABLE bases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text UNIQUE NOT NULL, -- ex.: 'SMG3', 'SMG5' — é o mesmo valor usado em vehicles.base
  nome        text NOT NULL,        -- ex.: 'SMG3 - Pouso Alegre'
  cidade      text,
  estado      text,                 -- UF, 2 letras, quando informado
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bases_ativa ON bases(ativa);

ALTER TABLE bases ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer papel de escritório (staff). Motorista não precisa
-- enxergar o cadastro de bases em si.
CREATE POLICY bases_select_staff ON bases FOR SELECT USING (is_staff_role());

-- Escrita: só admin/superadmin (is_privileged_role(), já definida em
-- 002_rls.sql). Isso é defesa em profundidade — a rota da API (bases.routes.ts)
-- já exige requireRole("superadmin", "admin") antes de chegar aqui.
CREATE POLICY bases_write ON bases FOR INSERT WITH CHECK (is_privileged_role());
CREATE POLICY bases_update ON bases FOR UPDATE USING (is_privileged_role());
CREATE POLICY bases_delete ON bases FOR DELETE USING (is_privileged_role());

-- Semeia o cadastro com as bases que já aparecem nos veículos existentes,
-- para o cadastro nascer consistente com os dados reais (SMG3, SMG5 etc.),
-- em vez de começar vazio e obrigar um recadastro manual do que já existe.
INSERT INTO bases (codigo, nome)
SELECT DISTINCT base, base FROM vehicles
ON CONFLICT (codigo) DO NOTHING;
