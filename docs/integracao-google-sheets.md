# Integração com Google Sheets

## Por que não trouxe os dados da planilha ao vivo agora

Tentei localizar a planilha original (a mesma do link enviado no início do
projeto, dona `bsc4@rodacop.com.br`) usando a conexão do Google Drive
disponível nesta conversa. Essa conexão está em outra conta
(`leasecuritytc@gmail.com`) e não tem acesso a essa planilha — a busca não
encontrou nada relacionado a frota/RodaCoop/SMG. Por isso não dava para ler
o conteúdo real sem simular nada, e eu não simulo.

**O que construí em vez disso**: a integração de verdade, pelo caminho
seguro — uma *service account* do Google, que o dono de cada planilha
autoriza explicitamente como leitora (passo a passo completo no README,
seção "Ativando o Google Sheets de verdade"). Isso é melhor que eu tentar
acessar com a conta errada por dois motivos:

1. **Não depende desta conversa.** Uma vez configurada, a sincronização roda
   na própria API, na VPS, sem precisar de mim nem de nenhuma sessão do
   Claude — é a forma certa para produção.
2. **Nunca repete a falha de segurança original.** A plataforma antiga lia
   a planilha como link público anônimo (achado C1/C2 do PRD). A service
   account só enxerga o que for compartilhada com ela, como leitora —
   ninguém mais de fora consegue ler a planilha por essa via.

## O que a integração faz quando configurada

Lê todas as abas de uma ou mais planilhas (uma por base, por exemplo) no
mesmo layout da planilha real já importada (`docs/fontes/
BASE_SMG3_POUSO_ALEGRE_24-11-2026.xlsx`): colunas PLACA, DRIVERS/MOTORISTA,
LOCADORA/RENTADORA, STATUS, e observação de campo logo depois do status.
Atualiza veículo, motorista atual, observação e histórico de troca de
motorista — exatamente a mesma lógica usada na migration `008`, só que
rodando sob demanda (`POST /api/sync/google-sheets`) em vez de uma vez só.

Uma linha cujo status não bate com o vocabulário conhecido (`Ativa`,
`Manutenção`, `Desmobilizado`, `Sem cooperado`) é ignorada, não adivinhada —
o mesmo vale para uma aba sem coluna `PLACA`.

## Próximo passo, quando quiser dados ao vivo

Peça para alguém com acesso à planilha (o dono atual, ou quem usa o e-mail
`bsc4@rodacop.com.br`) seguir os passos 1–4 do README — é rápido, e depois
disso a sincronização passa a trazer o que estiver na planilha de verdade,
sem eu precisar reler nada manualmente.
