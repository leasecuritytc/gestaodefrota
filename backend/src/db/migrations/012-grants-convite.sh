#!/bin/bash
# GRANTs das funções de convite/recuperação de senha, criadas em
# 011_convite_e_recuperacao_senha.sql. Precisam ficar num arquivo que rode
# DEPOIS da 011 (o Postgres executa /docker-entrypoint-initdb.d em ordem
# alfabética) — por isso "012-" e não dentro de 005-grants.sh, que roda
# antes dessas funções existirem.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER não definido}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  GRANT EXECUTE ON FUNCTION criar_token_usuario(uuid, text, text, timestamptz) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION consumir_token_usuario(text, text) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION definir_senha_usuario(uuid, text, text, boolean) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION localizar_usuario_para_recuperacao(text) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION auth_lookup_user_por_id(uuid) TO "${APP_DB_USER}";
EOSQL
