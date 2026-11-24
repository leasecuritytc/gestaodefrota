-- Cadastro de novos usuários por convite (nunca superadmin/admin definindo a
-- senha de outra pessoa) + "esqueci minha senha", pelo mesmo mecanismo: um
-- token de uso único, de posse apenas de quem recebeu o e-mail/link.
--
-- Por que não "perguntas de segurança": são um padrão fraco (resposta
-- geralmente pesquisável ou adivinhável) — preferimos um link de uso único
-- por e-mail, que é o padrão atual. Ver docs/cadastro-e-recuperacao-senha.md
-- para a decisão completa e as alternativas consideradas.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmado boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ativado_em timestamptz;
-- E-mail alternativo de recuperação, opcional — se não informado no
-- cadastro/ativação, a recuperação de senha usa o e-mail de login mesmo
-- (comportamento padrão, sem fricção extra).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_recuperacao text;

-- Um só tipo de token para dois usos (convite de ativação e redefinição de
-- senha) — mesma estrutura, prazos de validade diferentes.
CREATE TABLE user_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  tipo        text NOT NULL CHECK (tipo IN ('convite', 'redefinicao_senha')),
  -- Nunca guardamos o token em texto puro — só o hash (sha256). Mesmo que o
  -- banco vaze, não dá pra reconstruir o token original a partir do hash.
  token_hash  text NOT NULL,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_user_tokens_hash ON user_tokens(token_hash);
CREATE INDEX idx_user_tokens_user_tipo ON user_tokens(user_id, tipo);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
-- Nenhuma política criada de propósito: RLS ativado sem política nega TUDO
-- para o papel de aplicação (gdf_app) em consulta direta. O único acesso a
-- esta tabela é pelas funções SECURITY DEFINER abaixo, que rodam com o
-- privilégio de quem as criou (gdf_admin, superusuário) e por isso
-- ignoram RLS — mesma lógica de auth_lookup_user em 004_auth_lookup.sql.
-- Isso é intencional: nem o próprio backend consegue fazer
-- "SELECT * FROM user_tokens" por engano, só passar pelas funções abaixo.

-- Cria um token (convite ou redefinição). Chamada dentro de uma transação
-- já autenticada (quem está convidando é superadmin/admin), mas colocada
-- aqui como função para manter o mesmo padrão das outras duas abaixo.
CREATE OR REPLACE FUNCTION criar_token_usuario(
  p_user_id uuid, p_tipo text, p_token_hash text, p_expira_em timestamptz
) RETURNS void
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  INSERT INTO user_tokens (user_id, tipo, token_hash, expira_em)
  VALUES (p_user_id, p_tipo, p_token_hash, p_expira_em);
$$;
REVOKE ALL ON FUNCTION criar_token_usuario(uuid, text, text, timestamptz) FROM PUBLIC;

-- Valida e CONSOME o token atomicamente (marca usado_em na mesma operação
-- que verifica validade) — evita que o mesmo token seja usado duas vezes
-- por uma corrida de requisições simultâneas. Devolve o user_id se válido,
-- NULL se não existe, já foi usado, ou expirou (a API nunca distingue qual
-- desses três casos na resposta, para não dar pista a quem está tentando
-- adivinhar um token).
CREATE OR REPLACE FUNCTION consumir_token_usuario(p_token_hash text, p_tipo text)
RETURNS uuid
SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE user_tokens
  SET usado_em = now()
  WHERE token_hash = p_token_hash
    AND tipo = p_tipo
    AND usado_em IS NULL
    AND expira_em > now()
  RETURNING user_id INTO v_user_id;
  RETURN v_user_id;
END;
$$;
REVOKE ALL ON FUNCTION consumir_token_usuario(text, text) FROM PUBLIC;

-- Define a senha (ativação inicial ou redefinição) depois que o token já
-- foi consumido com sucesso pela função acima, na mesma transação.
CREATE OR REPLACE FUNCTION definir_senha_usuario(
  p_user_id uuid, p_password_hash text, p_email_recuperacao text, p_ativar boolean
) RETURNS void
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  UPDATE users
  SET password_hash     = p_password_hash,
      email_confirmado  = true,
      email_recuperacao = COALESCE(p_email_recuperacao, email_recuperacao),
      ativado_em        = CASE WHEN p_ativar THEN now() ELSE ativado_em END
  WHERE id = p_user_id;
$$;
REVOKE ALL ON FUNCTION definir_senha_usuario(uuid, text, text, boolean) FROM PUBLIC;

-- "Esqueci minha senha": localizar o usuário pelo e-mail de login OU pelo
-- e-mail de recuperação, sem nunca expor password_hash nem nenhum outro
-- dado além do estritamente necessário para decidir se um token deve ser
-- gerado e para onde mandar o e-mail.
CREATE OR REPLACE FUNCTION localizar_usuario_para_recuperacao(p_email text)
RETURNS TABLE (id uuid, email text, email_recuperacao text, active boolean, ativado_em timestamptz)
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  SELECT id, email, email_recuperacao, active, ativado_em
  FROM users
  WHERE email = p_email OR email_recuperacao = p_email;
$$;
REVOKE ALL ON FUNCTION localizar_usuario_para_recuperacao(text) FROM PUBLIC;

-- Usada só para o login automático logo após ativar a conta (devolve o
-- mínimo pra montar o JWT, nunca password_hash) — mesma lógica de
-- auth_lookup_user, por id em vez de e-mail.
CREATE OR REPLACE FUNCTION auth_lookup_user_por_id(p_id uuid)
RETURNS TABLE (id uuid, email text, role text)
SECURITY DEFINER SET search_path = public LANGUAGE sql AS $$
  SELECT id, email, role FROM users WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION auth_lookup_user_por_id(uuid) FROM PUBLIC;
