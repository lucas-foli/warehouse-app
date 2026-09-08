# Campo — fatia 3: painel de campo

**Data:** 2026-09-08
**Status:** aprovada (brainstorm com Lucas)
**Jira:** WAR-4 (epic WAR-1)
**Mockup:** `2026-09-08-campo-fatia3-nav-preview.html` (descartável; compara as
quatro navegações consideradas, com o mesmo conteúdo dentro). O mockup foi feito
para decidir a navegação e precede as decisões de conteúdo. Divergências
conhecidas, todas corrigidas no arquivo depois da decisão: o primeiro KPI era
"Visitas" (virou "Interações", com quebra por canal); não havia rótulo de
alcance do filtro de loja; a sub-view se chamava "Relatório" (virou "Painel");
e a barra inferior tinha quatro itens em vez dos cinco reais do app.
**Onde mockup e spec divergirem, vale a spec.**

## Contexto

Terceira fatia da obra Campo. As duas anteriores estão em `main`: a fatia 1
(PR #73) criou contatos, interações e agenda; a fatia 2 (PR #74) criou o
recebimento de mercadoria e fez o estoque subir. Nenhuma das duas produziu
uma visão consolidada — os fatos existem no banco e não somam em lugar nenhum.

Esta fatia entrega essa visão **na tela**. O envio por WhatsApp é a fatia 5 e
não é pré-requisito de nada aqui.

**Leitor: os sócios da Global.** A tela responde "como vai o campo", não "o que
eu tenho para fazer hoje" — o Elcy alimenta, a direção lê. A visão pessoal do
Elcy (meus follow-ups, minhas amostras paradas) não entra; se fizer falta,
vira entrada de backlog, não improviso nesta tela.

## Decisões (com as alternativas rejeitadas)

### Onde a tela mora: 4ª sub-view do Campo, chamada "Painel"

`FieldPage` ganha um quarto item no segmented control: Agenda / Funil /
Fornecedores / **Painel**. A Agenda continua sendo o que abre.

Rejeitadas, com o motivo: **virar o default** (economiza um toque semanal do
sócio cobrando um toque diário do Elcy, que usa o app para trabalhar);
**aba própria na barra inferior** (a barra já tem cinco itens — Produtos,
Campo, Clientes, Vendedores, Vendas — e o relatório ficaria longe do módulo
que ele resume); **seção no Overview** (mistura a operação de campo com a de
varejo numa tela que já é longa).

O nome **"Painel"**, e não "Relatório", resolve duas coisas de uma vez: cabe
no segmented control de quatro itens em 375px (com "Relatório" o quarto pill
espremia "Fornecedores", visível no mockup) e reserva a palavra "relatório"
para o que a fatia 5 **envia**. Duas coisas diferentes não devem ter o mesmo
nome no mesmo produto.

### Janela de tempo: seletor na tela, default 30 dias

Pills `7 dias / 30 dias / 90 dias / Tudo` no topo. Todo número da tela respeita
a escolha, e cada bloco declara a janela no rótulo.

É o **primeiro filtro de período do app** — não havia nenhum. O estado é local
da página, sem persistência: reescolher a janela é barato, e persistir
preferência antes de alguém reclamar é inventar necessidade.

Rejeitadas: janela fixa de 30 dias (transformaria qualquer outra pergunta em
fatia nova); semana corrente contra a anterior (bom para "como vai", ruim para
"quanto já fizemos"); acumulado sem janela (visitas viram um número que só
cresce).

### Amostras: valorizadas pelo último custo conhecido do SKU

Quantidade sempre; valor em US$ pelo `unit_cost` do **recebimento mais recente
daquele SKU que tenha custo**, ordenado por `received_at` (data do
recebimento), não por `created_at` (data do registro).

Linha com `unit_cost` nulo é ignorada na escolha do custo — **ausente não é
zero**, como a fatia 2 estabeleceu. SKU sem nenhum custo conhecido entra numa
contagem de cobertura exibida junto do valor: "custo estimado pelo último
recebimento — N de M SKUs sem custo conhecido". O total sai marcado como
parcial sempre que N > 0.

Isto **não** decide o método de custeio do produto. Nenhuma coluna de custo
entra em `products`, nenhuma margem é calculada, e a escolha continua
reconstruível a partir das linhas de recebimento — exatamente onde a fatia 2
deixou.

Rejeitadas: custo médio ponderado (mais defensável contabilmente, amarra ainda
mais o método antes de existir decisão de custeio); mostrar US$ só com 100% de
cobertura (na prática quase sempre cairia no caso vazio); só quantidade (perde
a pergunta "quanto custou prospectar este mercado", que é o ponto do WAR-4).

### Recebido x vendido: por SKU; fornecedor é procedência, não agregação

Uma tabela por produto — recebido, vendido, saldo — com uma coluna
**informativa** de fornecedor: o do recebimento mais recente daquele SKU,
marcado quando houve mais de um ("Noronha +1"). Uma lista separada mostra o
recebido por fornecedor.

**Vendas nunca são somadas por fornecedor.** `sales_items` conhece SKU, não
procedência; atribuir a venda ao fornecedor do último recebimento produziria
um número com cara de certeza que envelhece mal no dia em que um SKU passa a
vir de dois lugares. O cruzamento honesto exige o vínculo produto→fornecedor
como dado de primeira classe — decisão de modelo, registrada no backlog.

Rejeitado também o rateio proporcional: gera números fracionários que ninguém
consegue conferir contra a realidade física.

**O saldo é o de agora, não o do fim da janela.** Recebido e vendido respeitam
o período escolhido; `products.qty` é um valor corrente, e o app não guarda
histórico de saldo que permitisse reconstruí-lo numa data. Com "7 dias"
selecionado, as três colunas não fecham em aritmética — e não deveriam parecer
que fecham: a coluna de saldo carrega o rótulo "hoje".

### Filtro de loja: só onde existe loja de verdade

O filtro de loja do header passa a chegar ao Campo (hoje `FieldPage` é a única
página que não o recebe, `Dashboard.tsx:465`), mas **só as vendas o respeitam**.

O motivo é de modelo, não de esforço: `receipts` **não tem coluna de loja** —
o `p_location` de `register_receipt` define a loja do produto novo que o lote
cria, não o local do recebimento. Filtrar o recebido só seria possível pela
loja **atual** do produto (`products.location`), enquanto o vendido filtra pela
loja **congelada no pedido** (`sales_orders.location`). Um produto que mudou de
loja teria, na mesma linha, recebimento contado na loja nova e vendas na loja
velha — dois universos diferentes lado a lado, sem nada na tela denunciando.

Portanto: vendas filtram; recebido x vendido, amostras, atividade e funil ficam
globais, e **um rótulo único no topo da tela diz o que a loja selecionada
afeta**. Dar loja própria ao recebimento resolve na raiz e serve fatias
futuras, mas custa migration, mexe na RPC recém-mergeada e deixa os
recebimentos existentes sem loja: fica no backlog.

### Atividade: interações quebradas por canal

O KPI é "interações no período", com a quebra por canal (`visit`, `call`,
`whatsapp`, `email`) logo abaixo. Contar só visitas presenciais faria um mês
inteiro de prospecção por WhatsApp aparecer como zero atividade; contar tudo
sem quebra não distingue um mês de estrada de um mês de mensagens.

Desfecho (`interested`, `proposal_requested`, `undecided`, `not_interested`,
`buyer_absent`) **não** entra nesta fatia — mede qualidade do contato, é um
módulo de derivação a mais, e ninguém pediu ainda.

### "Contatos novos" sai das tabelas, não da view

`clients` e `suppliers` têm `created_at`, mas a view `field_contacts` **não o
expõe**. O KPI vem de uma consulta direta às duas tabelas (só `id` e
`created_at`, filtrados por período), e não de uma alteração da view.

Trocar a view custaria uma migration numa fatia que, de resto, não precisa de
nenhuma — e a view foi mexida pela última vez na emenda 2 da fatia 1, com
custo de leitura já medido e registrado no backlog. Não é hora de tocá-la por
um KPI.

## Arquitetura

### Sem migration

Todas as tabelas que o painel lê já existem e já têm policy de `select` por
`is_tenant_member`: `interactions`, `interaction_samples`, `receipts`,
`receipt_items`, `sales_orders`, `sales_items`, `products`, `clients`,
`suppliers`.

A derivação é **TypeScript**, seguindo a decisão da fatia 1 ("relatório
(fatia 3) e automações (fatia 5) são TS e importam o mesmo módulo"): a casa não
tem harness de teste de banco, então regra em SQL é regra sem teste de unidade.

### Leitura (serviços)

- **`fieldService`**: interações do período com suas amostras. Hoje só existe
  `fetchOpenAgenda` (agenda em aberto) e `fetchContactInteractions` (timeline de
  um contato) — falta o recorte por janela. Reusar o padrão de paginação já
  existente (`PAGE_SIZE = 1000`).
- **`receiptService`**: `fetchReceipts` / `fetchReceiptItems` por período.
  **Primeiro consumidor de leitura dessas tabelas** — o serviço hoje só escreve
  (`registerReceipt` via RPC). As policies de `select` existem desde a fatia 2 e
  **nunca foram exercitadas contra o Supabase do app**.
- **`dashboardService`**: vendas do período e produtos (já lê ambos).
- **contatos novos**: contagem por `created_at` em `clients` e `suppliers`.

Nesta passagem, `Receipt` e `ReceiptItem` (`src/types/index.ts`) deixam de ser
row shape em snake_case e viram tipo de domínio em camelCase, mapeados na
fronteira do serviço como o `fieldService` já faz com `Interaction`. É a dívida
que o backlog registrou para ser paga junto do primeiro consumidor de tela —
que é esta fatia.

### Derivação (módulos puros em `src/utils/`)

Um módulo por bloco, cada um com sua suíte. **A janela entra como parâmetro**
(`from` / `to`, calculados na página) — nunca `Date.now()` dentro do módulo,
senão o teste não consegue fixar o tempo e a suíte vira decoração.

| Módulo | Responsabilidade | Caso que o teste precisa cobrir |
|---|---|---|
| `fieldActivity` | interações do período, quebradas por canal | interação exatamente na borda da janela |
| `funnelSummary` | contagem por estágio, importando `deriveStage` | contato com override manual expirado por fato posterior |
| `sampleCost` | amostras por contato, valor pelo último custo do SKU, cobertura | SKU sem custo algum não é SKU com custo zero |
| `receivedVsSold` | por SKU: recebido, vendido, saldo, procedência | SKU com dois fornecedores; SKU vendido que nunca foi recebido |
| `negativeBalances` | produtos com saldo negativo | saldo zero não é divergência |

O KPI "follow-ups vencidos" **não** ganha módulo novo: é a contagem do que
`fetchOpenAgenda` + `groupAgenda` (`src/utils/agendaGrouping.ts`) já derivam
para a sub-view Agenda. Duas contagens de atraso divergindo dentro da mesma aba
seria um defeito pronto.

`funnelSummary` **importa** `stageDerivation.ts` — não reimplementa a regra. A
fatia 1 fez desse módulo a fonte única de verdade do estágio justamente para
que o painel e as automações não divergissem dela.

## UI

Composição, na ordem: seletor de período → 4 KPIs (interações, contatos novos,
amostras entregues, follow-ups vencidos) → quebra por canal → funil por estágio
→ amostras por mercado → recebido x vendido → recebido por fornecedor →
divergências de saldo.

**Linguagem visual:** a do módulo Campo (cards arredondados, chips, listas
tocáveis, alvo mínimo de 44px), não a do Overview. **Nenhum gráfico novo** — o
funil é barra em CSS. Recharts hoje só existe no `OverviewPage`, e uma
dependência de gráfico a menos é uma coisa a menos para carregar no celular do
Elcy na rua.

**Estados por bloco, não por tela.** "Nenhuma interação no período" é diferente
de "nenhum contato cadastrado", e nenhum dos dois é um zero. Vale a regra que o
Dashboard honesto e a fatia 2 já aplicaram: nada fabricado, nada que finja
precisão que não existe.

**Os três avisos que a tela precisa carregar,** porque sem eles ela mente por
omissão:

1. cobertura de custo, junto do valor estimado das amostras;
2. o que a loja selecionada afeta — rótulo único no topo, já que só as vendas
   filtram;
3. **saldo negativo como card próprio.** Uma amostra registrada sem estoque
   deixa `products.qty` negativo (`register_interaction`, linhas 119-124) e o
   aviso da RPC é efêmero: volta na resposta e some. Este card é a primeira vez
   que a divergência fica visível no app.

## Verificação

**Suíte vitest** por módulo puro. Cada teste anota `mata:` — qual mutação ele
detecta — e as mutações nomeadas são **aplicadas de fato** antes do merge, para
confirmar que o teste morre. É o padrão firmado na fatia 2, e a razão dele vale
em dobro aqui: este é o primeiro módulo do app que **deriva** em vez de listar,
e derivação errada não parece errada na tela.

**Runbook e2e curto**, com um caso obrigatório: abrir o Painel num tenant que
tenha **recebimento real gravado**. Se a policy de `select` de `receipts` /
`receipt_items` estiver errada, o sintoma é tabela vazia **sem erro** — o pior
tipo de falha possível para um painel, porque parece um dado verdadeiro.

## Fora de escopo (decidido, não esquecido)

Envio por WhatsApp (fatia 5); quebra por desfecho da interação; vendas somadas
por fornecedor (exige vínculo produto→fornecedor, decisão de modelo);
exportar / imprimir / PDF; método de custeio real e margem; estorno de
recebimento e de amostra (ambos já no backlog); visão pessoal do Elcy;
persistência da janela escolhida; loja própria para o recebimento.

## Riscos

**Só o e2e pega:** as policies de `select` de `receipts` / `receipt_items`
contra o Supabase do app, nunca exercitadas — e falham em silêncio.

**Nem o e2e pega:** divergência entre o "recebido" (global) e o "vendido"
(filtrado por loja) para quem usa o filtro de loja sem ler o rótulo do topo; e
o custo estimado envelhecer sem ninguém notar, já que o último custo conhecido
pode ser de um recebimento muito antigo — a tela informa a cobertura, não a
idade do custo.
