-- Retratos do BSC (Looker Studio "2.0 SRM - BSC Supplier"), coletados por um
-- script que roda no computador do dono do acesso (ver tools/bsc-coletor).
CREATE TABLE IF NOT EXISTS bsc_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  pagina        TEXT        NOT NULL,
  coletado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  linhas        JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- blocos de texto visíveis, na ordem da tela
  tabelas       JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- tabelas detectadas (matriz de células)
  numeros       JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- pares rótulo/valor numéricos detectados
  hash          TEXT        NOT NULL,
  origem        TEXT        NOT NULL DEFAULT 'coletor'
);
CREATE INDEX IF NOT EXISTS bsc_snapshots_pagina_idx ON bsc_snapshots (pagina, coletado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bsc_snapshots_hash_uq ON bsc_snapshots (pagina, hash);

ALTER TABLE bsc_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY bsc_snapshots_select ON bsc_snapshots FOR SELECT USING (is_privileged_role());
CREATE POLICY bsc_snapshots_insert ON bsc_snapshots FOR INSERT WITH CHECK (is_privileged_role());
