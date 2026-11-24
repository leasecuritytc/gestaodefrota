#!/bin/bash
# Roda uma única vez, na primeira inicialização do volume do Postgres.
# Cria o usuário de aplicação (sem privilégio de superusuário), separado do
# usuário administrativo (POSTGRES_USER) que só é usado para migrations.
set -euo pipefail

: "${APP_DB_USER:?APP_DB_USER não definido}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD não definido}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
        CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
     END IF;
  END
  \$\$;
EOSQL
