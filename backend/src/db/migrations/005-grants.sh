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
  -- As funções de convite/recuperação de senha (criar_token_usuario e
  -- companhia) só existem a partir de 011_convite_e_recuperacao_senha.sql,
  -- que roda DEPOIS deste script (o Postgres executa /docker-entrypoint-initdb.d
  -- em ordem alfabética, e "005-" vem antes de "011_"). Concedê-las aqui
  -- quebraria a inicialização do zero com "function ... does not exist".
  -- Por isso o GRANT dessas 5 funções fica dentro da própria 011, logo
  -- depois de criá-las — não aqui.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
EOSQL
