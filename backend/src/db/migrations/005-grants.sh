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
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
EOSQL
