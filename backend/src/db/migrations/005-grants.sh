#!/bin/bash
# Concede ao usuário de aplicação (não-superusuário) só o necessário para
# rodar a API. Ele não é dono das tabelas, então fica sujeito às políticas
# de RLS criadas em 002_rls.sql.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER não definido}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  GRANT USAGE ON SCHEMA public TO "${APP_DB_USER}";
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_DB_USER}";
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION criar_token_usuario(uuid, text, text, timestamptz) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION consumir_token_usuario(text, text) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION definir_senha_usuario(uuid, text, text, boolean) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION localizar_usuario_para_recuperacao(text) TO "${APP_DB_USER}";
  GRANT EXECUTE ON FUNCTION auth_lookup_user_por_id(uuid) TO "${APP_DB_USER}";
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
EOSQL
