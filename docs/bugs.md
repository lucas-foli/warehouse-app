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

## 2026-08-04 — Achados do e2e manual (criar loja → produtos → convite → venda → dashboard)

E2e ponta a ponta numa loja nova (`loja-teste-e2e`) via `/demo` → aprovação admin →
convite → onboarding → 1 produto → 1 venda. O fallback de faturamento fantasma
(`monthlyRevenue ?? 574661`) já está sendo corrigido pelo PR #65 (`?? 0`) e por isso não
entra aqui. Os quatro abaixo **não** são cobertos pelo #65 (ele não toca `helpers.ts` nem
`SetPassword.tsx`).

### BUG-6 — "Faturamento do dia" mostra a média diária do mês, não o dia

- **Atual:** `src/components/OverviewPage.tsx:52` → `const dailyRevenue = monthlyRevenue / 30;`.
  O card "Faturamento do dia" (`OverviewPage.tsx:86-93`) exibe o faturamento do mês
  corrente dividido por 30. `monthlyRevenue` = `latestMonth?.value` (history do mês).
- **Consequência:** registrei uma única venda de R$ 399,80 hoje e o card "Faturamento do
  dia" mostrou **R$ 13** (399,80 / 30), não R$ 399,80. O rótulo "do dia" comunica algo que
  o número não é.
- **Esperado:** somar as vendas cujo `sold_at` é hoje para o card do dia — ou renomear o
  card para deixar explícito que é média diária do mês.
- **Nota:** o PR #65 troca o fallback `?? 574661` por `?? 0` mas mantém a divisão por 30,
  então o problema persiste em qualquer loja com vendas.

### BUG-7 — Custo/margem do dashboard são fabricados (sempre 40% da venda)

- **Atual:** `src/utils/helpers.ts:94` (`buildCategorySalesFromProducts`) e
  `helpers.ts:133` (`buildCategorySalesFromItems`) → `custo = venda * 0.4`. O card
  "Categorias — vendas e custos" (`OverviewPage.tsx`) exibe esse custo e o share.
- **Consequência:** cadastrei um produto **sem informar custo** e vendi; o dashboard
  mostrou "Custo R$ 159,92" = exatos 40% da venda de R$ 399,80. Não há campo de custo real
  no produto — a margem de 60% é sempre presumida e apresentada como se fosse real.
- **Esperado:** usar custo real (adicionar custo ao produto e somar por item vendido), ou
  rotular o card como estimativa/remover até existir custo real.

### BUG-8 — Histórico/tendência mensal é sintético quando não há vendas

- **Atual:** `src/hooks/useDashboardData.ts:90-92` usa `buildHistoryFromOrders` quando há
  pedidos reais; senão cai em `buildHistoryFromProducts` (`helpers.ts:166-170`), que
  distribui o total dos produtos em proporções fixas (0.18/0.22/0.20/0.19/0.21) em meses
  **hardcoded Jul–Nov/25**.
- **Consequência:** uma loja com produtos mas sem vendas mostra faturamento mensal e
  gráfico de tendência inventados, ancorados em meses do passado, independente da data
  atual.
- **Esperado:** sem vendas, histórico/tendência deve ser empty state honesto — não números
  fabricados. Mesmo espírito do "empty states honestos" do PR #65, mas `helpers.ts` não é
  tocado por ele.
- **Nota:** confirmado no código; não reproduzido na UI nesta sessão (a loja de teste
  passou direto de "sem produto" para "com venda").

### BUG-9 — Copy do set-password fala em "recuperação" também no fluxo de convite

- **Atual:** `src/components/SetPassword.tsx:57` → "Escolha uma nova senha para concluir a
  **recuperação**." O mesmo componente atende o link de **convite** (`type=invite`,
  `approve_signup_request` → `inviteUserByEmail`) e o de recuperação de senha.
- **Consequência:** um dono de loja recém-aprovado clica em "Accept the invite" e a tela
  de definir senha fala em "concluir a recuperação" — termo errado para quem nunca teve
  senha.
- **Esperado:** texto neutro ("Defina sua senha para acessar sua conta") ou condicional ao
  tipo (invite vs recovery).
