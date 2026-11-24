# Base SMG3 (Pouso Alegre/MG) e SMG5 (Frota Locada) — planilha de campo real

## Fonte

Planilha enviada em 24/11/2026: `docs/fontes/BASE_SMG3_POUSO_ALEGRE_24-11-2026.xlsx` (original preservado, nunca editado — qualquer correção de leitura vira uma nota aqui, não uma edição do arquivo fonte).

Duas abas:
- **SMG3** — 38 veículos, coordenador responsável CRISVER, todos tipo "Utilitário", rentadora LOCALIZA.
- **SMG5 FROTA LOCADA** — 4 veículos, rentadora MOVIDA.

Total: **42 veículos.**

## Isso resolve a pendência do "42 vs 600+"

O dashboard legado mostrava "42" enquanto o snapshot agregado antigo (`fleet_snapshots`, migração `003_seed_dados_reais.sql`) somava SMG9 (322) + outras bases, passando de 600.

Com esta planilha confirmamos: **"42" é a frota operacional real da base SMG3 + SMG5 (Pouso Alegre), não a frota nacional inteira.** O "600+" é a soma de todas as bases do país (SMG9, SMG11, SGO1, SRS10 etc., já presentes nos snapshots legados). Os dois números estavam certos — mediam coisas diferentes (uma base vs. a frota toda). Para a apresentação à RodaCoop, o dashboard deve deixar isso explícito: um total nacional e um recorte por base, nunca um "42" solto sem dizer de qual base.

## O que foi importado (migrations `007` e `008`)

- **42 veículos** inseridos/atualizados (`ON CONFLICT (placa) DO UPDATE`) — os que já existiam de uma captura legada anterior (ex.: `TZK0E08`, `TZK0E24`, `TZK0E33`, `TZK0E37`, `TZK0E38`, `TKN8F67`) tiveram status, motorista e observação **atualizados** para o valor desta planilha mais recente, sem apagar o histórico de manutenção já registrado (`maintenance_records` continua intacto).
- **25 motoristas reais**, pelo nome exatamente como está na planilha.
- **Observação literal de campo** por veículo, nova coluna `vehicles.observacoes` (texto livre: "DESMOBILIZADAS E ENTREGUES NA SUL MINAS PNEUS", "SINISTRO,CENTRO AUTOMOTIVO VA" etc.) — são notas do responsável da base, não substituem `maintenance_records`/`occurrences`, mas já ficam visíveis em cada veículo.
- **Histórico de motorista por veículo** (`vehicle_driver_history`), com `inicio = 2026-11-24` (data da própria captura — a planilha não traz data exata de início de cada vínculo, então não inventamos uma data anterior).

## Pontos que ficaram em aberto de propósito (não inventamos resolução)

- **Dois motoristas com grafia parecida**: `MARCOS VINICIUS BATISTA` (dirige `TZK0E38`) e `MARCOS VINICIUS BATISTA DA SILVA` (dirige `TZK0E42`, observação diz que assumiu por causa da manutenção da `0E38`). Pode ser a mesma pessoa com nome digitado de forma diferente nas duas linhas, ou duas pessoas diferentes. Como a planilha não confirma, foram cadastrados como **dois motoristas distintos**. Se for a mesma pessoa, me avise o nome correto que eu corrijo (`UPDATE` simples, sem perder histórico).
- **Mesmo motorista em mais de um veículo ao mesmo tempo**: `RENAN VAZ GONÇALVES` aparece em 3 placas (`TZK0E24`, `TZK0E14`, `TZK0E37`) e `RONDEVALDO NOVATO PEDRO` em 2 (`TZK0E33`, `TZK7F84` — esta com observação explícita "ASSUMIU DEPOIS DA 0E33 IR PRA MANUTENÇÃO"). Isso é literal da planilha — refletido como está, sem eu decidir qual é o veículo "correto" de cada um.
- **Referência cruzada confusa**: a observação de `TZK0E24` cita "TKZ0E37 SINISTRO" (provável referência à placa `TZK0E37`, possivelmente digitada errado na fonte). Mantida exatamente como veio, sem correção — corrigir isso é uma decisão sua, não minha.

## Próximo passo sugerido

Quando o frontend existir, essas observações de campo são a candidata natural para aparecer num card por veículo, com um botão "transformar em ocorrência" (preenchendo `occurrences` com o tipo certo), em vez de ficar só como texto solto — assim o fluxo de motorista/ocorrência que já existe passa a absorver o que hoje só está em planilha.
