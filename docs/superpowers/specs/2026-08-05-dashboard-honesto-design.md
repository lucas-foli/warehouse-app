# Dashboard honesto — remover dado fabricado

> Fatia única, tema único: **eliminar todo número fabricado exibido no Dashboard**.
> Fecha a dívida deixada pelos PRs #65/#66 (princípio "nada fabricado na tela") atacando
> os quatro achados de dado fabricado ainda vivos: BUG-6, BUG-7, BUG-8, BUG-10.
> Data: 2026-08-05.

## Contexto

O Dashboard já tem, no hook `useDashboardData`, todos os dados reais de que precisa:
`buildHistoryFromOrders`, `buildRecentDailySalesFromOrders`, `buildCategorySalesFromItems`
e `aggregateSellers` produzem séries a partir de `salesOrders`/`salesItems` reais
(voided excluído, filtrado por loja). O dado fabricado sobrevive em quatro pontos que ou
usam funções `*FromProducts`/`Math.random` como fallback, ou inventam uma fração fixa
(custo = venda × 0.4). Esta fatia troca cada um por dado real ou por empty state honesto.

Nenhuma migration. Nenhuma mudança de schema. Só front + funções puras.

## Escopo — quatro correções

### 1. BUG-6 — Faturamento do dia real · `src/components/OverviewPage.tsx`

- **Atual:** `dailyRevenue = monthlyRevenue / 30`, onde `monthlyRevenue = history[last].value`
  (`OverviewPage.tsx:52-53`). Divide o faturamento do mês por 30 — não é o faturamento de hoje.
- **Fix:** o componente já recebe `salesTrend` (série diária real, via `visibleSalesTrend` no
  Dashboard, que respeita o filtro de loja). O último ponto da série é hoje. Trocar por:
  `const dailyRevenue = salesTrend[salesTrend.length - 1]?.value ?? 0;`
- **Sem props novas.** Sem venda hoje → série termina em 0 → card mostra R$ 0 (honesto).
- **Não mexer** no `detail` "Tendência positiva/atenção" (deriva de `monthlyChange`, que é sobre
  o mês e permanece válido) nem no card "Faturamento Total".

### 2. BUG-8 — Matar histórico/performance sintéticos · `src/utils/helpers.ts` + `src/hooks/useDashboardData.ts`

- **Atual:** `buildHistoryFromProducts` (meses hardcoded Jul–Nov/25, `helpers.ts:148-172`) entra
  como fallback de `history` em `useDashboardData.ts:91-92`. `buildSellerPerformanceFromSellers`
  (`helpers.ts:394-406`, meses hardcoded) está órfã. `buildMultiSellerPerformance` (Math.random)
  será substituída no passo 4.
- **Fix:**
  - Deletar `buildHistoryFromProducts` e a linha de fallback em `useDashboardData.ts:91-92`.
    `history` passa a vir só de `buildHistoryFromOrders` (real); sem pedidos → `[]` → empty state
    que já existe no componente.
  - Deletar `buildSellerPerformanceFromSellers` (órfã, confirmar zero usos antes de remover).
  - Deletar `buildMultiSellerPerformance` (substituída no passo 4).
  - Remover imports órfãos resultantes em `useDashboardData.ts` e `SellersPage.tsx`.

### 3. BUG-7 — Remover custo/margem fabricado · `src/types/index.ts` + `src/utils/helpers.ts` + `src/components/OverviewPage.tsx` + `docs/backlog.md`

- **Atual:** `custo = venda * 0.4` em `buildCategorySalesFromItems` (`helpers.ts:133`) e
  `buildCategorySalesFromProducts` (`helpers.ts:94`). Exibido em "Categorias — vendas e custos"
  (`OverviewPage.tsx:147,162`). Não existe custo real no modelo (`Product` só tem `price`).
- **Fix:**
  - Remover o campo `custo` de `CategorySale` (`types/index.ts:22`).
  - Remover o cálculo e a chave `custo` das duas funções `buildCategorySales*` (mantendo
    `name`/`venda`/`share`, que são reais).
  - UI: remover a linha `<span>Custo: …</span>` (`OverviewPage.tsx:162`) e renomear a seção
    "Categorias — vendas e custos" → **"Categorias — vendas"** (`OverviewPage.tsx:147`).
  - Registrar em `docs/backlog.md` a feature futura **"Margem real (custo por produto)"**:
    custo no modelo `Product` (migration + UI de custo por produto) → margem real por categoria.
- **Verificar:** `custo` de `CategorySale` não é lido em nenhum outro consumidor antes de remover.

### 4. BUG-10 — Série real por vendedor/dia · novo util + `src/components/SellersPage.tsx` + `src/components/Dashboard.tsx`

- **Atual:** `buildMultiSellerPerformance` (`helpers.ts:408-433`) gera 30 dias com `Math.random()`
  distribuindo `bruto/30`; consumido em `SellersPage.tsx:60`. Números inventados no tooltip.
- **Fix:**
  - **Nova função pura** `buildSellerDailyPerformance(sellers, orders, days = 30, referenceDate?)`
    (arquivo próprio, ex.: `src/utils/sellerDailyPerformance.ts`, no espírito de `sellerRollup.ts`).
    - Agrega `total_amount` real por vendedor por dia a partir de `orders`.
    - Casamento **dual-key** idêntico ao `aggregateSellers`: resolve o vendedor por `seller_id`
      OU `seller_external_id` contra os `sellers` passados (indexar cada seller sob `id` e
      `externalId`). Orders sem vendedor resolvível são ignorados (não vira "desconhecido" aqui —
      o gráfico plota só os `sellersForDisplay`).
    - Janela: últimos `days` dias terminando em `referenceDate ?? hoje` (mesmo padrão de
      `buildRecentDailySalesFromOrders`: um ponto por dia, incluindo dias com 0).
    - Retorno: `Array<{ month: string } & Record<string, number>>` — uma linha por dia,
      `month` = rótulo `dd/mmm`, uma chave por `seller.nome` com o faturamento do dia (0 quando
      não houve venda daquele vendedor no dia).
  - **Empty state explícito:** se nenhum vendedor teve venda em nenhum dia da janela, a função
    retorna `[]` (consistente com `buildHistoryFromOrders` e as demais). Se houve ao menos uma
    venda, retorna a janela completa de `days` pontos (dias sem venda = 0), para o eixo não ter
    buracos.
  - `SellersPage` recebe nova prop `salesOrders: SalesOrder[]` e chama
    `buildSellerDailyPerformance(sellersForDisplay, salesOrders)`. Remove o import de
    `buildMultiSellerPerformance`. Série `[]` → o componente cai no empty state atual do gráfico.
  - `Dashboard.tsx` passa `salesOrders={visibleActiveOrders}` ao `<SellersPage>` (`:419-427`) —
    **a mesma fonte** que alimenta `visibleVendedores`, para série e agregados baterem sob o
    filtro de loja.

## Fora de escopo

- **Custo/margem real** (BUG-7 fundo): vira feature própria, registrada no `docs/backlog.md`.
- **Card "Faturamento Total — mês atual":** usa `history[last]` (último mês *com vendas*); se não
  houver venda no mês corrente, o rótulo "mês atual" fica impreciso. Não está em `bugs.md`.
  Anotado aqui como candidato a entrada nova no backlog; **não corrigido nesta fatia**.
- Nenhuma mudança de schema, RPC ou migration.

## Testes (TDD — funções puras primeiro)

Anotação `mata:` = a mutação que o teste tem de derrubar (gate adversarial antes da task 1).

- **`buildSellerDailyPerformance`** (`src/utils/sellerDailyPerformance.test.ts`):
  - Orders em datas conhecidas dentro da janela → série com o valor certo no dia certo.
    `mata:` retornar série vazia / constante / com dias trocados.
  - **Invariante de conciliação:** soma de todos os dias de um vendedor na série ==
    `bruto` que `aggregateSellers` calcula para o mesmo conjunto de orders.
    `mata:` escalar/dividir o valor (o Math.random original passaria a soma errada).
  - Dual-key: venda registrada só com `seller_id` (sem `external_id`) cai no vendedor certo;
    venda importada só com `seller_external_id` idem. `mata:` casar só por um dos campos.
  - Order fora da janela de `days` é ignorado; dia sem venda = 0 explícito.
    `mata:` incluir orders antigos / omitir dias vazios.
  - (Voided já vem filtrado por quem chama — o teste passa orders ativos; documentar isso.)
- **BUG-6** (faturamento do dia): teste do cálculo `salesTrend[last]?.value ?? 0`, cobrindo série
  vazia → 0 e série não-vazia → último valor. `mata:` voltar a dividir por 30 / pegar o primeiro
  ponto. (Extrair um helper puro se facilitar o teste sem montar o componente.)
- **Regressão BUG-8:** com orders reais, `history` continua vindo de `buildHistoryFromOrders`
  (o caminho feliz não pode quebrar ao remover o fallback). `mata:` remover a fonte real junto.
- **Paridade:** todo caminho que hoje tem teste sobre custo de categoria deve ser atualizado, não
  só apagado — se `custo` era coberto, o teste vira "não expõe custo".

## Verificação

- Typecheck/build: **`npx tsc -b`** ou **`npm run build`** — NÃO `tsc --noEmit` (o tsconfig raiz
  tem `files: []` e não checa nada).
- Testes unitários das funções puras verdes.
- E2e manual (app real): criar loja → vender **hoje** → card "Faturamento do dia" = venda de hoje
  (não mês÷30); seção "Categorias — vendas" sem linha de custo; gráfico do vendedor com valores
  que batem com as barras de faturamento (soma da série == bruto).

## Ordem das tasks

1. BUG-8 — limpeza (deletar funções/fallback fabricados, imports órfãos).
2. BUG-7 — remover custo do tipo/funções/UI + entrada no backlog.
3. BUG-6 — faturamento do dia real.
4. BUG-10 — `buildSellerDailyPerformance` (TDD) + fiação `SellersPage`/`Dashboard` (a maior).
