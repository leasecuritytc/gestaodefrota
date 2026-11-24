# Coletor do BSC

Lê o relatório BSC (Looker Studio) com a conta do BSC e envia retratos à GESTÃO DE FROTA
(menu **BSC**, só superadmin/admin). Roda no computador que tem acesso ao BSC; o login é
feito por você uma vez e fica guardado em `./perfil` (não vai para o Git).

## Instalação (Windows/Mac/Linux, Node 18+)
1. `cd tools/bsc-coletor`
2. `npm install && npm run instalar`
3. Copie `.env.example` para `.env` e preencha `BSC_INGEST_TOKEN` (o mesmo do servidor).
4. `npm run login` — entre na conta do BSC na janela que abrir e feche a janela.
5. `npm run coletar` — deve imprimir uma linha `OK` por página.

## Automatizar (a cada 2 horas)
- Windows: `schtasks /create /tn "BSC Coletor" /sc hourly /mo 2 /tr "cmd /c cd /d C:\caminho\tools\bsc-coletor && npm run coletar"`
- Linux/Mac: `0 */2 * * * cd /caminho/tools/bsc-coletor && npm run coletar`

## Problemas comuns
- `Sessão do Google expirada`: rode `npm run login` de novo.
- `Timeout` ao clicar na página: confira o nome exato no menu do relatório (`BSC_PAGINAS`).
- `HTTP 401`: o token difere do `BSC_INGEST_TOKEN` do servidor. `HTTP 503`: servidor sem token.
- Um arquivo `erro-*.png` é salvo quando uma página falha: mostra o que o navegador viu.
