# Sales location → revenue-by-store (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch a fresh subagent per task with the full task text; do NOT make the subagent read this whole file.

**Goal:** Give each sale a store (`sales_orders.location`) so the Dashboard store filter also recuts revenue/sales metrics (Faturamento, Tendência, Categorias), not just product counts.

**Architecture:** Add a nullable `location` column to `sales_orders`; the `register_sale_order` RPC accepts and stores it; the sale modal picks the store from the tenant's managed `local` list (reusing `listProductOptions(tenantId, 'local')` from Phase 1–5). The dashboard hook exposes raw orders+items; the Dashboard component recomputes the sales aggregates filtered by the selected store via `useMemo`, using the existing builder utils.

**Tech Stack:** React 19, Supabase (Postgres + RLS + plpgsql RPC), vitest, TypeScript.

**Context — prerequisites already shipped (Phase 1–5, PR #58):**
- `tenant_product_options(tenant_id, kind, value)` with `kind ∈ {onde, local}`, and `src/services/productOptions.ts` exporting `listProductOptions(tenantId, kind): Promise<string[]>`.
- The Dashboard store filter (`Dashboard.tsx`) already has `locationFilter` state + `visibleProducts` memo and filters the product-facing surfaces. This plan extends the SAME `locationFilter` to sales metrics.

**⚠️ Migrations risk (memory `project_warehouse_sales_migrations_risk`):** every migration here (column + RPC) MUST be applied to the app's Supabase or sale registration breaks at runtime. The deploy pipeline likely does NOT run migrations — apply manually. Subagents write+commit migrations only; they MUST NOT attempt to apply them (no local DB).

**Key existing facts (verified):**
- `sales_orders` columns: `id, tenant_id, order_number, client_id, client_external_id, seller_id, seller_external_id, status, total_amount, sold_at, created_at, updated_at` (`supabase/migrations/20251226000300_sales_clients.sql`). NO location column.
- `register_sale_order(p_tenant_id uuid, p_items jsonb, p_sold_at timestamptz default now(), p_client_id uuid default null, p_seller_id uuid default null) returns sales_orders` (`supabase/migrations/20260603000000_register_sale_order.sql`). The `insert into public.sales_orders (...) values (...)` is at lines 49-51.
- Front calls it via `src/services/salesService.ts` → `registerSaleOrder(input: RegisterSaleOrderInput)`; input is `{ tenantId, items, soldAt?, clientId?, sellerId? }`.
- `src/components/products/SaleOrderModal.tsx` has `tenantId` prop, `clientId`/`sellerId` `<select>`s (~lines 310-324), and calls `registerSaleOrder({...})` at ~line 157. Rendered by `ProductsPage` (`<SaleOrderModal ... />` ~line 965), which has `tenantId`.
- `src/services/dashboardService.ts`: `type SalesOrder` (line 4) and `fetchSalesOrders` (line 129) map order rows; add `location` here.
- `src/hooks/useDashboardData.ts`: fetches orders+items, excludes voided, and builds `categorySales` (`buildCategorySalesFromItems(activeItems, statusBySku)`), `history` (`buildHistoryFromOrders(activeOrders)`), `salesTrend` (`buildRecentDailySalesFromOrders(activeOrders, 20)`) — then stores them in state. It exposes `salesOrders` but NOT raw `salesItems`. `sales_items` rows carry `order_number` (join key to `sales_orders.order_number`).

---

## File Structure

- **Create** `supabase/migrations/20260619000000_sales_orders_location.sql` — add column + replace RPC.
- **Modify** `src/types/database.ts` — `sales_orders` Row/Insert `location`; `register_sale_order` Args `p_location`.
- **Modify** `src/services/dashboardService.ts` — `SalesOrder` type + `fetchSalesOrders` map.
- **Modify** `src/services/salesService.ts` — `RegisterSaleOrderInput.location` + pass `p_location`.
- **Modify** `src/components/products/SaleOrderModal.tsx` — store `<select>` from managed `local` list; pass `location`.
- **Modify** `src/hooks/useDashboardData.ts` — expose raw `salesItems` (+ `statusBySku` helper or rebuild in Dashboard).
- **Modify** `src/components/Dashboard.tsx` — recompute sales aggregates filtered by `locationFilter`; pass to `OverviewPage`.
- **Create** `src/utils/salesByLocation.test.ts` + helper `src/utils/salesByLocation.ts` — pure filter of orders/items by store (TDD).

---

## Task 1: Migration — `sales_orders.location` + RPC accepts it

**Files:** Create `supabase/migrations/20260619000000_sales_orders_location.sql`

- [ ] **Step 1: Write the migration.** It (a) adds the column, (b) drops the old 5-arg function and recreates it with a 6th `p_location` parameter that is written into the insert. The body is the existing function verbatim plus the new param in signature, insert column list, and values.

```sql
-- Phase 6: attribute each sale to a store so revenue can be filtered by location.
-- Pre-existing orders keep location = null (unattributed; show only under "Todos os locais").

alter table public.sales_orders add column if not exists location text;

create index if not exists sales_orders_tenant_location_idx
  on public.sales_orders (tenant_id, location);

-- Re-create register_sale_order with a new p_location parameter. The old 5-arg
-- signature must be dropped first (adding a defaulted param would otherwise create
-- an ambiguous overload).
drop function if exists public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid);

create or replace function public.register_sale_order(
	p_tenant_id uuid,
	p_items jsonb,
	p_sold_at timestamptz default now(),
	p_client_id uuid default null,
	p_seller_id uuid default null,
	p_location text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
	v_next bigint;
	v_order_number text;
	v_order_id uuid;
	v_total numeric := 0;
	v_has_price boolean := true;
	v_order public.sales_orders%rowtype;
	v_item record;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
		raise exception using message = 'sale_items_required';
	end if;

	perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

	select coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')::bigint), 0) + 1
	into v_next
	from public.sales_orders
	where tenant_id = p_tenant_id and order_number like 'V-%';

	v_order_number := 'V-' || lpad(v_next::text, 4, '0');

	insert into public.sales_orders (tenant_id, order_number, client_id, seller_id, sold_at, total_amount, status, location)
	values (p_tenant_id, v_order_number, p_client_id, p_seller_id, coalesce(p_sold_at, now()), null, 'manual', nullif(btrim(coalesce(p_location, '')), ''))
	returning id into v_order_id;

	for v_item in
		with raw as (
			select
				upper(trim(elem->>'sku')) as sku,
				(elem->>'qty')::int as qty,
				nullif(elem->>'unit_price', '')::numeric as unit_price,
				ord
			from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
		),
		merged as (
			select
				r.sku,
				sum(r.qty) as qty,
				(select r2.unit_price from raw r2
				 where r2.sku = r.sku and r2.unit_price is not null
				 order by r2.ord desc limit 1) as unit_price
			from raw r
			group by r.sku
		)
		select * from merged
	loop
		if v_item.sku = '' or v_item.sku is null then
			raise exception using message = 'sales_item_sku_required';
		end if;
		if v_item.qty is null or v_item.qty <= 0 then
			raise exception using message = 'sale_qty_invalid';
		end if;

		insert into public.sales_items (tenant_id, order_id, order_number, sku, qty, unit_price, total_price)
		values (
			p_tenant_id, v_order_id, v_order_number, v_item.sku, v_item.qty, v_item.unit_price,
			case when v_item.unit_price is null then null else round(v_item.unit_price * v_item.qty, 2) end
		);

		update public.products
		set qty = qty - v_item.qty,
			total_sold = coalesce(total_sold, 0) + v_item.qty,
			updated_at = now()
		where tenant_id = p_tenant_id
			and upper(sku) = v_item.sku
			and coalesce(is_active, true) = true;

		if v_item.unit_price is null then
			v_has_price := false;
		else
			v_total := v_total + round(v_item.unit_price * v_item.qty, 2);
		end if;
	end loop;

	update public.sales_orders
	set total_amount = case when v_has_price then v_total else null end,
		updated_at = now()
	where id = v_order_id
	returning * into v_order;

	return v_order;
end;
$$;

revoke all on function public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid, text) from public;
grant execute on function public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid, text) to authenticated;
```

- [ ] **Step 2: Sanity-check the SQL by eye** (balanced `$$`, insert column count == values count: 8 columns / 8 values; new grant references the 6-arg signature). DO NOT execute it — there is no local DB.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260619000000_sales_orders_location.sql
git commit -m "feat(db): sales_orders.location + register_sale_order p_location"
```

- [ ] **Step 4 (HUMAN, not the subagent):** Apply this migration to the app's Supabase before using the feature. Note this in the report as a required manual step.

---

## Task 2: Types + fetch map `location`

**Files:** Modify `src/types/database.ts`, `src/services/dashboardService.ts`

- [ ] **Step 1: `database.ts` — sales_orders Row/Insert.** Find the `sales_orders` table type (Row and Insert) and add `location: string | null` to Row and `location?: string | null` to Insert. Find the `register_sale_order` `Args` type and add `p_location?: string | null`.

- [ ] **Step 2: `dashboardService.ts` — SalesOrder type.** Add `location: string | null;` to `type SalesOrder` (around line 4).

- [ ] **Step 3: `dashboardService.ts` — fetchSalesOrders map.** In `fetchSalesOrders` (line 129), where each row is mapped, add `location: (row.location as string | null) ?? null,` (match the existing mapping style in that function — read it first).

- [ ] **Step 4: Verify** `npx tsc --noEmit` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts src/services/dashboardService.ts
git commit -m "feat(sales): expose sales_orders.location in types + fetch"
```

---

## Task 3: salesService passes `location`

**Files:** Modify `src/services/salesService.ts`

- [ ] **Step 1:** Add `location?: string | null;` to `RegisterSaleOrderInput`.

- [ ] **Step 2:** In `registerSaleOrder`, add to the `.rpc('register_sale_order', { ... })` payload:
```ts
		p_location: input.location ?? null,
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` — no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/salesService.ts
git commit -m "feat(sales): registerSaleOrder accepts location"
```

---

## Task 4: Sale modal — pick the store from the managed list

**Files:** Modify `src/components/products/SaleOrderModal.tsx`

- [ ] **Step 1: Load the managed `local` list.** Add import `import { listProductOptions } from '../../services/productOptions';`. Add state + effect (mirror the `clientId`/`sellerId` state already present):
```tsx
	const [location, setLocation] = useState('');
	const [localOptions, setLocalOptions] = useState<string[]>([]);
	useEffect(() => {
		if (!tenantId) return;
		void listProductOptions(tenantId, 'local').then(setLocalOptions).catch(() => {});
	}, [tenantId]);
```

- [ ] **Step 2: Render a store `<select>`** next to the existing client/seller selects (copy the markup of the `clientId` select ~lines 310-320, adapting label to "Loja" and options to `localOptions`). Include an empty default option `<option value="">—</option>` so a sale without a store is allowed:
```tsx
							<select value={location} onChange={(e) => setLocation(e.target.value)} className="<same classes as the client select>">
								<option value="">—</option>
								{localOptions.map((opt) => (
									<option key={opt} value={opt}>{opt}</option>
								))}
							</select>
```
(Read the client select to copy its exact wrapper/classes/label structure.)

- [ ] **Step 3: Pass it to registerSaleOrder.** In the `registerSaleOrder({ ... })` call (~line 157), add `location: location || null,`.

- [ ] **Step 4: Reset on success.** Wherever the modal clears state after a successful sale (the lines that reset `clientId`/`sellerId`/lines), add `setLocation('');`.

- [ ] **Step 5: Verify** `npx tsc --noEmit` — no errors; `npx vitest run` — existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/products/SaleOrderModal.tsx
git commit -m "feat(sales): choose store when registering a sale"
```

---

## Task 5: Filter sales aggregates by store on the Dashboard

**Files:** Create `src/utils/salesByLocation.ts` + `src/utils/salesByLocation.test.ts`; Modify `src/hooks/useDashboardData.ts`, `src/components/Dashboard.tsx`

- [ ] **Step 1: Write the failing test** `src/utils/salesByLocation.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { filterSalesByLocation } from './salesByLocation';

const orders = [
  { order_number: 'V-0001', location: 'BRASÍLIA SHOPPING' },
  { order_number: 'V-0002', location: 'LOJA PRINCIPAL' },
  { order_number: 'V-0003', location: null },
] as any[];
const items = [
  { order_number: 'V-0001', sku: 'A' },
  { order_number: 'V-0002', sku: 'B' },
  { order_number: 'V-0003', sku: 'C' },
] as any[];

describe('filterSalesByLocation', () => {
  it("returns everything unchanged for 'all'", () => {
    const r = filterSalesByLocation(orders, items, 'all');
    expect(r.orders).toHaveLength(3);
    expect(r.items).toHaveLength(3);
  });
  it('keeps only orders + their items for a specific store', () => {
    const r = filterSalesByLocation(orders, items, 'BRASÍLIA SHOPPING');
    expect(r.orders.map((o) => o.order_number)).toEqual(['V-0001']);
    expect(r.items.map((i) => i.sku)).toEqual(['A']);
  });
  it('excludes null-location (unattributed) orders from a specific store', () => {
    const r = filterSalesByLocation(orders, items, 'LOJA PRINCIPAL');
    expect(r.orders.map((o) => o.order_number)).toEqual(['V-0002']);
    expect(r.items.map((i) => i.sku)).toEqual(['B']);
  });
});
```

- [ ] **Step 2: Run it, confirm it FAILS** (`npx vitest run src/utils/salesByLocation.test.ts`).

- [ ] **Step 3: Implement** `src/utils/salesByLocation.ts`:
```typescript
import type { SalesItem, SalesOrder } from '../services/dashboardService';

/**
 * Narrow orders + items to a single store. 'all' is a pass-through. For a
 * specific store, only orders whose `location` matches are kept, and only the
 * items belonging to those orders (joined by order_number). Orders with a null
 * location are unattributed and excluded from any specific-store view.
 */
export function filterSalesByLocation(
  orders: SalesOrder[],
  items: SalesItem[],
  location: 'all' | string,
): { orders: SalesOrder[]; items: SalesItem[] } {
  if (location === 'all') return { orders, items };
  const keptOrders = orders.filter((o) => o.location === location);
  const keptNumbers = new Set(keptOrders.map((o) => o.order_number));
  return { orders: keptOrders, items: items.filter((i) => keptNumbers.has(i.order_number)) };
}
```

- [ ] **Step 4: Run it, confirm 3 tests PASS.**

- [ ] **Step 5: Expose raw `salesItems` from the hook.** In `src/hooks/useDashboardData.ts`: add `const [salesItems, setSalesItems] = useState<SalesItem[]>([]);`, call `setSalesItems(salesItems)` right after `setSalesOrders(orders)` (note: the local variable in the loader is already named `salesItems` — rename the state setter target carefully or store the raw array into state under a distinct name like `rawSalesItems`/`setRawSalesItems` to avoid shadowing). Return it from the hook's returned object. Keep the existing `categorySales`/`history`/`salesTrend` state as the `'all'` baseline (do not remove).

- [ ] **Step 6: Recompute aggregates by store in Dashboard.** In `src/components/Dashboard.tsx`:
  - Destructure the new `salesItems` (raw) from `useDashboardData`, plus the existing `salesOrders`, `categorySales`, `history`, `salesTrend`, `products`.
  - Add memos that, when `locationFilter === 'all'`, return the hook's baseline values, and otherwise rebuild from the filtered raw data using the same util functions the hook uses:
```tsx
	const visibleSales = useMemo(
		() => filterSalesByLocation(salesOrders, salesItems, locationFilter),
		[salesOrders, salesItems, locationFilter],
	);
	const statusBySku = useMemo(
		() => new Map(products.map((p) => [p.sku, p.status])),
		[products],
	);
	const visibleCategorySales = useMemo(() => {
		if (locationFilter === 'all') return categorySales;
		const active = visibleSales.items.filter((i) => i.order_number); // voided already excluded upstream? see note
		return buildCategorySalesFromItems(active, statusBySku);
	}, [locationFilter, categorySales, visibleSales, statusBySku]);
	const visibleHistory = useMemo(() => {
		if (locationFilter === 'all') return history;
		return buildHistoryFromOrders(visibleSales.orders);
	}, [locationFilter, history, visibleSales]);
	const visibleSalesTrend = useMemo(() => {
		if (locationFilter === 'all') return salesTrend;
		return buildRecentDailySalesFromOrders(visibleSales.orders, 20);
	}, [locationFilter, salesTrend, visibleSales]);
```
  Import the builders from `../utils/helpers` and `filterSalesByLocation` from `../utils/salesByLocation`.
  - **Voided handling:** the hook excludes voided orders/items before building the baseline. The raw `salesItems`/`salesOrders` exposed include voided rows. So before rebuilding, filter out voided: derive `voidedNumbers = new Set(salesOrders.filter(o => o.status === 'voided').map(o => o.order_number))`, and pass `visibleSales.orders.filter(o => o.status !== 'voided')` / `visibleSales.items.filter(i => !voidedNumbers.has(i.order_number))` into the builders. Implement this so a specific-store view matches the all-view's voided exclusion.
  - Pass `categorySales={visibleCategorySales}`, `history={visibleHistory}`, `salesTrend={visibleSalesTrend}` to `<OverviewPage>` (replacing the current `categorySales`/`history`/`salesTrend` props).

- [ ] **Step 7: Verify** `npx tsc --noEmit` (clean) and `npx vitest run` (all pass, incl. the 3 new).

- [ ] **Step 8: Commit**

```bash
git add src/utils/salesByLocation.ts src/utils/salesByLocation.test.ts src/hooks/useDashboardData.ts src/components/Dashboard.tsx
git commit -m "feat(dashboard): store filter recuts revenue/sales metrics"
```

---

## Task 6: End-to-end verification (manual)

- [ ] Apply migration `20260619000000_sales_orders_location.sql` to the app's Supabase (if not done in Task 1 Step 4).
- [ ] Register a sale, picking a store in the modal → confirm `sales_orders.location` is set for the new order.
- [ ] On the Dashboard with a tenant that has ≥2 stores and sales in each: switch the store filter and confirm **Faturamento, Tendência (20 dias), Categorias** recut to the selected store (not just Itens críticos), and "Todos os locais" restores the full numbers.
- [ ] Confirm voided orders stay excluded in a specific-store view.
- [ ] Confirm pre-existing (null-location) orders appear only under "Todos os locais".

---

## Self-Review

- **Spec coverage:** revenue-by-store = Tasks 1–5; sale captures store = Task 4; aggregates recut = Task 5; voided parity + null-location handling = Task 5 Step 6 / Task 6.
- **Migrations risk:** Task 1 Step 4 + Task 6 call out the manual Supabase apply explicitly.
- **Type consistency:** `SalesOrder.location: string|null`, `RegisterSaleOrderInput.location?`, RPC `p_location`, `filterSalesByLocation(orders, items, location)` used consistently across tasks. Builders referenced by their existing names (`buildCategorySalesFromItems`, `buildHistoryFromOrders`, `buildRecentDailySalesFromOrders`) — confirm signatures in `src/utils/helpers.ts` before wiring (Task 5 Step 6) and adapt the call if they differ.
- **Open risk to verify during execution:** the exact reset/clearing block in SaleOrderModal (Task 4 Step 4) and the precise `fetchSalesOrders` row-map style (Task 2 Step 3) must be matched to the real code — locate by content, don't trust line numbers.
