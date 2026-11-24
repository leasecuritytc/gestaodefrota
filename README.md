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

## Achado importante sobre os dados herdados

O painel atual mostra "42 veículos", mas os snapshots reais trazem **bases
inteiras fora desse total** (SMG9 com 322, SMG6 com 302, SMG11 com 10),
somando centenas de veículos. O "42" parece ser um filtro de frota/base
específico, não o total da operação. Confirme isso antes de usar esse número
em qualquer apresentação.

## Estrutura

```
backend/            API (Node.js + TypeScript + Express + PostgreSQL)
  src/db/migrations/ Migrations em ordem (números e letras definem a ordem)
  src/adapters/      Pontes para VEC e BSC/Mercado Livre (hoje desativadas)
  src/routes/        Rotas HTTP
nginx/               Bloco Nginx pronto para este domínio
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

### 5. Criar o primeiro usuário admin

```bash
docker compose exec \
  -e ADMIN_EMAIL='seu-email@exemplo.com' \
  -e ADMIN_PASSWORD='uma-senha-forte-de-verdade' \
  -e ADMIN_NAME='Seu Nome' \
  api node dist/scripts/createAdmin.js
```

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
