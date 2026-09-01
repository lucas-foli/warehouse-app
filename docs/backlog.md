# Backlog de features — warehouse-app

> Melhorias e features deferidas (não são bugs — bugs ficam em `bugs.md`).
> Ordem = ordem de registro.

## 2026-08-04 — Metas de vendedor (goal/quota)

**Origem:** na obra demo-ready US-first (PR #65), o card "Abaixo da meta" do
`SellersPage` foi **removido** porque não existe conceito de meta/quota no modelo
de vendedor — o card só conseguia exibir `—` (travessão). Removê-lo foi a decisão
honesta ("nada fabricado na tela"); esta entrada registra o caminho de volta.

**O que implementar:**
- Adicionar meta/quota ao modelo de vendedor (`Seller` em `src/types/index.ts`) —
  decidir a granularidade: meta de faturamento por mês? por período? valor fixo por
  vendedor ou configurável por tenant?
- Persistência: coluna(s) na tabela de vendedores no Supabase (+ migration) e/ou
  uma tabela de metas por período.
- Fluxo de definição da meta na UI (onde o gestor define/edita a meta de cada vendedor).
- Recolocar o card "Abaixo da meta" no `SellersPage`, agora com dado real: contar
  vendedores cujo faturamento (bruto/líquido — definir) está abaixo da meta do período.
- Reaproveitar o padrão de rollup já existente (`src/utils/sellerRollup.ts`) para o
  faturamento realizado vs. meta.

**Fora do escopo original da obra US-first** — feature própria, com brainstorming/spec
quando for priorizada.

## 2026-08-05 — Opções de ordenação (sort) escolhíveis pelo usuário nas listas

**Origem:** descoberto no e2e do CRUD individual de clientes/vendedores (PR #67).
Hoje as listas carregam ordenadas por `id` (uuid) em `dashboardService.ts:18` —
nem alfabética, nem por atividade. Efeitos:
- `ClientsPage` desktop (`:240-251`) mostra **todos** os clientes com rolagem
  (`overflow-auto`); o botão "Ver mais" existe **só** no mobile (`:200-235`, corta em 5).
- `SellersPage` ordena por receita (`bruto` desc) com cap de 15 na exibição.
- Um registro recém-criado cai numa posição "aleatória" (ordem de uuid), difícil de
  localizar numa lista grande.

**Decisão de produto:** a ordenação deve ser **escolhível pelo usuário** (seletor de
sort na tela), não fixa no código.

**Default proposto (Lucas):** clientes por **última venda (`last_purchase_at`) desc**,
com **ordem alfabética (nome A→Z)** como segundo critério de desempate. Prioriza a
visão do Business Owner (quem tem atividade comercial recente).

**A resolver no brainstorming/spec:**
- Onde entram os registros **sem compra** (incluindo recém-cadastrados): com "última
  venda desc", eles caem no fim. Isso é coerente com "priorizar atividade", mas o
  feedback de "acabei de cadastrar" passa a vir só do modal, não da posição na lista.
  Decidir se nulos vão ao fim, ou se há um modo/seletor "recém-adicionados".
- Aplicar o mesmo mecanismo de sort escolhível a vendedores (hoje fixo em receita).
- Opções de critério a expor: última venda, alfabético, data de cadastro, receita
  (vendedores). Persistir a preferência? (por usuário/tenant, ou só na sessão).

**Escopo:** afeta o display (fetch em `dashboardService` + render das páginas), **não**
o CRUD entregue no PR #67. Feature própria, com spec quando priorizada.

## 2026-08-05 — Validação de e-mail e máscara de telefone nos modais

**Origem:** e2e do CRUD de clientes/vendedores (PR #67). Os campos de e-mail e telefone
nos modais (`ClientFormModal`, `SellerFormModal`) aceitam qualquer texto: o `type="email"`
não valida porque o submit é por botão, não por `<form>`; o telefone é texto livre, sem
formatação.

**O que implementar:**
- Validação de formato de e-mail antes de salvar (mensagem amigável se inválido).
- Máscara/formatação de telefone. Duas abordagens a avaliar:
  - Simples: formatar conforme a contagem de dígitos (padrão US vs BR).
  - Rica: seletor de DDI com bandeira e, a partir da escolha, aplicar o formato do país.
- Decidir se o telefone inválido bloqueia o salvamento ou só formata/avisa.

**Fora do escopo do MVP/apresentação** — deferido conscientemente no e2e. Feature de
polimento dos modais, com spec quando priorizada. Pesar a complexidade do seletor de DDI
antes de adotá-lo.

## 2026-08-05 — Margem real (custo por produto)

**Origem:** obra "Dashboard honesto" (BUG-7). A seção "Categorias" exibia um
custo/margem fabricado (`custo = venda × 0.4`), removido por não existir custo real
no modelo (`Product` só tem `price`). Esta entrada registra o caminho para a margem
de verdade.

**O que implementar:**
- Custo por produto no modelo `Product` (`src/types/index.ts`) + persistência
  (coluna na tabela de produtos no Supabase + migration).
- UI para o gestor informar/editar o custo de cada produto.
- Recolocar custo e **margem real** por categoria na seção "Categorias" do
  `OverviewPage`, derivando de vendas − custo real (reaproveitar
  `buildCategorySalesFromItems`/`FromProducts`).

**Fora do escopo da obra Dashboard honesto** — feature própria, com spec quando priorizada.

## 2026-08-05 — Alinhar janelas das duas visões de vendedor

**Origem:** revisão final da obra "Dashboard honesto" (BUG-10). No `SellersPage`, os
dois gráficos lado a lado medem janelas temporais diferentes, ambos rotulados como
faturamento do mesmo vendedor:
- "Performance por período" (`buildSellerDailyPerformance`) soma só os **últimos 30
  dias** terminando hoje.
- "Faturamento por vendedor" (barras) usa `v.bruto` de `aggregateSellers`, que é
  **all-time** (sem janela).

**Efeito:** com histórico > 30 dias (ex.: import de CSV de 6 meses), a soma da série
não bate com a barra do mesmo vendedor. Não é dado fabricado — ambos são reais, só
medem períodos distintos; cada gráfico carrega seu próprio rótulo. O comportamento
antigo (série via `Math.random` distribuindo `bruto/30`) também não conciliava, então
não há regressão.

**A resolver no brainstorming/spec:** decidir se as duas visões devem compartilhar a
mesma janela (ambas 30d? ambas all-time? seletor de período?) ou se o rótulo deve
deixar a diferença de janela explícita ao usuário.

**Fora do escopo da obra Dashboard honesto** — decisão de produto, com spec quando priorizada.

## 2026-08-05 — Expor `external_id` do vendedor (e cliente) na UI

**Origem:** e2e da obra "Dashboard honesto". O `external_id` (identificador de origem
usado para casar pedidos importados por CSV via dual-key) **não aparece em nenhum lugar
da UI**: a tabela de vendedores mostra só nome/e-mail/itens/bruto/líquido/boletos, e o
`SellerFormModal` só tem os campos Nome e E-mail (`src/components/sellers/SellerFormModal.tsx:177-190`).
Hoje só dá para descobrir o `external_id` pelo CSV importado ou consultando o Supabase
(`sellers.external_id`). Exceção acidental: um vendedor importado **sem nome** aparece com
o `external_id` no lugar do nome (fallback em `dashboardService.ts:152`).

**Dor:** dificulta conciliação e suporte — quando uma venda registrada na tela e uma
importada deveriam cair no mesmo vendedor, não há como o gestor verificar o vínculo pela
interface.

**O que implementar:** exibir o `external_id` (read-only) nos detalhes do vendedor — no
modal e/ou como coluna/tooltip na tabela. Estender ao cliente (`external_id` de cliente
tem o mesmo papel). Decidir se é sempre visível ou só quando presente.

**Fora do escopo da obra Dashboard honesto** — melhoria de UI/suporte, com spec quando priorizada.

## 2026-08-26 — Estender a direção visual "app nativo" ao app inteiro

**Origem:** brainstorm da obra Campo (spec `2026-08-26-campo-fatia1-design.md`).
O mockup da aba Campo (cards arredondados, pills, segmented control, botão de
ação fixo, agrupamentos com hierarquia mobile-first) foi aprovado pelo Lucas
com decisão explícita de **adotar essa linguagem** — "tá caminhando pra se
tornar um app nativo".

**O que implementar:** aplicar a mesma linguagem visual às telas existentes
(Overview, Produtos, Pedidos, Clientes, Vendedores, Ajustes), hoje em padrão
misto. Referência viva: a aba Campo (fatia 1 da obra) e o mockup
`docs/superpowers/specs/2026-08-26-campo-fatia1-preview.html`.

**Escopo:** obra própria com brainstorming/spec — mudança app-wide de UI, não
fix por componente (regra de escopo já estabelecida para mudanças transversais).

**Jira:** WAR-8 (board Warehouse criado em 2026-08-26 no go-fly.atlassian.net;
epic da obra Campo = WAR-1).

## 2026-08-26 — Correção/estorno de interação e amostra (Campo)

**Origem:** review final da fatia 1 da obra Campo (PR #73). O débito de estoque
por amostra (`register_interaction`) é irreversível no app: não há policy de
DELETE em `interactions`/`interaction_samples`, não há UI de editar/apagar
interação, e nada devolve `qty` — diferente de `void_sale_order`, que estorna a
venda. Enquanto a fatia 2 (entrada de mercadoria) não entra, o estoque só desce.

**O que implementar:**
- RPC de estorno espelhando `void_sale_order`: devolve `qty` das amostras e
  marca a interação como estornada (ou permite exclusão sob policy).
- UI de correção na ficha do contato (editar quantidade/SKU da amostra, ou
  desfazer a interação inteira dentro de uma janela de tempo).
- Decidir se a interação estornada some da timeline ou fica marcada.

**Enquanto isso:** correção é SQL manual no Supabase. Registrado no runbook
`docs/superpowers/runbooks/2026-08-26-campo-fatia1-e2e.md`.

**Jira:** WAR (epic WAR-1).

## 2026-08-26 — Idempotência do register_interaction (Campo)

**Origem:** review da task 11 e review final da fatia 1. Se a rede cair depois
do commit da RPC mas antes da resposta, a retentativa manual do Elcy cria uma
segunda interação e um segundo débito de estoque. A fatia 2 mexe no mesmo RPC —
bom momento para resolver junto.

**O que implementar:** chave de idempotência por requisição (gerada no cliente,
única por tentativa de registro), com unique index e retorno da interação já
gravada quando a chave repetir.

**Jira:** WAR (epic WAR-1).

## 2026-08-27 — Custo da view field_contacts dobrou (Campo)

**Origem:** review da emenda 2 da fatia 1 (medido em Postgres com 3.010 contatos,
24.010 interações, 6.004 pedidos): `EXPLAIN ANALYZE select * from field_contacts`
saiu de ~12,3 ms para ~25,9 ms.

**Causa (medida, não suposta):** não é o predicado novo de escopo do override —
é o `last_fact_at` do braço cliente ter deixado de ler a coluna denormalizada
`clients.last_interaction_at` e passado a calcular `max(occurred_at)` por
contato. O filtro de data entra como Filter, não Index Cond, porque
`(x is null or col > x)` não vira limite de índice; nenhum índice novo resolve.

**Possível caminho:** manter uma coluna denormalizada equivalente ao
`last_fact_at` escopado, atualizada pela RPC e pelo override — ou aceitar o
custo (irrelevante na escala da Global: dezenas de contatos, não milhares).

Sem ação nesta fatia. Reavaliar se a lista do Campo começar a pesar.

## 2026-08-27 — Seletor de produto do registro rápido não serve no mobile (Campo)

**Origem:** pergunta do Lucas no e2e da fatia 1 ("esse campo number+select vai
funcionar bem no mobile mesmo?"). Verificado: não.

**O problema.** O seletor de SKU usa `<datalist>` com o SKU no `value` e o nome
do produto como rótulo. **O Safari não usa o rótulo — mostra só o value**
(WebKit bug 201768, nunca implementado; Chrome/Edge mostram os dois desde
2012/2014). No iPhone o Elcy veria uma lista de códigos sem nome de produto —
exatamente a reclamação do print 1, agora insolúvel por CSS. O iOS ainda teve
o bug de tocar na sugestão sem atualizar o campo, corrigido só no iOS 18, e há
relatos de instabilidade em 2026.

Secundário: `type="number"` abre no iOS o teclado de números-e-pontuação, não o
numérico grande (`inputMode="numeric"` resolve), e as setinhas do spinner são
desktop-only.

**Fix decidido:** trocar o datalist por lista de produtos tocável, reusando o
padrão da busca de contato que já existe no MESMO modal — cada linha com nome,
SKU e saldo em estoque; tocar seleciona. Resolve nome visível, alvo de toque e
saldo à vista na hora de escolher a quantidade.

**Timing (decisão do Lucas, 2026-08-27):** depois que ele terminar o roteiro
e2e — o datalist funciona no desktop, onde o teste está sendo feito. Entra com
o resto dos achados do e2e, antes do merge.

**Jira:** WAR-2 (não é WAR-8: é funcional, não repaginação).

## 2026-08-30 — Infra de teste de banco (RPC sem cobertura automatizada)

**Origem:** fatia 2 do Campo. O repo não tem runner de teste SQL (sem `test:db`,
sem pgTAP), então `register_sale_order`, `register_interaction` e agora
`register_receipt` — as três funções que mexem em saldo de estoque — só são
verificadas por e2e manual. Cada obra reescreve o mesmo roteiro à mão e a
regressão de uma RPC só aparece quando alguém repete o roteiro.

**O que implementar:** runner de teste contra um Postgres efêmero (Supabase local
ou container) que aplique as migrations e exercite as RPCs, com gate de `where`
superuser (sob superuser a RLS não é rede e o teste passa sem provar nada).

**Escopo:** infra de teste. Fatia própria, com spec quando priorizada.

## 2026-08-30 — Estorno e ajuste de recebimento

**Origem:** fatia 2 do Campo. A venda tem `void_sale_order`; o recebimento
nasceu sem equivalente. Lote registrado errado fica registrado, e com o saldo
só-leitura na edição de produto não há caminho no app para corrigir a
divergência entre o físico e o número.

**O que implementar:** estorno de lote (espelho do void) e/ou ajuste de contagem
registrado como movimento, com autor e motivo. Decidir qual dos dois resolve o
caso real antes de especificar.

**Escopo:** feature própria, com brainstorming/spec quando priorizada.

## 2026-08-30 — Fallback `|| 'Loja principal'` mascara produto sem local (app-wide)

**Origem:** Emenda 1 da fatia 2 do Campo (spec `2026-08-30-campo-fatia2-design.md`).
A decisão original de `register_receipt` era gravar `location = ''` num produto
novo sem loja escolhida — "não atribuído, visível em Todos os locais,
atribuível depois". A revisão do runbook derrubou essa premissa: o app desfaz
o vazio em três pontos, então a decisão nunca teria o efeito pretendido. A
Emenda 1 resolveu na origem (campo "Local de destino", obrigatório quando o
lote cria produto novo) e prometeu esta entrada para o defeito de fundo que a
motivou — sem tocá-lo, porque é comportamento app-wide, não desta fatia.

**Os pontos exatos** (conferidos abrindo cada arquivo na linha citada — a
numeração original desta entrada foi escrita contra o código anterior ao
commit de código desta leva e ficou errada; corrigida na revisão):
- `src/services/dashboardService.ts:111` —
  `location: str(row, 'location') || 'Loja principal'` (leitura: todo produto
  sem `location` no banco vira "Loja principal" ao montar a lista).
- `src/components/ProductsPage.tsx:149` — mesmo fallback ao abrir a edição de
  um produto (`location: product.location || 'Loja principal'`).
- `src/components/ProductsPage.tsx:234` — ao **salvar** a edição, o fallback
  deixa de ser só de leitura e é gravado de verdade
  (`const location = editDraft.location.trim() || 'Loja principal';`).
- `src/components/ProductsPage.tsx:169` — `startCreateProduct` grava
  `location: 'Loja principal'` hard-coded já no rascunho de um produto NOVO
  (não é fallback de leitura de um valor ausente — é o próprio valor inicial
  do formulário de criação, mas tem o mesmo efeito de nunca deixar "sem
  local" existir).
- `src/components/Dashboard.tsx:296` — o seletor de loja do menu mobile do
  header cai para uma lista hard-coded `['Loja principal']` quando
  `locations` (a lista de lojas conhecidas) vier vazia:
  `(locations.length ? locations : ['Loja principal']).map(...)`. Mesma
  família de problema, forma diferente: aqui não é o valor de um produto que
  vira "Loja principal", é a PRÓPRIA LISTA de opções do filtro que finge ter
  uma loja quando não tem nenhuma.

**Efeito:** um produto sem local nunca aparece como "não atribuído" — aparece
como se já estivesse em "Loja principal", entra no filtro daquela loja (o
seletor do header é derivado dos valores de `location` presentes via
`buildStoreFilterOptions`) e, na primeira edição, esse valor é materializado
no banco mesmo que ninguém tenha escolhido aquela loja. Um produto criado do
zero já nasce com "Loja principal" pelo mesmo motivo, mesmo num tenant que
nunca cadastrou essa loja em Configurações.

**A resolver numa spec própria:** se "sem local" deve virar um estado de
primeira classe na UI (visível como tal, não mascarado); se o default deveria
vir de configuração do tenant em vez de hard-coded no código (em pelo menos
cinco lugares agora); como migrar os produtos que já têm
`location = ''`/`NULL` gravado hoje.

**Achado relacionado, mesma área — duplicatas por caixa no filtro de loja do
header.** Observado no app real: o dropdown de loja do header (`Dashboard.tsx`,
via `buildStoreFilterOptions`) lista "Brasília Shopping" e
"BRASÍLIA SHOPPING", "Loja principal" e "LOJA PRINCIPAL" como opções
**separadas** — `buildStoreFilterOptions` deduplica com `Set<string>` sobre o
valor cru, sem normalizar caixa. O `select` de filtro de loja dentro da própria
`ProductsPage` (`locations`, também via `Set` sobre `product.location` cru) não
mostrou a mesma duplicação nos dados observados — hipótese não confirmada é que
o header agrega mais fontes (`tenant_product_options` + `sales_orders.location`
+ `products.location`), então pega variantes de caixa que só existem numa
dessas fontes. Não investigado a fundo; registrar aqui para quando a spec do
item acima for escrita, já que é o mesmo mecanismo (comparação de `location`
sem normalização).

## 2026-08-30 — SKU duplicado por caixa (case) credita a linha errada no recebimento

**Origem:** revisão final da fatia 2 do Campo, comprovado em Postgres real: o
índice único de `products` é `(tenant_id, sku)` — **case-sensitive** — e o
`DataImport` cria duplicatas assim via `upsert onConflict 'tenant_id,sku'`
quando o mesmo SKU chega em capitalizações diferentes entre importações
(`dup-1` numa leva, `DUP-1` noutra: dois produtos, não um upsert).

**O problema:** `productBySku` do `ReceiptModal` é um `Map` chaveado por
`sku.trim().toUpperCase()` — quando duas linhas do catálogo normalizam para a
mesma chave, a última da lista vence (last-write-wins), em silêncio. A RPC
`register_receipt` também busca por `upper(trim(sku))` e credita **uma** linha
real (não corrompe dado), mas não necessariamente a mesma que a tela estava
mostrando quando o usuário conferiu o saldo antes de salvar. Nenhum erro,
nenhum aviso — o recebimento simplesmente pode ter creditado o produto errado.

**Duas saídas possíveis:**
- **Busca determinística:** quando `upper(trim(sku))` casar mais de um produto
  do tenant, recusar a operação (recebimento, e possivelmente venda) com um
  erro explícito em vez de escolher silenciosamente.
- **Normalização de ponta a ponta:** índice único de `products` sobre
  `(tenant_id, upper(trim(sku)))`, o que exige primeiro fundir as duplicatas já
  existentes em produção (decidir qual saldo/preço/nome de cada par prevalece)
  e ajustar o `DataImport` para normalizar antes do `upsert`.

**Escopo:** fix/feature próprio, com brainstorming/spec quando priorizada —
decidir qual das duas saídas, e como tratar as duplicatas que já existem hoje.

**Enquanto isso:** o runbook de e2e da fatia 2
(`docs/superpowers/runbooks/2026-08-30-campo-fatia2-e2e.md`, Caso 0 — pré-voo)
roda a query que detecta duplicatas por caixa nos dados do tenant de teste
antes de liberar a fatia; achar alguma linha é motivo de parar e reportar, não
de seguir o roteiro.

## 2026-08-30 — Tipos de recebimento em snake_case (resolver na fatia 3)

**Origem:** revisão da Task 1 da fatia 2. `Receipt` e `ReceiptItem`
(`src/types/index.ts`) são row shapes do banco exportados como tipo de domínio,
em snake_case, enquanto os tipos do módulo Campo (`FieldContact`, `Interaction`)
são camelCase e o `fieldService` mantém o row snake_case como tipo local privado,
mapeando na fronteira.

**Por que ficou assim:** na fatia 2 o único consumidor é `data as Receipt` no
`receiptService` — nenhum componente lê os campos, porque a tela de listagem de
recebimentos foi cortada. Um mapeamento agora não teria o que mapear.

**Quando resolver:** na **fatia 3** (relatório de campo), junto com o primeiro
consumidor de tela desses tipos — converter para camelCase e mapear na fronteira
do serviço, como o `fieldService` faz. Anotado também no WAR-4.
