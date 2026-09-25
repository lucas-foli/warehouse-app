# Dashboard honesto — remover dado fabricado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todo número fabricado exibido no Dashboard (BUG-6, BUG-7, BUG-8, BUG-10), trocando cada fallback sintético por dado real ou empty state honesto.

**Architecture:** Só front + funções puras. O hook `useDashboardData` já produz séries reais a partir de `salesOrders`/`salesItems` (voided excluído, filtrado por loja). Cada task remove uma fonte fabricada e liga a UI à fonte real correspondente. Funções puras testadas primeiro (vitest); componentes ligados depois.

**Tech Stack:** React 19, TypeScript, Vite, Recharts 3, Vitest.

## Global Constraints

- Typecheck/build gate: **`npx tsc -b`** (ou `npm run build`). NUNCA `tsc --noEmit` — o tsconfig raiz tem `files: []` e não checa nada.
- Testes: **`npm test`** (`vitest run`).
- Princípio "nada fabricado na tela": nenhum `Math.random`, nenhuma fração fixa (ex.: custo = venda × 0.4), nenhum mês/valor hardcoded pode sobrar exibido.
- Sem migration, sem mudança de schema, sem RPC.
- Casamento vendedor↔order é **dual-key** (`seller_id` OU `seller_external_id`), idêntico a `aggregateSellers` (`src/utils/sellerRollup.ts`).
- **Decisão de arquiteto (ordem):** `buildMultiSellerPerformance` é deletada na **Task 4**, não antes — é o único consumidor vivo em `SellersPage.tsx:60`, e removê-la antes de trocar o consumidor quebraria o build entre tasks. A spec lista sua deleção sob BUG-8; aqui ela migra para BUG-10 pelo mesmo motivo.

---

### Task 1: BUG-8 — matar histórico sintético

Remove o fallback de `history` que injeta meses hardcoded (`buildHistoryFromProducts`) e a função órfã `buildSellerPerformanceFromSellers`. `history` passa a vir só de `buildHistoryFromOrders` (real) → sem pedidos vira `[]` → empty state já existente no componente. Antes de remover o fallback, uma caracterização trava `buildHistoryFromOrders` como rede de regressão.

**Files:**
- Test: `src/utils/helpers.history.test.ts` (criar)
- Modify: `src/utils/helpers.ts` (deletar `buildHistoryFromProducts` linhas 148-172; deletar `buildSellerPerformanceFromSellers` linhas 394-406)
- Modify: `src/hooks/useDashboardData.ts` (remover import + simplificar bloco history linhas 90-92)

**Interfaces:**
- Consumes: `buildHistoryFromOrders(orders: Array<{ sold_at?: string; total_amount?: number }>): Array<{ month: string; value: number }>` — já existe, permanece.
- Produces: nada novo. `buildMultiSellerPerformance` **permanece** neste passo (deletada na Task 4).

- [ ] **Step 1: Escrever a caracterização de `buildHistoryFromOrders`**

`src/utils/helpers.history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildHistoryFromOrders } from './helpers';

describe('buildHistoryFromOrders', () => {
	it('retorna [] sem pedidos', () => {
		expect(buildHistoryFromOrders([])).toEqual([]);
	});

	it('agrega por mês, ordenado, a partir de datas reais', () => {
		const out = buildHistoryFromOrders([
			{ sold_at: '2026-06-15T10:00:00', total_amount: 100 },
			{ sold_at: '2026-07-20T10:00:00', total_amount: 50 },
			{ sold_at: '2026-07-25T10:00:00', total_amount: 25 },
		]);
		// Dois meses reais, em ordem cronológica, com os valores somados.
		// mata: remover a fonte real (viria [] ou valores fabricados).
		expect(out.map((p) => p.value)).toEqual([100, 75]);
		expect(out).toHaveLength(2);
		expect(out[0].month).not.toBe(out[1].month);
	});
});
```

- [ ] **Step 2: Rodar — deve passar (regressão/caracterização)**

Run: `npm test -- helpers.history`
Expected: PASS (a função já existe e funciona; o teste é a rede que protege a remoção seguinte).

- [ ] **Step 3: Deletar `buildHistoryFromProducts` e `buildSellerPerformanceFromSellers` de `helpers.ts`**

Remover integralmente o bloco `export const buildHistoryFromProducts = (...) => { ... };` (linhas 148-172) e o bloco `export const buildSellerPerformanceFromSellers = (...): HistoryItem[] => { ... };` (linhas 394-406). **Não** tocar em `buildMultiSellerPerformance`.

- [ ] **Step 4: Simplificar o bloco de history em `useDashboardData.ts`**

Remover `buildHistoryFromProducts,` da lista de imports (linha 17). Substituir as três linhas do bloco history (90-92):

```ts
			// Build history
			const historyFromOrders = activeOrders.length ? buildHistoryFromOrders(activeOrders) : [];
			const historyFromProducts = parsedProducts.length ? buildHistoryFromProducts(parsedProducts) : [];
			setHistory(historyFromOrders.length ? historyFromOrders : historyFromProducts);
```

por:

```ts
			// Build history — real orders only; sem pedidos → [] → empty state no componente.
			setHistory(activeOrders.length ? buildHistoryFromOrders(activeOrders) : []);
```

- [ ] **Step 5: Typecheck + testes**

Run: `npx tsc -b && npm test`
Expected: tsc sem erros; suíte verde. (Confirma que nenhum consumidor esquecido referenciava as funções removidas.)

- [ ] **Step 6: Commit**

```bash
git add src/utils/helpers.ts src/utils/helpers.history.test.ts src/hooks/useDashboardData.ts
git commit -m "refactor(dashboard): remove histórico fabricado (BUG-8)"
```

---

### Task 2: BUG-7 — remover custo/margem fabricado

`custo = venda * 0.4` é uma fração inventada (não há custo real no modelo — `Product` só tem `price`). Remover o campo `custo` de `CategorySale`, o cálculo das duas funções `buildCategorySales*`, e a exibição na seção "Categorias — vendas e custos" (renomeada para "Categorias — vendas"). Registrar a feature real no backlog.

**Files:**
- Test: `src/utils/helpers.categorySales.test.ts` (criar)
- Modify: `src/types/index.ts:22` (remover `custo: number;`)
- Modify: `src/utils/helpers.ts` (`buildCategorySalesFromProducts` 82-111 e `buildCategorySalesFromItems` 113-146)
- Modify: `src/components/OverviewPage.tsx` (título linha 147; linha do custo 161-164)
- Modify: `docs/backlog.md` (nova entrada)

**Interfaces:**
- Consumes: `CategorySale` sem `custo` (`{ name: string; venda: number; share: number }`).
- Produces: `buildCategorySalesFromItems(items, statusBySku)` e `buildCategorySalesFromProducts(items)` retornam `Array<{ name: string; venda: number; share: number }>`.

- [ ] **Step 1: Escrever o teste que trava a ausência de custo (red-first)**

`src/utils/helpers.categorySales.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCategorySalesFromItems, buildCategorySalesFromProducts } from './helpers';

describe('buildCategorySales* não expõe custo fabricado', () => {
	it('FromItems retorna name/venda/share, sem custo', () => {
		const out = buildCategorySalesFromItems(
			[{ sku: 'A', total_price: 100 }],
			new Map([['A', 'ESTOQUE']]),
		);
		// mata: reintroduzir custo = venda * 0.4
		expect(out[0]).not.toHaveProperty('custo');
		expect(out[0].venda).toBe(100);
		expect(out[0].name).toBe('ESTOQUE');
	});

	it('FromProducts retorna name/venda/share, sem custo', () => {
		const out = buildCategorySalesFromProducts([
			{ status: 'ESTOQUE', price: 10, totalSold: 5 },
		]);
		expect(out[0]).not.toHaveProperty('custo');
		expect(out[0].venda).toBe(50);
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- helpers.categorySales`
Expected: FAIL — hoje ambas as funções ainda retornam a chave `custo`.

- [ ] **Step 3: Remover `custo` de `CategorySale`**

`src/types/index.ts`, apagar a linha `custo: number;` (linha 22). O tipo fica:

```ts
export interface CategorySale {
	name: string;
	venda: number;
	share: number;
}
```

- [ ] **Step 4: Remover o cálculo de custo das duas funções em `helpers.ts`**

`buildCategorySalesFromProducts` (82-111) passa a:

```ts
export const buildCategorySalesFromProducts = (
	items: Array<{
		status: string;
		price?: number;
		totalSold?: number;
	}>,
) => {
	const byStatus = new Map<string, { venda: number }>();

	for (const p of items) {
		if (!p.price || !p.totalSold) continue;
		const venda = p.price * p.totalSold;
		const key = p.status || 'Outros';
		const acc = byStatus.get(key) ?? { venda: 0 };
		acc.venda += venda;
		byStatus.set(key, acc);
	}

	const totalVenda = Array.from(byStatus.values()).reduce((sum, c) => sum + c.venda, 0);
	if (!totalVenda) return [];

	return Array.from(byStatus.entries()).map(([name, { venda }]) => ({
		name,
		venda,
		share: (venda / totalVenda) * 100,
	}));
};
```

`buildCategorySalesFromItems` (113-146) passa a:

```ts
export const buildCategorySalesFromItems = (
	items: Array<{
		sku?: string;
		qty?: number;
		unit_price?: number;
		total_price?: number;
	}>,
	statusBySku: Map<string, string>,
) => {
	const byStatus = new Map<string, { venda: number }>();

	for (const item of items) {
		const qty = item.qty ?? 0;
		const amount =
			item.total_price ?? (item.unit_price !== undefined ? item.unit_price * (qty || 1) : undefined);
		if (!amount) continue;
		const sku = item.sku ?? '';
		const key = statusBySku.get(sku) || 'Outros';
		const acc = byStatus.get(key) ?? { venda: 0 };
		acc.venda += amount;
		byStatus.set(key, acc);
	}

	const totalVenda = Array.from(byStatus.values()).reduce((sum, c) => sum + c.venda, 0);
	if (!totalVenda) return [];

	return Array.from(byStatus.entries()).map(([name, { venda }]) => ({
		name,
		venda,
		share: (venda / totalVenda) * 100,
	}));
};
```

- [ ] **Step 5: Rodar — deve PASSAR**

Run: `npm test -- helpers.categorySales`
Expected: PASS.

- [ ] **Step 6: Atualizar a UI em `OverviewPage.tsx`**

Renomear o título da seção (linha 147): `Categorias — vendas e custos` → `Categorias — vendas`.

Remover a linha do custo. O bloco 161-164:

```tsx
											<div className="flex justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
												<span>Custo: {formatCurrency(cat.custo)}</span>
												<span>Share: {share.toFixed(1)}%</span>
											</div>
```

passa a (mantém o Share alinhado à direita, como estava — `justify-end`):

```tsx
											<div className="flex justify-end text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
												<span>Share: {share.toFixed(1)}%</span>
											</div>
```

- [ ] **Step 7: Registrar a feature real no backlog**

Acrescentar ao fim de `docs/backlog.md`:

```markdown
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
```

- [ ] **Step 8: Typecheck + testes**

Run: `npx tsc -b && npm test`
Expected: tsc sem erros (qualquer `.custo` remanescente quebraria aqui); suíte verde.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/utils/helpers.ts src/utils/helpers.categorySales.test.ts src/components/OverviewPage.tsx docs/backlog.md
git commit -m "refactor(dashboard): remove custo/margem fabricado das categorias (BUG-7)"
```

---

### Task 3: BUG-6 — faturamento do dia real

Hoje `dailyRevenue = monthlyRevenue / 30` (faturamento do mês ÷ 30 — não é hoje). O componente já recebe `salesTrend` (série diária real, respeitando o filtro de loja); o último ponto é hoje. Extrair um helper puro para testar sem montar o componente.

**Files:**
- Create: `src/utils/dailyRevenue.ts`
- Test: `src/utils/dailyRevenue.test.ts`
- Modify: `src/components/OverviewPage.tsx` (import + linha 53)

**Interfaces:**
- Consumes: `HistoryItem` (`{ month: string; value: number; quantity?: number }`) de `../types`.
- Produces: `latestDailyRevenue(salesTrend: HistoryItem[]): number` — valor do último ponto da série (hoje), ou `0` se vazia.

- [ ] **Step 1: Escrever o teste (red-first)**

`src/utils/dailyRevenue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { latestDailyRevenue } from './dailyRevenue';

describe('latestDailyRevenue', () => {
	it('série vazia → 0', () => {
		expect(latestDailyRevenue([])).toBe(0);
	});

	it('retorna o último ponto (hoje), não a média nem o primeiro', () => {
		// mata: dividir por 30, pegar o primeiro ponto, ou tirar média.
		expect(
			latestDailyRevenue([
				{ month: '10/02', value: 10 },
				{ month: '11/02', value: 30 },
			]),
		).toBe(30);
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- dailyRevenue`
Expected: FAIL — módulo/função inexistente.

- [ ] **Step 3: Implementar o helper**

`src/utils/dailyRevenue.ts`:

```ts
import type { HistoryItem } from '../types';

/**
 * Faturamento do dia = valor do último ponto da série diária (hoje).
 * Série vazia → 0 (empty state honesto). Substitui o antigo mês÷30.
 */
export const latestDailyRevenue = (salesTrend: HistoryItem[]): number =>
	salesTrend[salesTrend.length - 1]?.value ?? 0;
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npm test -- dailyRevenue`
Expected: PASS.

- [ ] **Step 5: Ligar no `OverviewPage.tsx`**

Adicionar o import (junto aos demais de `../utils`):

```tsx
import { latestDailyRevenue } from '../utils/dailyRevenue';
```

Trocar a linha 53:

```tsx
	const dailyRevenue = monthlyRevenue / 30;
```

por:

```tsx
	const dailyRevenue = latestDailyRevenue(salesTrend);
```

**Não** mexer em `latestMonth`, `previousMonth`, `monthlyRevenue`, `monthlyChange` (usados no card "Faturamento Total" e no `detail` "Tendência positiva/atenção", que são sobre o mês e permanecem válidos).

- [ ] **Step 6: Typecheck + testes**

Run: `npx tsc -b && npm test`
Expected: tsc sem erros; suíte verde.

- [ ] **Step 7: Commit**

```bash
git add src/utils/dailyRevenue.ts src/utils/dailyRevenue.test.ts src/components/OverviewPage.tsx
git commit -m "fix(dashboard): faturamento do dia = último ponto da série real (BUG-6)"
```

---

### Task 4: BUG-10 — série real por vendedor/dia

`buildMultiSellerPerformance` gera 30 dias com `Math.random()` distribuindo `bruto/30` — números inventados no tooltip do gráfico "Performance por período". Substituir por uma função pura que agrega `total_amount` real por vendedor por dia, com casamento dual-key. Ligar `SellersPage`/`Dashboard` à fonte real (`visibleActiveOrders`) e deletar a função fabricada.

**Files:**
- Create: `src/utils/sellerDailyPerformance.ts`
- Test: `src/utils/sellerDailyPerformance.test.ts`
- Modify: `src/components/SellersPage.tsx` (nova prop `salesOrders`; troca da série; imports)
- Modify: `src/components/Dashboard.tsx:419-427` (passar `salesOrders={visibleActiveOrders}`)
- Modify: `src/utils/helpers.ts` (deletar `buildMultiSellerPerformance` 408-433)

**Interfaces:**
- Consumes: `Seller` (`{ id: string; externalId?: string; nome: string; ... }`) de `../types`; `SalesOrder` (`{ seller_id?: string; seller_external_id?: string; total_amount?: number; sold_at?: string; ... }`) de `../services/dashboardService`.
- Produces: `buildSellerDailyPerformance(sellers: Seller[], orders: SalesOrder[], days?: number, referenceDate?: Date): Array<Record<string, string | number>>` — uma linha por dia da janela; chave `month` = rótulo `dd/mmm`; uma chave por `seller.nome` com o faturamento do dia (0 quando sem venda). Janela vazia de vendas → `[]`.

> **Nota de tipo (correção sobre a spec):** o retorno é `Array<Record<string, string | number>>`, não `Array<{ month: string } & Record<string, number>>` — este último não compila (`month` teria de ser `string` **e** `number`). Recharts consome `Record<string, string | number>` sem problema (`month` string para o eixo, valores numéricos por vendedor).

- [ ] **Step 1: Escrever a suíte (TDD, red-first)**

`src/utils/sellerDailyPerformance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';
import { aggregateSellers } from './sellerRollup';
import { buildSellerDailyPerformance } from './sellerDailyPerformance';

const seller = (over: Partial<Seller>): Seller =>
	({ id: 'u', nome: 'S', itens: 0, bruto: 0, liquido: 0, boletos: 0, ...over });
const order = (over: Partial<SalesOrder>): SalesOrder =>
	({ id: 'o', order_number: 'V-1', total_amount: 0, ...over } as SalesOrder);

const ref = new Date('2026-02-12T12:00:00'); // referenceDate fixa

describe('buildSellerDailyPerformance', () => {
	it('sem vendedores → []', () => {
		expect(buildSellerDailyPerformance([], [order({ total_amount: 10 })], 30, ref)).toEqual([]);
	});

	it('nenhuma venda na janela → [] (empty state explícito)', () => {
		// mata: retornar série constante/preenchida quando não houve venda.
		const out = buildSellerDailyPerformance([seller({ id: 'u1', nome: 'Ana' })], [], 30, ref);
		expect(out).toEqual([]);
	});

	it('venda em dia conhecido cai no dia certo; janela completa de `days` pontos', () => {
		const out = buildSellerDailyPerformance(
			[seller({ id: 'u1', nome: 'Ana' })],
			[order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		// mata: série vazia / dias trocados / omitir dias vazios.
		expect(out).toHaveLength(30);
		expect(out[out.length - 1].Ana).toBe(100); // hoje
		expect(out[0].Ana).toBe(0); // primeiro dia da janela, sem venda
	});

	it('conciliação: soma dos dias == bruto de aggregateSellers (mesmos orders na janela)', () => {
		const sellers = [seller({ id: 'u1', nome: 'Ana' })];
		const orders = [
			order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' }),
			order({ order_number: 'V-2', seller_id: 'u1', total_amount: 40, sold_at: '2026-02-05T09:00:00' }),
		];
		const out = buildSellerDailyPerformance(sellers, orders, 30, ref);
		const somaSerie = out.reduce((s, row) => s + (Number(row.Ana) || 0), 0);
		const bruto = aggregateSellers(sellers, orders, []).find((s) => s.id === 'u1')!.bruto;
		// mata: escalar/dividir o valor (o Math.random original erra a soma).
		expect(somaSerie).toBe(bruto);
		expect(somaSerie).toBe(140);
	});

	it('dual-key: resolve por seller_id (manual) e por seller_external_id (importada)', () => {
		const sellers = [seller({ id: 'u1', externalId: 'E1', nome: 'Ana' })];
		const byId = buildSellerDailyPerformance(
			sellers,
			[order({ seller_id: 'u1', total_amount: 10, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		const byExt = buildSellerDailyPerformance(
			sellers,
			[order({ seller_external_id: 'E1', total_amount: 10, sold_at: '2026-02-12T08:00:00' })],
			30,
			ref,
		);
		// mata: casar só por um dos campos.
		expect(byId[byId.length - 1].Ana).toBe(10);
		expect(byExt[byExt.length - 1].Ana).toBe(10);
	});

	it('order fora da janela é ignorado; vendedor sem match não vira coluna', () => {
		const sellers = [seller({ id: 'u1', nome: 'Ana' })];
		const out = buildSellerDailyPerformance(
			sellers,
			[
				order({ seller_id: 'u1', total_amount: 100, sold_at: '2026-02-12T08:00:00' }),
				order({ order_number: 'V-old', seller_id: 'u1', total_amount: 999, sold_at: '2025-12-01T08:00:00' }),
				order({ order_number: 'V-ghost', seller_id: 'ghost', total_amount: 5, sold_at: '2026-02-12T08:00:00' }),
			],
			30,
			ref,
		);
		// mata: incluir orders antigos / criar coluna "desconhecido".
		const somaSerie = out.reduce((s, row) => s + (Number(row.Ana) || 0), 0);
		expect(somaSerie).toBe(100);
		out.forEach((row) => {
			expect(Object.keys(row).sort()).toEqual(['Ana', 'month']);
		});
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- sellerDailyPerformance`
Expected: FAIL — módulo/função inexistente.

- [ ] **Step 3: Implementar a função pura**

`src/utils/sellerDailyPerformance.ts`:

```ts
import type { SalesOrder } from '../services/dashboardService';
import type { Seller } from '../types';

const dayKeyOf = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Série diária real de faturamento por vendedor, para o gráfico "Performance por
 * período". Agrega `total_amount` por vendedor por dia numa janela dos últimos
 * `days` dias terminando em `referenceDate ?? hoje`.
 *
 * Casamento dual-key (seller_id OU seller_external_id) idêntico a aggregateSellers:
 * vendas manuais (só seller_id) e importadas (só seller_external_id) caem no mesmo
 * vendedor. Orders sem vendedor resolvível são ignorados (sem coluna "desconhecido").
 *
 * Passe orders já filtrados por voided e por loja (o chamador usa visibleActiveOrders).
 * Sem nenhuma venda na janela → [] (empty state). Com ao menos uma venda → janela
 * completa de `days` pontos (dias sem venda = 0), para o eixo não ter buracos.
 */
export function buildSellerDailyPerformance(
	sellers: Seller[],
	orders: SalesOrder[],
	days = 30,
	referenceDate?: Date,
): Array<Record<string, string | number>> {
	if (!sellers.length) return [];

	const byKey = new Map<string, Seller>();
	for (const s of sellers) {
		if (s.externalId) byKey.set(s.externalId, s);
		if (s.id) byKey.set(s.id, s);
	}
	const resolve = (o: SalesOrder): Seller | undefined =>
		(o.seller_id ? byKey.get(o.seller_id) : undefined) ??
		(o.seller_external_id ? byKey.get(o.seller_external_id) : undefined);

	const today = referenceDate ? new Date(referenceDate) : new Date();
	today.setHours(0, 0, 0, 0);
	const start = new Date(today);
	start.setDate(start.getDate() - (days - 1));

	// byDay[dayKey][seller.nome] = faturamento do dia
	const byDay = new Map<string, Map<string, number>>();
	let anySale = false;

	for (const o of orders) {
		if (!Number.isFinite(o.total_amount)) continue;
		const s = resolve(o);
		if (!s) continue; // vendedor não resolvível — ignora
		const parsed = o.sold_at ? new Date(o.sold_at) : null;
		if (!parsed || Number.isNaN(parsed.getTime())) continue;
		parsed.setHours(0, 0, 0, 0);
		if (parsed < start || parsed > today) continue;

		const key = dayKeyOf(parsed);
		const row = byDay.get(key) ?? new Map<string, number>();
		row.set(s.nome, (row.get(s.nome) ?? 0) + Number(o.total_amount));
		byDay.set(key, row);
		anySale = true;
	}

	if (!anySale) return [];

	const series: Array<Record<string, string | number>> = [];
	for (let offset = days - 1; offset >= 0; offset--) {
		const date = new Date(today);
		date.setDate(today.getDate() - offset);
		const row = byDay.get(dayKeyOf(date));
		const point: Record<string, string | number> = {
			month: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
		};
		for (const s of sellers) {
			point[s.nome] = row?.get(s.nome) ?? 0;
		}
		series.push(point);
	}

	return series;
}
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npm test -- sellerDailyPerformance`
Expected: PASS (todos os casos, inclusive a conciliação).

- [ ] **Step 5: Ligar `SellersPage.tsx` à fonte real**

Trocar o import (linha 18):

```tsx
import { buildMultiSellerPerformance } from '../utils/helpers';
```

por:

```tsx
import type { SalesOrder } from '../services/dashboardService';
import { buildSellerDailyPerformance } from '../utils/sellerDailyPerformance';
```

Adicionar `salesOrders` às props (destructuring linhas 22-36) e ao tipo:

```tsx
const SellersPage = ({
	vendedores,
	salesOrders,
	primaryColor,
	secondaryColor,
	tenantId,
	isAdmin = false,
	onReload,
}: {
	vendedores: Seller[];
	salesOrders: SalesOrder[];
	primaryColor: string;
	secondaryColor: string;
	tenantId?: string;
	isAdmin?: boolean;
	onReload?: () => void;
}) => {
```

Trocar as linhas 60-61:

```tsx
	const sellerPerformanceSeries = buildMultiSellerPerformance(sellersForDisplay);
	const sellerPerformance = sellerPerformanceSeries.length ? sellerPerformanceSeries : [];
```

por:

```tsx
	const sellerPerformance = buildSellerDailyPerformance(sellersForDisplay, salesOrders);
```

- [ ] **Step 6: Passar `salesOrders` no `Dashboard.tsx`**

No `<SellersPage>` (linhas 419-427), acrescentar a prop logo após `vendedores`:

```tsx
					{page === 'vendedores' && (
						<SellersPage
							vendedores={visibleVendedores}
							salesOrders={visibleActiveOrders}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
							tenantId={tenantId}
							isAdmin={isAdmin}
							onReload={reload}
						/>
					)}
```

`visibleActiveOrders` é a **mesma fonte** que alimenta `visibleVendedores` (dual-key, voided excluído, filtro de loja) — série e agregados batem.

- [ ] **Step 7: Deletar `buildMultiSellerPerformance` de `helpers.ts`**

Remover integralmente o bloco `export const buildMultiSellerPerformance = (sellers: Seller[]) => { ... };` (linhas 408-433). Com isso, `Seller` deixa de ser usado em `helpers.ts` (era o último consumidor, junto de `buildSellerPerformanceFromSellers`, já removido na Task 1). Remover `Seller` do import de tipos no topo do arquivo:

```ts
import type { Client, HistoryItem, Product, Seller } from '../types';
```

passa a:

```ts
import type { Client, HistoryItem, Product } from '../types';
```

(`Client`, `HistoryItem` e `Product` seguem em uso — não os remova. O `npx tsc -b` do próximo passo acusa qualquer erro de import órfão.)

- [ ] **Step 8: Typecheck + testes**

Run: `npx tsc -b && npm test`
Expected: tsc sem erros; suíte verde.

- [ ] **Step 9: Commit**

```bash
git add src/utils/sellerDailyPerformance.ts src/utils/sellerDailyPerformance.test.ts src/components/SellersPage.tsx src/components/Dashboard.tsx src/utils/helpers.ts
git commit -m "feat(dashboard): série real por vendedor/dia, sem Math.random (BUG-10)"
```

---

## Verificação final (após as 4 tasks)

- `npx tsc -b` limpo e `npm test` verde.
- Grep de sanidade — zero ocorrências fabricadas remanescentes:
  - `grep -rn "Math.random" src/utils/helpers.ts` → vazio.
  - `grep -rn "buildHistoryFromProducts\|buildSellerPerformanceFromSellers\|buildMultiSellerPerformance" src/` → vazio.
  - `grep -rn "\.custo\b\|custo = venda\|\* 0.4" src/` → vazio.
- E2e manual (app real, ver spec): loja nova → vender **hoje** → card "Faturamento do dia" = venda de hoje (não mês÷30); seção "Categorias — vendas" sem linha de custo; gráfico "Performance por período" com valores que batem com as barras de "Faturamento por vendedor" (soma da série == bruto).

## Fora de escopo (registrado na spec)

- Custo/margem real → entrada nova no backlog (Task 2, Step 7).
- Card "Faturamento Total — mês atual" usar `history[last]` (último mês *com* vendas): candidato a backlog, **não** corrigido nesta fatia.
