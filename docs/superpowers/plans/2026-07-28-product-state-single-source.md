# Estado de produto com uma fonte de verdade só — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o estado de `products` no front vir de um único normalizador (`rowToProduct`), com `is_active` mapeado, para que um produto desativado pare de ser vendável após refetch, por scanner, e para que um produto recém-criado não entre cru no estado.

**Architecture:** O mapper anônimo dentro de `fetchProducts` vira uma função pura exportada `rowToProduct(row)`. Ela ganha o campo `is_active` (fail-open estrito). O caminho de criação de produto passa a usar essa mesma função em vez de castar a linha crua do banco. O scanner do modal de venda passa a buscar na lista já filtrada por vendabilidade.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgREST), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-product-state-single-source-design.md`.
- Indentação do repo: **tabs**. Aspas simples. Ponto e vírgula.
- Gates por commit: `npx tsc --noEmit` (0 erros), `npx vitest run` (tudo passa), `npx eslint <arquivos tocados>` limpo.
- Baseline da worktree: **96 testes**, 0 erros de tsc. Cada task só cresce esse número.
- Existem ~6 warnings de eslint **pré-existentes** fora desta fatia (LoginForm, RequestsPage, MembersPage, JoinRequestsPage, ProductOptionsPage, PlatformAdminContext). **Não tocar neles.** Rode o eslint apenas nos arquivos que você modificou.
- **Não usar `git push --force`** (um hook bloqueia).
- Não alterar `src/components/ProductsPage.tsx` linhas 262-273 (update path), 388 e 426 (bulk paths). Estão deliberadamente fora de escopo.

---

## File Structure

- `src/services/dashboardService.ts` — **Modify.** Ganha a função exportada `rowToProduct` e o campo `is_active`. Responsabilidade: traduzir linhas do banco em tipos do domínio.
- `src/services/dashboardService.test.ts` — **Modify.** Ganha os testes de `is_active` e o teste de contrato de `rowToProduct`. O arquivo já existe com o mock de `supabase` pronto.
- `src/components/ProductsPage.tsx` — **Modify (1 linha + 1 import).** O create path passa a usar `rowToProduct`.
- `src/components/products/SaleOrderModal.tsx` — **Modify (1 linha).** O scanner passa a buscar em `sellableProducts`.

---

### Task 1: Extrair `rowToProduct` como função pura exportada

Refatoração sem mudança de comportamento. Os cinco testes existentes em `dashboardService.test.ts` são a rede de segurança: eles devem continuar passando **sem nenhuma edição**.

**Files:**
- Modify: `src/services/dashboardService.ts:58-110` (`fetchProducts` e o mapper anônimo dentro dele)
- Test: `src/services/dashboardService.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `export function rowToProduct(row: Record<string, unknown>): Product` — usada pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao **final** de `src/services/dashboardService.test.ts` (mantendo o `describe` existente intacto). Note o `rowToProduct` acrescentado ao import dinâmico já presente no topo do arquivo.

Primeiro, altere a linha de import existente (ela hoje importa só `fetchProducts`):

```ts
const { fetchProducts, rowToProduct } = await import('./dashboardService');
```

Depois acrescente ao final do arquivo:

```ts
describe('rowToProduct', () => {
	it('normaliza um price NULL para undefined', () => {
		const product = rowToProduct({ id: 'p1', sku: 'SKU1', name: 'Sem preço', qty: 5, price: null });

		expect(product.price).toBeUndefined();
	});

	it('preenche os defaults de status e location de uma linha mínima', () => {
		const product = rowToProduct({ id: 'p1', sku: 'SKU1', name: 'Mínimo' });

		expect(product.status).toBe('ESTOQUE');
		expect(product.location).toBe('Loja principal');
		expect(product.qty).toBe(0);
	});
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/services/dashboardService.test.ts`
Expected: FAIL — `rowToProduct is not a function` (ainda não é exportada).

- [ ] **Step 3: Extrair a função**

Em `src/services/dashboardService.ts`, substitua **todo** o bloco de `export async function fetchProducts` (linhas 58 a 110, terminando no `});` que fecha o `.map()` e no `}` que fecha a função) por exatamente isto:

```ts
const str = (row: Record<string, unknown>, ...keys: string[]) => {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number') return String(value);
	}
	return '';
};

const num = (row: Record<string, unknown>, ...keys: string[]) => {
	const value = str(row, ...keys);
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const currency = (row: Record<string, unknown>, ...keys: string[]) => {
	const value = str(row, ...keys);
	if (!value) return undefined;
	const parsed = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : undefined;
};

// Unlike `num`, treats an absent/NULL value as undefined instead of 0.
// `min` is nullable in the schema and "no minimum registered" must stay
// undefined so getProductRisk's `min !== undefined` guard (and the "—"
// display fallback) work correctly. Scoped to `min` only — `num` stays
// as-is since price/totalSold rely on its current 0-fallback semantics.
const numOrUndefined = (row: Record<string, unknown>, ...keys: string[]) => {
	const value = str(row, ...keys);
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The single normalizer for a `products` row. Every path that puts a product
 * into React state must go through here — a raw row carries NULLs and column
 * names the UI doesn't speak.
 */
export function rowToProduct(row: Record<string, unknown>): Product {
	return {
		id: str(row, 'id') || str(row, 'sku') || crypto.randomUUID(),
		name: str(row, 'name', 'descricao', 'Descrição'),
		sku: str(row, 'sku', 'SKU') || '—',
		barcode: str(row, 'barcode', 'Barcode', 'BARCODE', 'codigo_barras') || undefined,
		status: str(row, 'status', 'Status') || 'ESTOQUE',
		location: str(row, 'location', 'local', 'Local') || 'Loja principal',
		qty: num(row, 'qty', 'quantidade_estoque', 'Quantidade_Estoque', 'total_estoque', 'Total_Estoque') ?? 0,
		min: numOrUndefined(row, 'min', 'estoque_minimo', 'Estoque_Minimo'),
		price: num(row, 'price') ?? currency(row, 'preco_venda', 'Preço de Venda Normal') ?? undefined,
		totalSold: num(row, 'total_sold') ?? undefined,
		image: str(row, 'image_url', 'image', 'foto', 'Foto') || undefined,
		created_at: str(row, 'created_at') || undefined,
	};
}

export async function fetchProducts(tenantId: string): Promise<Product[]> {
	const data = await fetchAllRows('products', tenantId);
	if (!data.length) return [];

	return data.map(rowToProduct);
}
```

Atenção: as funções `str`/`num`/`currency`/`numOrUndefined` deixaram de ser closures sobre `row` e agora recebem `row` como **primeiro argumento**. Não deixe nenhuma chamada antiga sem o `row`.

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run` e `npx tsc --noEmit`
Expected: PASS — **98 testes** (96 do baseline + 2 novos), 0 erros de tsc. Os 5 testes de `fetchProducts price/total_sold mapping` devem continuar verdes sem terem sido editados.

- [ ] **Step 5: Lint**

Run: `npx eslint src/services/dashboardService.ts src/services/dashboardService.test.ts`
Expected: sem erros e sem warnings nesses dois arquivos.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboardService.ts src/services/dashboardService.test.ts
git commit -m "refactor: extract rowToProduct as the single products normalizer"
```

---

### Task 2: Mapear `is_active` (Bug A)

**Files:**
- Modify: `src/services/dashboardService.ts` (helpers de `rowToProduct` e o objeto retornado)
- Test: `src/services/dashboardService.test.ts`

**Interfaces:**
- Consumes: `rowToProduct(row: Record<string, unknown>): Product` da Task 1.
- Produces: `Product.is_active` passa a ser populado a partir de `row.is_active`. `Product.is_active` já existe no tipo (`src/types/index.ts:15`, `is_active?: boolean`) — **não** altere o tipo.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `src/services/dashboardService.test.ts`:

```ts
describe('fetchProducts is_active mapping', () => {
	beforeEach(() => {
		mockRows = [];
	});

	it('mapeia is_active false, para que o produto pare de ser vendável', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Desativado', qty: 5, is_active: false }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.is_active).toBe(false);
	});

	it('mapeia is_active true', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Ativo', qty: 5, is_active: true }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.is_active).toBe(true);
	});

	it('deixa is_active undefined quando o valor não é boolean (fail-open: segue vendável)', async () => {
		mockRows = [{ id: 'p1', sku: 'SKU1', name: 'Sem flag', qty: 5 }];

		const [product] = await fetchProducts('tenant-1');

		expect(product.is_active).toBeUndefined();
	});
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `npx vitest run src/services/dashboardService.test.ts`
Expected: FAIL nos dois primeiros — recebido `undefined`, esperado `false` / `true`. O terceiro já passa (é a política sendo travada contra regressão).

- [ ] **Step 3: Implementar**

Em `src/services/dashboardService.ts`, adicione este helper logo **depois** de `numOrUndefined` e **antes** de `rowToProduct`:

```ts
// Read as a boolean, never through `str` (which would stringify it). The column
// is `not null default true`, so a real row is always boolean; anything else
// stays undefined, which SaleOrderModal's `is_active !== false` filter treats as
// sellable. Fail open: a weird row must never silently hide a product.
const bool = (row: Record<string, unknown>, key: string) =>
	typeof row[key] === 'boolean' ? (row[key] as boolean) : undefined;
```

E acrescente o campo ao objeto retornado por `rowToProduct`, entre `image` e `created_at`:

```ts
		image: str(row, 'image_url', 'image', 'foto', 'Foto') || undefined,
		is_active: bool(row, 'is_active'),
		created_at: str(row, 'created_at') || undefined,
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run` e `npx tsc --noEmit`
Expected: PASS — **101 testes**, 0 erros de tsc.

- [ ] **Step 5: Lint**

Run: `npx eslint src/services/dashboardService.ts src/services/dashboardService.test.ts`
Expected: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboardService.ts src/services/dashboardService.test.ts
git commit -m "fix: map is_active so a deactivated product stays unsellable after refetch"
```

---

### Task 3: Create path usa `rowToProduct` (Bug B)

Hoje `onProductUpdated(data as Product)` empurra a linha crua do insert para o estado: `price` chega `null` (não `undefined`), o campo de edição mostra "null" e o "Adicionar item" do modal de venda pode travar até um refetch.

Não há teste automatizado nesta task: o repo não tem teste de componente e não vamos introduzir `@testing-library/react` nesta fatia (decisão registrada no spec). A mudança é de uma linha e está coberta pelos testes de `rowToProduct` da Task 1 mais a verificação manual da Task 5.

**Files:**
- Modify: `src/components/ProductsPage.tsx` (import + linha 248)

**Interfaces:**
- Consumes: `rowToProduct` de `../services/dashboardService` (Tasks 1 e 2).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Ajustar o import**

Em `src/components/ProductsPage.tsx`, o arquivo já importa `fetchProducts` de `../services/dashboardService`. Acrescente `rowToProduct` a esse import existente — **não** crie uma segunda linha de import. Por exemplo, se hoje está:

```ts
import { fetchProducts } from '../services/dashboardService';
```

passa a ser:

```ts
import { fetchProducts, rowToProduct } from '../services/dashboardService';
```

(Se o import existente tiver outros nomes junto, apenas acrescente `rowToProduct` à lista, preservando o resto.)

- [ ] **Step 2: Trocar o cast pelo normalizador**

Na linha 248 (dentro do bloco `if (drawerMode === 'create')`, logo depois do tratamento de erro do insert), substitua:

```ts
				if (data && onProductUpdated) onProductUpdated(data as Product);
```

por:

```ts
				if (data && onProductUpdated) onProductUpdated(rowToProduct(data as Record<string, unknown>));
```

Não mexa em mais nada nessa função. Em particular, **não** altere o bloco de update logo abaixo (linhas ~262-273, o `onProductUpdated({ ...existing, status, location, ... })`).

- [ ] **Step 3: Verificar tipos e testes**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: 0 erros de tsc, **101 testes** passando (nenhum teste novo nesta task).

Se o `tsc` acusar que o import de `Product` em `ProductsPage.tsx` ficou sem uso, **verifique antes de remover**: o tipo `Product` é usado em outros pontos do arquivo (por exemplo nos casts dos bulk paths). Só remova se o compilador realmente apontar o import como não utilizado.

- [ ] **Step 4: Lint**

Run: `npx eslint src/components/ProductsPage.tsx`
Expected: limpo (esse arquivo não está na lista de warnings pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "fix: normalize a newly created product instead of storing the raw row"
```

---

### Task 4: Scanner respeita `is_active` (Bug C)

`handleScan` busca em `products` (lista inteira), enquanto o dropdown usa `sellableProducts`. Sem isso, bipar o código de barras de um produto desativado ainda o adiciona ao carrinho, mesmo com a Task 2 pronta.

**Files:**
- Modify: `src/components/products/SaleOrderModal.tsx:140`

**Interfaces:**
- Consumes: `sellableProducts`, o `useMemo` já existente na linha 50 do mesmo arquivo.
- Produces: nada.

- [ ] **Step 1: Trocar a lista da busca**

Em `src/components/products/SaleOrderModal.tsx`, dentro de `handleScan`, substitua:

```ts
		const match = findProductByCode(products, scan);
```

por:

```ts
		const match = findProductByCode(sellableProducts, scan);
```

**Não** altere `productBySku` (linha ~58) — ele é montado sobre `products` inteiro de propósito: uma linha já no carrinho cujo produto foi desativado ainda precisa exibir nome e estoque.

- [ ] **Step 2: Verificar tipos e testes**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: 0 erros, **101 testes** passando.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/products/SaleOrderModal.tsx`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/components/products/SaleOrderModal.tsx
git commit -m "fix: scanner no longer adds a deactivated product to the cart"
```

---

### Task 5: Verificação manual (e2e) e abertura do PR

**Files:** nenhum (verificação + PR).

- [ ] **Step 1: Subir o app**

Run: `npm run dev`
Faça login e vá até a página de Produtos.

- [ ] **Step 2: Verificar o Bug A**

1. Abra um produto e use o caminho que o desativa ("Desativar" no bloqueio de exclusão por FK).
2. Abra "Registrar venda" → o produto **não** aparece no dropdown.
3. **F5** na página.
4. Abra "Registrar venda" de novo → o produto continua **fora** do dropdown.

Antes do fix, o passo 4 mostrava o produto de volta.

- [ ] **Step 3: Verificar o Bug C**

Com o mesmo produto desativado, no modal de venda digite/bipe o código de barras dele no campo do scanner.
Esperado: `Código não encontrado: <código>` — e nada é adicionado ao carrinho.

- [ ] **Step 4: Verificar o Bug B**

1. "Novo produto" → preencha SKU e Nome, **deixe o preço vazio** → salvar.
2. O campo de preço do produto recém-criado fica **vazio**, não com o texto "null".
3. Abra "Registrar venda", selecione o produto novo → o botão "Adicionar item" pede um preço em vez de travar, e o checkout fica bloqueado até informar um preço.

- [ ] **Step 5: Gates finais**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros, 101 testes passando.

- [ ] **Step 6: Push e PR**

```bash
git push -u origin fix/product-state-single-source
gh pr create --repo lucas-foli/warehouse-app --base main \
  --title "fix: uma fonte de verdade só para o estado de produto (is_active + create normalizado)" \
  --body "..."
```

O corpo do PR deve cobrir: os três bugs e a reprodução de cada um; a extração de `rowToProduct`; a política fail-open de `is_active`; o que ficou deliberadamente de fora (update e bulk paths, que patcham `Product` já normalizado) e a observação de que converter o update para `.select().single()` + `rowToProduct` eliminaria a lista manual de campos e detectaria update bloqueado por RLS (hoje silencioso); e o resultado da verificação manual.

**Não use `git push --force`** — um hook bloqueia.

---

## Self-Review

**Cobertura do spec:**
- Extrair `rowToProduct` exportado + `fetchProducts` como `data.map(rowToProduct)` → Task 1.
- `is_active` no mapper, fail-open estrito → Task 2.
- Auditoria de consumidores → feita no spec (único leitor é `SaleOrderModal.tsx:50`); nenhuma task necessária.
- Create path normalizado → Task 3.
- Scanner filtrado → Task 4.
- Update/bulk fora de escopo → travado nas Global Constraints e na Task 3, Step 2.
- Sem migração → nenhuma task de banco.
- Verificação manual dos três bugs → Task 5.

**Consistência de tipos:** `rowToProduct(row: Record<string, unknown>): Product` é definida na Task 1 e consumida com a mesma assinatura nas Tasks 2 e 3. `bool(row, key)` segue a convenção `(row, ...)` dos demais helpers. `Product.is_active?: boolean` já existe no tipo e não é alterado.

**Contagem de testes:** 96 (baseline) → 98 (Task 1) → 101 (Task 2) → 101 (Tasks 3 e 4).
