# Preço ausente ≠ preço zero — Design

## Problema

`price numeric` é NULLABLE no schema (`supabase/migrations/20251226000100_multitenant.sql`).
Em `src/services/dashboardService.ts`, o helper `num(...)` faz `Number('') === 0`, então
`price: num('price') ?? currency(...)` devolve **0** quando o preço é NULL — não `undefined`.

Consequência: `SaleOrderModal.tsx` tem o caminho correto para "preço não cadastrado"
(`selectedProduct.price !== undefined ? String(price) : ''` → campo vazio, obriga a digitar),
mas nunca o alcança: recebe `0` e pré-preenche a venda com R$ 0,00. Um item sem preço entra no
carrinho de graça e a venda fecha assim, sem alertar.

Bug irmão: `total_sold` sofre do mesmo `num(...) → 0`.

## Fato decisivo sobre os aliases

`src/utils/csv.ts` normaliza **todos** os aliases de cabeçalho (`descricao`→`name`,
`preco_venda`→`price`, `foto`→`image_url`, `quantidade_estoque`→`qty`, …) para os nomes
**canônicos** de coluna *antes* do upsert (`HEADER_ALIASES` + `ProductUpsertRow`). Como
`fetchProducts` lê `select('*')` de uma tabela de schema fixo, as linhas do DB só têm chaves
canônicas. Portanto, **todo alias não-canônico no map é código comprovadamente morto** — nunca
casa com uma chave real de linha.

Colunas reais de `products`: `id, tenant_id, sku, name, barcode, status, location, qty, min,
price, total_sold, image, image_url, is_active, created_at, updated_at`.

## Mudanças (arquivo único: `src/services/dashboardService.ts`)

1. **`price` e `total_sold` → `numOrUndefined`** (mesmo padrão já aplicado a `min`):
   - `price: numOrUndefined('price')` — NULL vira `undefined`, não 0.
   - `totalSold: numOrUndefined('total_sold')`.

2. **Remover fallback morto + helper órfão:**
   - Tirar `?? currency('preco_venda', 'Preço de Venda Normal')` de `price` (colunas
     inexistentes; `??` inalcançável com 0).
   - `currency` fica órfão → remover o helper.

3. **Limpar aliases mortos** (enxugar cada campo para as colunas reais):
   - `name: str('name')`, `sku: str('sku')`, `barcode: str('barcode')`,
     `status: str('status')`, `location: str('location')`, `qty: num('qty')`,
     `min: numOrUndefined('min')`, `image: str('image_url', 'image')`.
   - Atualizar o comentário do `numOrUndefined` (hoje restringe o padrão a `min`).

## Consumidores de `product.price` (verificados — sem regressão)

- `SaleOrderModal.tsx:88,101` — `price !== undefined ? String : ''` → agora **alcança** o campo
  vazio (o fix pretendido).
- `ProductsPage.tsx:146` (edição) — idem, campo vazio em vez de "0".
- `ProductsPage.tsx:614,717` e `helpers.ts:92,156` — usam `price ?` (falsy) ou
  `price * totalSold`; `undefined` se comporta como `0` já se comportava (renderiza "—", pula
  soma). Sem regressão.

## Testes (TDD — novo `src/services/dashboardService.test.ts`)

Mockando o supabase client:
- `price` NULL → `undefined` (não 0) — o teste do bug.
- `total_sold` NULL → `undefined`.
- `price`/`total_sold` presentes → número correto.
- Regressão: `qty` NULL/ausente → `0` (semântica de `num` preservada).

## Fora de escopo (apenas reportado)

`fetchProducts` nunca mapeia `is_active`, então `SaleOrderModal` trata todo produto como
vendável (`p.is_active !== false` com `undefined`). Bug latente **não relacionado** a preço —
não será tocado nesta fatia.

Sem migração nesta fatia.
