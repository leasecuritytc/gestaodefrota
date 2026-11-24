# GESTÃO DE FROTA

Plataforma de controle e manutenção de veículos da RodaCoop, com integração
planejada às plataformas do cliente (VEC — checklist/segurança — e BSC/API
do Mercado Livre — desempenho). Reconstrução a partir do zero, isolada na
mesma VPS que hospeda o LicitaHelp e o Security3c, sem nenhuma dependência
entre eles.

## Por que a arquitetura é esta

- **Docker, não instalação direta no sistema.** Banco e API rodam em
  containers próprios, numa rede Docker isolada (`gdf_net`). Nenhuma porta de
  banco fica exposta ao host; só a API escuta em `127.0.0.1:4001`, e só o
  Nginx do sistema fala com a internet. Um erro aqui não derruba o
  LicitaHelp nem o Security3c.
- **Portátil.** Para mudar de VPS no futuro: copiar esta pasta, ajustar o
  `.env`, rodar `docker compose up -d` na máquina nova. Sem passo manual
  escondido.
- **Dois usuários de banco.** `gdf_admin` (superusuário, só usado para rodar
  as migrations) e `gdf_app` (sem privilégio de superusuário, é quem a API
  usa). Isso importa porque um superusuário **ignora RLS** — se a API
  conectasse como `gdf_admin`, a segurança por linha (Row Level Security)
  seria só decoração.
- **RLS como segunda camada**, além da checagem de papel (admin / gestor_base
  / leitor) feita no código da API. Mesmo que uma rota tenha um bug de
  autorização, o banco ainda nega a linha errada.
- **Dados reais, nunca inventados.** O seed em
  `backend/src/db/migrations/003_seed_dados_reais.sql` traz só o que foi
  coletado de verdade em 24/11/2026: as 12 manutenções e 13 snapshots lidos
  no banco público da plataforma atual, e 10 inspeções reais lidas na VEC.
  Os adaptadores de VEC e BSC/Mercado Livre (`backend/src/adapters/`) não
  geram nenhum dado até existir credencial oficial de API — eles respondem
  explicando o que falta, em vez de simular.

## Achado resolvido: "42 veículos" é uma base, não a frota nacional

O painel atual mostra "42 veículos". A planilha de campo real da base SMG3
(Pouso Alegre/MG) + SMG5 (Frota Locada), importada nas migrations `007` e
`008`, confirma: **42 é exatamente o total dessas duas bases** (38 + 4). O
"600+" vem da soma de todas as bases do país nos snapshots legados (SMG9 com
322, SMG11 com 10, SGO1, SRS10 etc.). Os dois números estavam certos — um é
uma base, o outro é a frota inteira. Detalhes em
[`docs/base-smg3-pouso-alegre.md`](docs/base-smg3-pouso-alegre.md). Para a
apresentação à RodaCoop, o dashboard deve sempre dizer qual recorte está
mostrando (base específica vs. total nacional), nunca um número solto.

## Estrutura

```
backend/            API (Node.js + TypeScript + Express + PostgreSQL)
  src/db/migrations/ Migrations em ordem (números e letras definem a ordem)
  src/adapters/      Pontes para VEC e BSC/Mercado Livre (hoje desativadas)
  src/routes/        Rotas HTTP
nginx/               Bloco Nginx pronto para este domínio
docs/                Documentação do projeto
  base-smg3-pouso-alegre.md  Análise da planilha de campo real (base SMG3/SMG5)
  fontes/            Arquivos originais recebidos (planilhas etc.), nunca editados —
                      preservados para auditoria, igual ao padrão de rastreabilidade
                      do banco (colunas source/source_id)
assets/              Identidade visual da plataforma (não é código nem dado de banco)
  images/            Imagens de fundo, banners, fotos de referência
  icons/             Ícones e logo oficial (reservado — ainda sem arquivo)
docker-compose.yml   Orquestração isolada (rede e volume próprios)
.env.example         Modelo de variáveis — copiar para .env e preencher
```

## Deploy na VPS (primeira vez)

Rodar como `root`, dentro da pasta onde o projeto for clonado
(sugestão: `/var/www/gestaodefrota`).

### 1. Clonar o repositório

```bash
mkdir -p /var/www/gestaodefrota
cd /var/www/gestaodefrota
git clone https://github.com/leasecuritytc/gestaodefrota.git .
```

Se pedir usuário/senha do GitHub, use um Personal Access Token no lugar da
senha (o GitHub não aceita mais senha normal em `git clone` por HTTPS).

### 2. Criar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha de verdade (nunca deixe os valores de exemplo):
- `POSTGRES_PASSWORD` e `APP_DB_PASSWORD`: gere duas senhas fortes e
  diferentes, por exemplo com `openssl rand -base64 24`.
- `DATABASE_URL`: troque `TROQUE_POR_SENHA_FORTE_2` pelo mesmo valor que você
  colocou em `APP_DB_PASSWORD`.
- `JWT_SECRET`: gere com `openssl rand -hex 64`.
- `ML_*` e `VEC_*`: deixe em branco até ter as credenciais oficiais — o
  sistema funciona sem elas, só não sincroniza automaticamente.

**Erro comum:** esquecer de usar a mesma senha em `APP_DB_PASSWORD` e dentro
de `DATABASE_URL`. Se isso acontecer, a API sobe mas todo login falha com
erro de autenticação no banco — confira os dois valores se isso ocorrer.

### 3. Subir os containers

```bash
docker compose up -d --build
docker compose logs -f db
```

Aguarde até aparecer `database system is ready to accept connections`. Pare
o acompanhamento com `Ctrl+C` (os containers continuam rodando em segundo
plano).

**Erro comum:** se a pasta `backend/src/db/migrations` já tiver rodado uma
vez num volume antigo, o Postgres **não repete** os scripts de inicialização
num volume que já existe. Se precisar recomeçar do zero (só em ambiente de
teste, nunca em produção com dados reais):
`docker compose down -v` (atenção: `-v` apaga o volume do banco).

### 4. Conferir se a API está de pé

```bash
curl http://127.0.0.1:4001/api/health
```

Deve responder `{"status":"ok"}`. Se der "connection refused", rode
`docker compose ps` e `docker compose logs api` para ver o erro.

### 5. Criar o primeiro usuário (superadmin)

De praxe, todo projeto tem uma hierarquia de papéis: **superadmin** (você,
dono/desenvolvedor) → **admin** (administração da operação) → **gestor_base**
(gestão de uma base) → **leitor** (só consulta). Este passo cria só o
primeiro, o superadmin — os demais são criados depois, já autenticado, por
`POST /api/users` (exige papel `superadmin` ou `admin`; só `superadmin` pode
criar outro `superadmin` ou um `admin`).

```bash
docker compose exec \
  -e ADMIN_EMAIL='seu-email@exemplo.com' \
  -e ADMIN_PASSWORD='uma-senha-forte-de-verdade' \
  -e ADMIN_NAME='Seu Nome' \
  api node dist/scripts/createAdmin.js
```

(Sem precisar passar `ADMIN_ROLE` — o padrão já é `superadmin`.)

**Erro comum:** senha com menos de 12 caracteres é recusada de propósito
pelo script. Use uma senha forte de verdade, não um teste.

### 6. Configurar o Nginx e o domínio

```bash
cp nginx/gestaodefrota.conf /etc/nginx/sites-available/gestaodefrota
ln -s /etc/nginx/sites-available/gestaodefrota /etc/nginx/sites-enabled/
nginx -t
```

Se `nginx -t` acusar erro no certificado (porque ele ainda não existe),
isso é esperado nesta hora — vá para o próximo passo antes de recarregar o
Nginx.

No DNS do domínio `alexander-log.com.br` (no painel do registro.br ou onde
ele estiver apontado), crie os registros:
- `A` → `alexander-log.com.br` → `147.93.11.145`
- `A` → `www.alexander-log.com.br` → `147.93.11.145`

Aguarde a propagação (pode levar de minutos a algumas horas) e confirme com:
```bash
dig +short alexander-log.com.br
```
Deve devolver `147.93.11.145`.

### 7. Emitir o certificado SSL

```bash
certbot --nginx -d alexander-log.com.br -d www.alexander-log.com.br
```

Isso ajusta o bloco automaticamente e recarrega o Nginx. Teste depois:
```bash
curl https://alexander-log.com.br/api/health
```

**Erro comum:** se o certbot falhar dizendo que não alcançou o domínio, o
DNS ainda não propagou — espere e tente de novo.

## Papel motorista e ocorrências de campo

Além da hierarquia de escritório (superadmin/admin/gestor_base/leitor), existe
o papel **motorista**: login próprio, mas de escopo estreito — só enxerga o
veículo que dirige hoje (`vehicles.motorista_atual_id`) e só reporta
ocorrências desse veículo. Isso é garantido em duas camadas: a API confere o
papel, e o banco (RLS) bloqueia mesmo que a API tivesse um bug — testei isso
manualmente (um motorista tentando reportar em veículo de outro recebe
`ERROR: new row violates row-level security policy`, não um 403 da API).

**Criar um motorista** (via `POST /api/users`, autenticado como admin/superadmin):
```json
{
  "email": "motorista@rodacoop.com.br",
  "password": "senha-forte-de-verdade",
  "full_name": "Nome do Motorista",
  "role": "motorista",
  "telefone": "11999990000",
  "documento": "CPF opcional",
  "cnh": "número da CNH, opcional",
  "placa_atual": "TZK0E38"
}
```
Isso cria o usuário, o registro em `drivers` já ligado a ele, e (se
`placa_atual` for informada) já atribui o veículo.

**Tipos de ocorrência que o motorista pode reportar** (`POST /api/occurrences`,
campo `tipo`): `manutencao_solicitada`, `sinistro`, `avaria`, `acidente`,
`multa` ou `outro`. Exemplo:
```json
{ "placa": "TZK0E38", "tipo": "sinistro", "descricao": "Colisão lateral no cruzamento X" }
```
Staff (admin/gestor_base/superadmin) decide o encaminhamento por
`PATCH /api/occurrences/:id` (`status`: `em_analise`, `aprovada`, `rejeitada`
ou `resolvida`; opcionalmente linkando a uma manutenção já aberta via
`maintenance_id`).

**Troca de motorista num veículo:** `PATCH /api/vehicles/:id/motorista`,
liberado para `gestor_base`, `admin` e `superadmin` (decisão de 24/11/2026).
```json
{ "driver_id": "uuid-do-motorista-novo" }
```
`driver_id: null` retira o motorista atual sem atribuir outro. A rota fecha
sozinha o vínculo anterior em `vehicle_driver_history` (`fim = now()`) e abre
o novo — nunca apaga o histórico. Toda troca (inclusive uma tentativa que não
muda nada) vira uma linha em auditoria — ver seção abaixo.

**Erro comum:** `driver_id` que não existe retorna 400 com
`"Motorista (driver_id) não encontrado."` — confira o `id` em `GET /api/users`
ou na tabela `drivers`, não o `id` do usuário de login (são tabelas
diferentes; só motoristas com login têm os dois ligados por `drivers.user_id`).

## Auditoria

Toda ação sensível (criar/atualizar usuário, conceder/revogar acesso à
própria auditoria, trocar motorista de veículo, resolver ocorrência) grava
uma linha em `audit_log`, com usuário, ação, entidade afetada e um "antes/
depois" em JSON — pensado para virar relatório de reunião, não só debug.

**Quem pode ler** (`GET /api/audit`): só `superadmin`, por padrão. Um `admin`
só enxerga depois que um superadmin concede acesso — nunca automático, nunca
para `gestor_base`/`leitor`/`motorista` (mesmo que eles gravem eventos, não
podem lê-los depois). Isso é garantido em duas camadas, como o resto do
projeto: a rota confere, e a RLS do banco (`pode_ver_auditoria()`) bloqueia
mesmo que a rota tivesse um bug.

**Conceder acesso a um admin** (só `superadmin`):
```json
PATCH /api/users/:id/acesso-auditoria
{ "acesso_auditoria": true }
```
Mandar `false` revoga. Funciona só enquanto o papel do usuário for `admin`
— conceder para um `gestor_base` é aceito sem erro, mas não tem efeito
nenhum (a API avisa isso na resposta).

**Consultar / exportar para reunião:**
```
GET /api/audit?desde=2026-11-01&ate=2026-11-30&acao=trocar_motorista
GET /api/audit/export.csv?desde=2026-11-01&ate=2026-11-30
```
Filtros opcionais: `desde`, `ate` (datas ISO), `acao`, `entidade`,
`usuario_id`. O `.csv` já vem pronto para abrir no Excel/Sheets — o
cabeçalho `Content-Disposition` força o download (se abrir direto no
navegador em vez de baixar, é o navegador tentando exibir o CSV; salve a
página como arquivo).

## Operações do dia a dia

- **Ver logs:** `docker compose logs -f api` (ou `db`).
- **Reiniciar só a API após atualizar código:**
  `git pull && docker compose up -d --build api`.
- **Rodar uma nova migration** (arquivo novo em `backend/src/db/migrations/`
  depois que o volume já existe — os scripts de init só rodam uma vez):
  copiar o SQL/script para dentro do container e aplicar manualmente com
  `docker compose exec db psql -U gdf_admin -d gestaodefrota -f /caminho/arquivo.sql`,
  ou usar `docker compose exec -T db psql ... < arquivo.sql`.

## Ativando VEC e BSC/Mercado Livre de verdade

Quando a documentação e as credenciais da API do Mercado Livre e/ou da VEC
chegarem:
1. Preencher `ML_*` / `VEC_*` no `.env`.
2. Implementar a chamada real dentro de
   `backend/src/adapters/bscAdapter.ts` e `vecAdapter.ts` (os `TODO` já
   marcam onde).
3. Chamar `POST /api/sync/vec` e `POST /api/sync/bsc` (só papel `admin`),
   manualmente ou por uma tarefa agendada (cron), para trazer os dados reais.

Até lá, essas rotas respondem dizendo exatamente o que falta — nunca
simulam um resultado de sincronização.

## Ativando o Google Sheets de verdade

A plataforma original lia a planilha Google como link público anônimo — foi
exatamente uma das falhas de segurança corrigidas nesta reconstrução (ver
achado C1/C2 no PRD). Por isso a integração nova (`backend/src/adapters/
googleSheetsAdapter.ts`) só funciona com uma **service account** autorizada
como leitora da planilha — nunca lendo um link público.

**Passo a passo** (10–15 minutos, uma vez só):

1. **Criar o projeto e a service account no Google Cloud:**
   - Acesse [console.cloud.google.com](https://console.cloud.google.com/),
     crie um projeto (ou use um existente).
   - Ative a **Google Sheets API** (menu "APIs e serviços" → "Biblioteca" →
     busque "Google Sheets API" → Ativar).
   - Em "APIs e serviços" → "Credenciais" → "Criar credenciais" → "Conta de
     serviço". Dê um nome (ex.: `gestaodefrota-sheets`), não precisa de papel
     nenhum no projeto (a permissão real vem do compartilhamento da planilha,
     passo 3).
   - Na conta de serviço criada, aba "Chaves" → "Adicionar chave" → "Criar
     nova chave" → tipo **JSON**. Isso baixa um arquivo `.json` — é o
     conteúdo dele que vai no `.env` (passo 4).

   **Erro comum:** esquecer de ativar a Google Sheets API no projeto — a
   sincronização falha com um erro tipo "API has not been used/enabled".
   Volte no passo acima e ative.

2. **Pegar o e-mail da service account:** está dentro do JSON baixado, campo
   `"client_email"` (algo como
   `gestaodefrota-sheets@seu-projeto.iam.gserviceaccount.com`).

3. **Compartilhar CADA planilha com esse e-mail**, como **Leitor** (não
   Editor — a sincronização só lê). Na planilha: botão "Compartilhar", cole
   o e-mail da service account, papel "Leitor", enviar.

   **Erro comum:** esquecer este passo é a causa mais comum de erro. Se a
   sincronização falhar com algo como "The caller does not have permission"
   ou "Requested entity was not found", é isso — confirme o compartilhamento
   na planilha certa, com o e-mail certo.

4. **Preencher o `.env` da VPS:**
   ```bash
   GOOGLE_SHEETS_SPREADSHEET_IDS=1-mo3u8HlUNlPCHEeMTF9ID_Q812jBBYXla5zqyDU-uQ
   GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"...",...}'
   ```
   - O ID da planilha é o trecho entre `/d/` e `/edit` na URL.
   - Mais de uma planilha (uma por base, por exemplo): separe os IDs por
     vírgula.
   - O valor de `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` é o arquivo `.json`
     inteiro, **numa linha só**, entre aspas simples — copie o conteúdo do
     arquivo baixado e cole direto (não precisa remover nada, só garantir
     que fique numa linha).

   **Erro comum:** colar o JSON com quebras de linha reais (não apenas os
   `\n` dentro de `private_key`) quebra o parsing — se a sincronização
   responder "não é um JSON válido", abra o arquivo baixado num editor que
   mostre tudo numa linha, ou use `cat arquivo.json | tr -d '\n'` com cuidado
   para não remover os `\n` que fazem parte da própria chave (o jeito mais
   seguro é copiar o arquivo inteiro como veio, sem reformatar).

5. **Reiniciar a API** para carregar o novo `.env`:
   ```bash
   docker compose up -d --build api
   ```

6. **Disparar a sincronização** (autenticado como `admin` ou `superadmin`):
   ```bash
   curl -X POST https://alexander-log.com.br/api/sync/google-sheets \
     -H "Authorization: Bearer SEU_TOKEN"
   ```
   Resposta de sucesso: `{ "synced": 42, "detalhes": { "<id-da-planilha>": { "abas": 2, "veiculos": 42 } } }`.
   Cada aba da planilha é lida sozinha — uma aba sem a coluna `PLACA` é
   ignorada (não dá erro, só não conta). Veículos já existentes são
   atualizados (`status`, motorista, observação), nunca duplicados; motorista
   é casado pelo nome exatamente como está na planilha (mesma lógica da
   importação manual em `docs/base-smg3-pouso-alegre.md`).

Até a service account ser configurada, `POST /api/sync/google-sheets`
responde `{ "synced": 0, "skipped": "..." }` — nunca inventa dado.

**Agendar automaticamente** (opcional, para não precisar chamar na mão toda
vez que a planilha mudar): um `cron` na própria VPS chamando o `curl` acima
a cada X minutos, ou um agendador dentro da aplicação — me avise se quiser
que eu implemente isso.
