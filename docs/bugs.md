# Backlog de bugs — warehouse-app

> Bugs capturados durante uso/teste manual, com o comportamento atual já confirmado no
> código. Não implementados ainda. Ordem = ordem de registro.

## 2026-07-24 — Fluxo "Novo Produto" (`src/components/ProductsPage.tsx`)

Todos os três se referem ao mesmo painel: o drawer aberto por **Novo Produto**
(`startCreateProduct`, `ProductsPage.tsx:156`), renderizado em `ProductsPage.tsx:737-960`.

### BUG-1 — O painel de novo produto deve ser uma modal responsiva

- **Atual:** não é modal. No desktop o wrapper usa `md:contents`
  (`ProductsPage.tsx:742`), então o `Card` cai como mais uma coluna do grid da página —
  painel inline lado a lado com a tabela. No mobile vira bottom sheet
  (`fixed inset-x-0 bottom-0`, com backdrop `md:hidden` em `ProductsPage.tsx:740`).
- **Esperado:** modal centralizada e responsiva em todos os breakpoints — backdrop em
  todas as larguras, largura máxima com scroll interno, fechar por backdrop/Esc, foco
  preso no diálogo, `role="dialog"`/`aria-modal`.
- **Nota:** o mesmo bloco serve os modos `create` e `edit` (`drawerMode`). Decidir se a
  modal vale para os dois ou só para `create`.
- **Referência de padrão:** já existe modal no projeto — `products/SaleOrderModal.tsx` e
  `products/ConfirmDialog.tsx`.

### BUG-2 — Apenas Nome e SKU são obrigatórios

- **Atual:** a validação de submit já exige só `sku` e `name`
  (`ProductsPage.tsx:225-229`), e os demais campos têm default ou aceitam nulo
  (`status` → `ESTOQUE`, `location` → `Loja principal`, `qty` → `0`, `min`/`price`/
  `barcode`/`image` → nulos). O que falta é a **UI não comunicar isso**: nenhum campo tem
  marcação de obrigatório, nenhum input tem `required`/`aria-required`, e o erro
  ("SKU and Name are required.") só aparece depois de clicar em Salvar.
- **Esperado:** Nome e SKU marcados visualmente como obrigatórios (asterisco/label), os
  demais explicitamente opcionais, e erro por campo em vez de só a mensagem global.

### BUG-3 — Salvar habilita ao preencher o primeiro campo

- **Atual:** `disabled={!editDirty || editSaving || !tenantId}`
  (`ProductsPage.tsx:933`). `editDirty` vira `true` no primeiro `updateDraft`
  (`ProductsPage.tsx:176-179`), então digitar em qualquer campo — inclusive Qtd ou
  Preço — já habilita Salvar no modo `create`.
- **Esperado:** no modo `create`, Salvar só habilita com `sku.trim()` e `name.trim()`
  preenchidos. O modo `edit` mantém a regra atual (dirty basta).

## 2026-07-31 — Achados da revisão do PR #62 (fonte única de verdade do estado de produto)

Os dois foram encontrados durante a revisão do PR #62, são **anteriores** a ele e não foram
agravados por ele. Ficaram fora daquela fatia por não terem relação com a raiz que ela
atacava.

### BUG-4 — A foto de um produto importado por CSV volta a ser a antiga depois de editada

Duas colunas guardam imagem (`image` e `image_url`, ambas em `products`), e cada caminho
grava numa delas:

- **Atual:** o drawer de produto (create e edit) grava a coluna **legada** `image`
  (`ProductsPage.tsx:231`, no `payload`). O importador de CSV normaliza `image`/`imagem`/
  `foto`/`photo` para **`image_url`** (`src/utils/csv.ts:239-243`) e grava lá
  (`DataImport.tsx:369`). O normalizador de leitura prefere `image_url`
  (`dashboardService.ts:116`: `str(row, 'image_url', 'image')`).
- **Consequência:** para um produto que veio do importador (que tem `image_url`
  preenchido), editar a foto pelo drawer grava em `image` e deixa `image_url` intacto.
  Enquanto o estado local vive, a foto nova aparece; no próximo refetch o normalizador lê
  `image_url` de novo e **a foto antiga volta**. Para produtos criados pelo drawer o
  problema não aparece, porque `image_url` nasce nulo e o fallback pega `image`.
- **Esperado:** um caminho só. Escolher a coluna canônica (`image_url` é a que a migration
  `20260212110000` introduziu e a que o importador usa), fazer o drawer gravar nela, e
  decidir o destino da coluna legada — migrar os valores de `image` e parar de lê-la, ou
  manter só como fallback de leitura.
- **Nota:** verificar se há dados em produção nas duas colunas antes de escolher.

### BUG-5 — Venda recusada por SKU inativo não diz qual item é o problema

- **Atual:** o trigger `validate_sales_item_product` (migration
  `20260212110000_products_image_url_and_sales_item_guard.sql`) levanta
  `sales_item_inactive_sku` **com o SKU no `detail` do erro**. Mas `friendlySaleError`
  (`src/services/salesService.ts:28-33`) só procura o código dentro da `message` e
  devolve uma frase fixa — o `detail` é descartado.
- **Consequência:** um carrinho com vários itens é rejeitado inteiro com "Este produto
  está inativo e não pode ser vendido.", sem dizer qual linha remover. O usuário tem que
  descobrir por tentativa e erro.
- **Quando acontece:** o front já bloqueia produto inativo no dropdown e no scanner (PR
  #62), então o caminho que sobra é o cliente ficar desatualizado — alguém desativa o
  produto em outra sessão e este front ainda não refetchou. Aí a venda chega ao banco e o
  trigger corta.
- **Esperado:** propagar o SKU do `detail` para a mensagem, algo como "SKU 214 está
  inativo e não pode ser vendido — remova-o do carrinho". Vale para os outros códigos que
  também carregam `detail` (`sales_item_unknown_sku`, por exemplo).

## 2026-08-05 — Gráfico de performance de vendedor (`src/components/SellersPage.tsx`)

### BUG-10 — "Performance por período" mostra dados fabricados (RESOLVIDO — PR #71)

> **Resolvido** em PR #71 (`worktree-dashboard-honesto`), e2e validado no app real
> (tenant ACME): `buildMultiSellerPerformance` (Math.random) trocada por
> `buildSellerDailyPerformance` (`src/utils/sellerDailyPerformance.ts`) — série diária
> real agregada de `salesOrders` por vendedor, casamento dual-key idêntico a
> `aggregateSellers`, janela de 30 dias, empty state `[]`. Conciliação (soma da série ==
> `bruto`) coberta por teste unitário e conferida na tela (série soma 40 == combinado $40;
> dias sem venda = 0, sem ruído aleatório). Foi o "Esperado" abaixo (plotar vendas reais).

> Numeração: o PR #66 (aberto) reserva BUG-6..9; este entra como BUG-10 para não colidir.

- **Atual:** `buildMultiSellerPerformance` (`src/utils/helpers.ts`) gera a série diária dos
  últimos 30 dias com `Math.random()` + um "trend", distribuindo `seller.bruto / 30` por dia.
  Não são vendas reais por dia — o tooltip exibe números inventados (ex.: "Bruno Sales: 1" em
  10/jul sem nenhuma venda real naquele dia; a venda real do Bruno é 1 pedido de $20).
- **Consequência:** dado fabricado na tela, contra o princípio "nada fabricado" firmado no
  PR #65. Enganoso para o dono do negócio, que lê o gráfico como atividade real.
- **Esperado:** plotar vendas reais agregadas por período (a partir de `salesOrders`/
  `salesItems` reais, no espírito do rollup já existente), ou remover o gráfico se não houver
  série real barata de montar.
- **Origem:** descoberto no e2e do CRUD de clientes/vendedores (2026-08-05). Pré-existente,
  não introduzido por essa obra.

## 2026-08-05 — Integridade do import CSV de clientes/vendedores (`src/components/DataImport.tsx`)

Tema comum: o import trata identidade (external_id/e-mail) diferente do CRUD da UI. Três
achados no e2e; o primeiro está confirmado no código, os outros dois precisam de reprodução
controlada antes de fechar a causa.

### BUG-11 — "Limpar dados antes de importar" desvincula as vendas existentes (RESOLVIDO — PR #68)

> **Resolvido** em PR #68 (`feat/import-csv-integrity`), e2e validado 2026-08-05: ao marcar
> "Limpar dados" para clientes/vendedores, conta as vendas em risco, mostra aviso e exige
> confirmação inline (2º clique) antes de limpar. Foi a "Mitigação escolhida" abaixo.

- **Atual:** o checkbox faz `DELETE FROM sellers/clients WHERE tenant_id` (`DataImport.tsx:355`).
  O FK é `on delete set null`, então toda venda vinculada perde `seller_id`/`client_id`. O
  reimport recria os registros com uuids novos. No rollup (`aggregateSellers`, `sellerRollup.ts`)
  as vendas casam por `seller_id` OU `seller_external_id`: as importadas por CSV re-casam pelo
  external_id; as **registradas na tela** têm só `seller_id` (agora nulo) e nenhum external_id
  (`registerSaleOrder` grava só `p_seller_id`/`p_client_id` — `salesService.ts:46-47`) → viram
  "Vendedor desconhecido".
- **Mitigação escolhida (proteção no checkbox):** ao marcar "Limpar dados" para clientes/
  vendedores, avisar/contar as vendas que serão desvinculadas (espelha a proteção do Excluir
  individual). Mitigação sem código: reimportar SEM "limpar" faz upsert por external_id, mantém
  o uuid e preserva os vínculos.
- **Fix de fundo (fatia maior):** a venda registrada na tela gravar também `seller_external_id`/
  `client_external_id` (mexe no RPC de venda) — aí qualquer reimport re-vincula por external_id.

### BUG-12 — Import não valida e-mail único (RESOLVIDO — PR #68)

> **Resolvido** em PR #68, e2e validado 2026-08-05: o import pula e reporta linhas com e-mail
> duplicado (duplicata interna do CSV ou e-mail já no banco sob external_id diferente; mesmo
> external_id = update legítimo). Comparação case-insensitive na leitura (busca `email is not null`
> + compare lowercase em memória, sem `.in`); a gravação do e-mail não muda. A hipótese abaixo
> (dedup só por external_id) estava certa.

- **Sintoma relatado:** a UI bloqueia e-mail duplicado (fix-pack 2), mas o import aceita e-mails
  iguais no upload. Hipótese: o import só deduplica por `external_id` (upsert `onConflict`); se os
  external_ids diferirem mas o e-mail for igual, cria dois registros com o mesmo e-mail — a
  proteção de e-mail único vive só no modal, não no caminho do import.
- **Esperado:** decidir a regra (o import deve rejeitar/deduplicar por e-mail também?) e alinhar
  import e UI.

### BUG-13 — Reimport sem "limpar" cria duplicatas de mesmo external_id (RESOLVIDO para frente — PR #67)

> **Resolvido para frente** pelo PR #67: todos os caminhos de gravação normalizam external_id em
> maiúsculas (`normalizeKey`), então novos registros casam no `onConflict`. A hipótese de case
> mismatch se confirmou. Sem código pendente nesta obra (fora do escopo do #68); registros antigos
> criados em minúsculas antes de 2026-08-05 seguem poluídos — backfill não foi feito.

- **Sintoma relatado:** reimportar "os mesmos ids com infos diferentes" sem marcar limpar criou
  vendedores novos em vez de atualizar — dois registros com o "mesmo id". Hipótese: case
  mismatch — o índice único `(tenant_id, external_id)` é case-sensitive; registros criados
  manualmente ANTES do fix de maiúsculas (2026-08-05) ficaram minúsculos, então o upsert do
  import (que faz `normalizeKey`=maiúsculas) não casa no `onConflict` e INSERE um novo. Precisa
  confirmar; se for isso, some para registros novos, mas os antigos poluídos persistem e o import
  case-sensitive segue frágil.
- **Esperado:** normalizar/casar external_id de forma case-insensitive no upsert do import, e/ou
  backfill dos registros antigos.

## 2026-08-05 — Backdrop de modal deslocado pelo espaçamento do shell (`src/components/Dashboard.tsx`)

### BUG-14 — O backdrop escurecido da modal não cobre o topo da tela (CONFIRMADO)

- **Atual:** o overlay de toda modal é `fixed inset-0 z-50 bg-black/60`
  (`sellers/SellerFormModal.tsx:134`, e idêntico em `products/SaleOrderModal.tsx:193`,
  `products/ConfirmDialog.tsx:40`, `products/BulkResultDialog.tsx:15`). A modal é renderizada
  inline dentro da página, que por sua vez é filha do wrapper de conteúdo do shell
  `<div className="w-full space-y-10 ... p-8 sm:p-10">` (`Dashboard.tsx:334`). O utilitário
  `space-y-10` do Tailwind aplica `margin-top: 2.5rem` (40px) a todo filho que não seja o primeiro
  (`.space-y-10 > * + *`). O overlay é um filho não-primeiro desse container, então herda
  `margin-top: 40px` — e num elemento `position: fixed; inset: 0` esse margin desloca a caixa 40px
  para baixo. Confirmado no DOM ao vivo: overlay com `inset:0`, `transform:none`, `html`/`body` sem
  transform e sem scroll, mas `margin-top: 40px` → rect `top:40`, deixando os 40px superiores da
  viewport (a faixa do `<header>`) sem o escurecimento.
- **Consequência:** o backdrop não cobre a tela inteira — sobra uma faixa clara no topo (o header
  fica sem escurecer), quebrando a sensação de foco da modal. É sistêmico: atinge qualquer modal
  aberta a partir de uma página do Dashboard (vendedores, clientes, produtos, confirmações), não só
  a de vendedor.
- **Esperado:** o backdrop cobre 100% da viewport em todos os breakpoints, independente da posição
  da modal na árvore. O overlay não deve participar do fluxo de espaçamento vertical do shell.
- **Referência de padrão / fix sugerido:** renderizar a modal via `createPortal` para
  `document.body` (react-dom já é dependência), que a tira da árvore do `space-y` e de qualquer
  containing block ancestral — padrão canônico de modal e correção única para todas de uma vez.
  Alternativa local e frágil: neutralizar o margin herdado no próprio overlay (ex.: `!mt-0`), sem
  resolver a raiz (modais viverem dentro do container de espaçamento).
- **Origem:** reportado no uso manual (2026-08-05, modal "Novo vendedor"); causa raiz confirmada no
  DOM renderizado, não só no código.

## 2026-08-27 — BUG-15: campo de SKU colapsado no registro de visita (CORRIGIDO)

**Origem:** e2e manual da fatia 1 do Campo (seção 1), Lucas.

O input de SKU das amostras renderizava com poucos pixels e o de quantidade
ocupava a linha inteira — impossível ver qual produto estava sendo escolhido.

**Causa:** a constante `fieldClass` do `QuickLogModal` embutia `w-full`. No input
de quantidade a string ficava `w-full … w-20`; como `.w-full` é emitido DEPOIS
de `.w-20` no CSS gerado pelo Tailwind (byte 7409 vs 7204, mesma
especificidade), `w-full` vencia. O SKU, com `flex-1` (basis 0), colapsava. O
mesmo conflito afetava o input de data (`w-auto`).

**Fix:** `fieldBase` sem largura + larguras explícitas na linha das amostras
(SKU `flex-1 min-w-0`, qty `w-20 shrink-0`). Commit 6ae5bfa.

## 2026-08-27 — BUG-16: criar fornecedor não dava feedback (CORRIGIDO)

**Origem:** e2e manual da fatia 1 do Campo (seção 1), Lucas.

Cadastrar fornecedor fechava o formulário sem nenhuma confirmação. Como o
reload é silencioso, o usuário não sabia se tinha funcionado — e tentou de novo,
tomando "Já existe um contato com esse nome".

**Fix:** confirmação temporária "Fornecedor X cadastrado." acima do botão de
novo fornecedor, limpa ao reabrir o formulário. Commit 6ae5bfa.
