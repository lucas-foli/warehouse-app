# Estado de produto com uma fonte de verdade só

Data: 2026-07-28
Branch: `fix/product-state-single-source` (base: `origin/main` @ 61e42d2, com o PR #61 já mergeado)

## Problema

O estado de `products` no front é populado por duas origens que discordam:

1. O mapper de `fetchProducts` (`src/services/dashboardService.ts`), que normaliza linhas
   do banco em `Product` — mas esquece `is_active`.
2. Caminhos de mutação em `src/components/ProductsPage.tsx` que chamam
   `onProductUpdated(... as Product)` com a linha crua do banco, sem passar pelo mapper.

Disso saem três bugs com a mesma raiz de negócio: um produto desativado continua vendável.

### Bug A — produto inativo volta a ser vendável após refetch

O `return {...}` do mapper não inclui `is_active`, então todo produto vindo do fetch tem
`is_active: undefined`. `SaleOrderModal.tsx:50` filtra vendáveis com
`products.filter((p) => p.is_active !== false)`; como `undefined !== false` é `true`, todo
produto inativo passa.

Reprodução: Produtos → "Desativar" um produto (o estado local ganha `is_active: false` e ele
some do modal de venda, parecendo funcionar) → F5 → o mapper recarrega sem `is_active` → o
produto inativo reaparece no dropdown de venda.

Isso quebra uma promessa explícita do importador de CSV: "`is_active=false` bloqueia o SKU
para novas vendas" (`DataImport.tsx:84`).

### Bug B — produto recém-criado entra cru no estado

`ProductsPage.tsx:248` faz `onProductUpdated(data as Product)`, onde `data` é a linha crua de
`insert().select().single()`. `price` chega `null` (não `undefined`), então o campo de edição
mostra "null" e o "Adicionar item" do modal de venda pode travar até um refetch consertar. É o
mesmo problema null/undefined que o PR #61 corrigiu no mapper — o create path ficou de fora.

### Bug C — o scanner ignora `is_active` (descoberto durante o design)

`handleScan` (`SaleOrderModal.tsx:140`) busca com `findProductByCode(products, scan)`, sobre
`products` **inteiro**. Só o dropdown (237-238) e a pré-seleção (83) usam `sellableProducts`.
Portanto, mesmo com o Bug A corrigido, bipar o código de barras de um produto desativado ainda
o adiciona ao carrinho.

## Solução

### 1. `rowToProduct` como função pura exportada

Os helpers `str` / `num` / `currency` / `numOrUndefined` saem do corpo do `.map()` e sobem para
o escopo do módulo, recebendo a `row` como primeiro parâmetro (hoje são closures sobre `row`).
O `return {...}` atual vira o corpo de:

```ts
export function rowToProduct(row: Record<string, unknown>): Product
```

e `fetchProducts` passa a ser `data.map(rowToProduct)`.

Esta etapa não muda comportamento: os cinco testes que o PR #61 deixou em
`dashboardService.test.ts` continuam verdes sem edição, e é isso que dá segurança à extração.

### 2. `is_active` no mapper (resolve o Bug A)

Novo helper, fail-open estrito, que **não** passa pelo `str()` (que stringificaria o boolean):

```ts
const bool = (row: Record<string, unknown>, key: string) =>
    typeof row[key] === 'boolean' ? (row[key] as boolean) : undefined;
```

com `is_active: bool(row, 'is_active')` no objeto retornado.

Política para valor não-boolean: `undefined` (vendável). A coluna é
`is_active boolean not null default true`
(`supabase/migrations/20260212110000_products_image_url_and_sales_item_guard.sql`), então o caso
real é sempre boolean; o fail-open só garante que uma row estranha nunca esconda um produto da
venda por engano. Sem coerção de strings — não há caso real que a justifique.

### 3. Create path normalizado (resolve o Bug B)

`ProductsPage.tsx:248` passa a chamar `rowToProduct` sobre a linha do insert. Some o
`price: null`, e de brinde o produto novo nasce com `totalSold` e `created_at` corretos (hoje
ficam ausentes até um refetch). O insert grava a coluna `image` e o mapper lê `image_url` **ou**
`image`, então a imagem continua aparecendo.

### 4. Scanner filtrado (resolve o Bug C)

`handleScan` passa a buscar em `sellableProducts` em vez de `products`. Uma linha.

`productBySku` continua montado sobre `products` inteiro de propósito: uma linha já no carrinho
cujo produto foi desativado ainda precisa exibir nome e estoque.

## Fora de escopo

- **Update e bulk paths** (`ProductsPage.tsx:262`, `388`, `426`) ficam como estão. Eles fazem
  patch sobre um `Product` já normalizado (`{ ...existing, ... }`, `{ ...p, [field]: value }`),
  não sobre linha crua — o `as Product` ali é cast de índice dinâmico, não de row de banco.
  O spread é sobre um `Product`, mas o **valor** injetado pode ser `null`: o Apply do
  `BulkEditFieldPopover` não é desabilitado com o campo vazio (`:38-39`), e um preço ou
  mínimo apagado entrava no estado como `null`, com o mesmo sintoma do Bug B. Corrigido
  nesta fatia com a mesma coerção `?? undefined` do update path. A causa a montante — o
  Apply aceitar campo vazio sem confirmar — fica para uma fatia própria, que vai
  introduzir uma modal de confirmação com preview do que muda.
  Convergir o update para `.select().single()` + `rowToProduct` eliminaria a
  lista manual de campos e detectaria update bloqueado por RLS, mas muda uma query e o
  comportamento de erro; fica como observação no PR.
- **Migração**: nenhuma. A coluna `is_active` já existe.
- **`salesIntegrity.ts` / `DataImport.tsx`**: têm um `isActive` próprio, montado de uma query
  direta (`select('id, sku, is_active, status')`). Não passam pelo mapper e não mudam.

## Auditoria de consumidores

Único lugar no front que lê `Product.is_active`: `SaleOrderModal.tsx:50`. Não há badge, coluna
ou filtro de "inativo" na listagem de produtos. `BulkEditFieldPopover` apenas produz o valor a
ser gravado. Portanto, passar a popular o campo não altera nenhuma tela além do dropdown e do
scanner de venda — que é exatamente a correção pretendida.

## Testes

Em `src/services/dashboardService.test.ts` (arquivo já existente, com o mock de supabase do
PR #61 pronto para reuso):

1. `fetchProducts` mapeia `is_active: false` → `false` — **falha antes do fix** (vem `undefined`).
2. `fetchProducts` mapeia `is_active: true` → `true`.
3. Row sem `is_active` → `undefined` (política fail-open explicitada).
4. `rowToProduct` exportado normaliza `price: null` → `undefined` (contrato do create path).

Não há teste de componente para o `SaleOrderModal`. O filtro `p.is_active !== false` sempre
esteve correto — o defeito é do mapper, e os testes 1-3 cobrem a raiz. Testar o predicado
(ou extraí-lo só para poder testá-lo) cobriria código que nunca falhou. O repo não tem
`@testing-library/react`, e instalar uma stack de teste nova não cabe numa fatia de bugfix.
Os fixes 3 e 4 são verificados por leitura e pelo e2e manual abaixo.

## Verificação manual (e2e)

1. Desativar um produto → ele some do dropdown de venda → **F5** → continua fora (Bug A).
2. Com o produto desativado, bipar/digitar o código de barras dele no scanner → "Código não
   encontrado" em vez de entrar no carrinho (Bug C).
3. Criar produto novo sem preço → o campo de preço fica vazio, não "null"; o produto aparece
   na venda e o "Adicionar item" pede um preço em vez de travar (Bug B).

## Gates

Por commit: `npx tsc --noEmit` (0 erros), `npx vitest run` (tudo passa), eslint limpo nos
arquivos tocados. Baseline da worktree: **96 testes**, 0 erros de tsc.

Há ~6 warnings de eslint pré-existentes fora desta fatia (LoginForm, RequestsPage, MembersPage,
JoinRequestsPage, ProductOptionsPage, PlatformAdminContext) — não tocar.
