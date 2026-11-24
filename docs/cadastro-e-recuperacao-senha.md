# Cadastro de usuários e recuperação de senha

## A regra, resumida

1. **Só superadmin cria admin** (ou outro superadmin). Admin cria
   gestor_base, leitor e motorista — nunca outro admin. Essa hierarquia já
   existia (`podeCriarPapel` em `users.routes.ts`); não mudou agora.
2. **Quem cria o usuário nunca define a senha dele.** `POST /api/users` não
   tem mais campo de senha — ao criar, a API gera um link de ativação de
   uso único (válido por 7 dias) e devolve esse link na resposta (e tenta
   mandar por e-mail, se o SMTP estiver configurado). A pessoa convidada
   abre o link, define a própria senha e opcionalmente informa um e-mail
   de recuperação alternativo.
3. **Esqueceu a senha:** `POST /api/auth/esqueci-senha` com o e-mail, gera
   outro link de uso único (válido por 1 hora), mandado por e-mail. Nunca
   revela se aquele e-mail tem conta ou não (mesma resposta nos dois casos)
   — evita que alguém de fora descubra quem usa a plataforma só testando
   e-mails.

## Por que assim, e não de outro jeito

**Por que não o superadmin/admin escolhe a senha do novo usuário e manda
por WhatsApp/e-mail?** Porque aí a senha circula em texto puro por um canal
que não é a plataforma (e-mail pode ser encaminhado, WhatsApp pode ser lido
por quem empresta o celular), e o criador passa a "saber" a senha de quem
ele cadastrou — ruim para os dois lados. O link de ativação resolve isso:
só prova posse de quem tem acesso à caixa de e-mail, e a senha em si nunca
trafega fora do navegador de quem está ativando.

**Por que não "perguntas de segurança" (nome do primeiro animal, etc.)?**
É um padrão considerado fraco hoje em dia — a resposta costuma ser
pesquisável (rede social, registro público) ou fácil de adivinhar, e vira
mais uma coisa pra decorar. Um link de uso único por e-mail é o padrão
atual (é o que Google, bancos, etc. usam) e não depende de a pessoa lembrar
uma resposta de anos atrás.

**Por que o link expira (7 dias convite, 1 hora redefinição)?** Prazos
diferentes porque os riscos são diferentes: um convite parado na caixa de
entrada por alguns dias não é tão grave (a conta ainda não existe de
verdade, não tem nada pra proteger além do e-mail); já um link de
redefinição de senha dá acesso a uma conta JÁ EXISTENTE — por isso o prazo
curto, pra reduzir a janela se o e-mail de alguém for comprometido depois
que o link foi gerado mas antes de ser usado.

**Por que o token nunca aparece na resposta de "esqueci minha senha", só
no convite?** `POST /api/users` é uma rota autenticada, só superadmin/admin
chamam — devolver o link ali é seguro e necessário (é assim que o link
chega em quem está sendo cadastrado, direto ou repassado). Já
`POST /api/auth/esqueci-senha` é pública, qualquer um pode chamar com
qualquer e-mail — se devolvesse o link na resposta, qualquer um descobriria
instantaneamente quais e-mails têm conta (e teria o link pra invadir, sem
nunca ter acesso real àquela caixa de entrada). Por isso ali o link só vai
por e-mail (ou aparece no log do servidor, enquanto o SMTP não estiver
configurado — ver README).

## O que NÃO está implementado ainda (de propósito, fora do escopo de agora)

- **Rate limiting** em `/auth/login`, `/auth/esqueci-senha` e
  `/auth/ativar-conta` — hoje nada impede uma tentativa repetida em
  sequência (tentar várias senhas, ou pedir redefinição várias vezes
  seguidas). Para uma plataforma pequena/interna isso é um risco menor, mas
  antes de expor a API publicamente na internet (o domínio já é público),
  vale adicionar um limitador (ex.: `express-rate-limit`) nessas três
  rotas. Avise quando quiser que eu faça isso.
- **Autenticação de dois fatores (2FA)** — não pedida ainda; se quiser mais
  à frente, o campo `telefone` já existe para motorista e pode ser
  estendido aos outros papéis como base para um código por SMS.
- **Confirmação de troca de e-mail de recuperação** — hoje
  `email_recuperacao` é salvo direto na ativação, sem confirmar que aquele
  segundo e-mail existe de verdade. Se isso importar, dá pra adicionar
  depois o mesmo mecanismo de link de confirmação.
