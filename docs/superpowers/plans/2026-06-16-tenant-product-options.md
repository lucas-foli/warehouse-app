# Tenant Product Options ("Onde" + "Local" managed lists) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tenant an admin-managed list of allowed values for the product "Onde" (physical placement) and "Local" (store) fields, defined in Settings, and consume those lists everywhere those fields are entered or filtered.

**Architecture:** One tenant-scoped table `tenant_product_options(tenant_id, kind, value)` with `kind ∈ {onde, local}`, RLS so members read and admins write, seeded by backfilling distinct existing product values. A thin `productOptions` service exposes list/add/remove. A new Settings page manages both lists. The product edit drawer, StatusUpdateForm, BulkEdit, and the Dashboard store filter all read from these lists instead of free text / hardcoded arrays.

**Tech Stack:** React 19 + react-router-dom 7, Supabase (Postgres + RLS), vitest, TypeScript, Tailwind.

**Context:** Working in worktree `.claude/worktrees/product-fields-onde-location` (branch `worktree-product-fields-onde-location`, off origin/main). PR #58 already holds the "Onde" relabel. This plan builds on top of it.

**Scope note:** Phases 1–5 deliver managed lists + all in-tenant consumers (incl. wiring the Dashboard product filter). Phase 6 (store on `sales_orders` for revenue-by-store) is the "Tudo" follow-up and is intentionally optional/last because it touches sales RPCs (see memory `project_warehouse_sales_migrations_risk`).

---

## File Structure

- **Create** `supabase/migrations/20260616000000_tenant_product_options.sql` — table, indexes, RLS, backfill.
- **Create** `src/services/productOptions.ts` — list/add/remove for managed options.
- **Create** `src/services/productOptions.test.ts` — unit tests for the pure normalizer.
- **Create** `src/components/settings/ProductOptionsPage.tsx` — Settings UI for both lists.
- **Modify** `src/components/settings/TenantSettingsLayout.tsx` — add nav link.
- **Modify** `src/App.tsx:488-491` — add route.
- **Modify** `src/StatusUpdateForm.tsx` — read "onde" list instead of hardcoded array.
- **Modify** `src/components/ProductsPage.tsx` — "Onde"/"Local" edit inputs become selects from lists; pass option lists to BulkEdit.
- **Modify** `src/components/Dashboard.tsx:113-123,221-285` — wire store filter, pass filtered products to subpages.

---

## Task 1: Schema + backfill migration

**Files:**
- Create: `supabase/migrations/20260616000000_tenant_product_options.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-tenant managed lists for product fields:
--   kind 'onde'  -> physical placement (ESTOQUE / GAVETA / VITRINE ...)
--   kind 'local' -> store / location (Loja principal / Brasília Shopping ...)
-- Admins manage the values in Settings; everyone reads them to populate the
-- product "Onde"/"Local" dropdowns and the store filter.

create table if not exists public.tenant_product_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('onde', 'local')),
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Case-sensitive uniqueness; the service uppercases/trims before insert so
-- "Estoque" and "ESTOQUE" can't both be created.
create unique index if not exists tenant_product_options_unique
  on public.tenant_product_options (tenant_id, kind, value);

create index if not exists tenant_product_options_lookup
  on public.tenant_product_options (tenant_id, kind, sort_order, value);

alter table public.tenant_product_options enable row level security;

-- Members read their tenant's lists (needed for product edit dropdowns).
drop policy if exists "Members read product options" on public.tenant_product_options;
create policy "Members read product options"
  on public.tenant_product_options for select
  using (public.is_tenant_member(tenant_id));

-- Admins manage the lists.
drop policy if exists "Admins insert product options" on public.tenant_product_options;
create policy "Admins insert product options"
  on public.tenant_product_options for insert
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "Admins update product options" on public.tenant_product_options;
create policy "Admins update product options"
  on public.tenant_product_options for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "Admins delete product options" on public.tenant_product_options;
create policy "Admins delete product options"
  on public.tenant_product_options for delete
  using (public.is_tenant_admin(tenant_id));

-- Platform admin read escape hatch (parity with other tenant tables).
drop policy if exists "Platform admins read product options" on public.tenant_product_options;
create policy "Platform admins read product options"
  on public.tenant_product_options for select
  using (public.is_platform_admin());

-- Backfill from values already present on products so nothing breaks for
-- existing tenants. Distinct, non-empty values become the starting list.
insert into public.tenant_product_options (tenant_id, kind, value)
select distinct tenant_id, 'onde', status
from public.products
where tenant_id is not null and status is not null and btrim(status) <> ''
on conflict (tenant_id, kind, value) do nothing;

insert into public.tenant_product_options (tenant_id, kind, value)
select distinct tenant_id, 'local', location
from public.products
where tenant_id is not null and location is not null and btrim(location) <> ''
on conflict (tenant_id, kind, value) do nothing;
```

- [ ] **Step 2: Apply to the app's Supabase**

Run the migration against the app's Supabase project (the same one the SPA uses).
**Critical (memory `project_warehouse_sales_migrations_risk`):** if the deploy pipeline doesn't run migrations, apply it manually, or the Settings page and dropdowns 500 at runtime.
Expected: `tenant_product_options` exists; `select count(*) from tenant_product_options` returns ≥ the number of distinct (tenant, status) + (tenant, location) pairs.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260616000000_tenant_product_options.sql
git commit -m "feat(db): tenant_product_options table for managed Onde/Local lists"
```

---

## Task 2: productOptions service + normalizer test

**Files:**
- Create: `src/services/productOptions.ts`
- Test: `src/services/productOptions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/productOptions.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeOptionValue } from './productOptions';

describe('normalizeOptionValue', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeOptionValue('  vitrine ')).toBe('VITRINE');
  });
  it('uppercases so casing cannot create duplicates', () => {
    expect(normalizeOptionValue('Gaveta')).toBe('GAVETA');
  });
  it('collapses internal runs of whitespace', () => {
    expect(normalizeOptionValue('loja   centro')).toBe('LOJA CENTRO');
  });
  it('returns empty string for blank input', () => {
    expect(normalizeOptionValue('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/productOptions.test.ts`
Expected: FAIL — `normalizeOptionValue` is not exported / module missing.

- [ ] **Step 3: Write the service**

```typescript
// src/services/productOptions.ts
import { supabase } from '../lib/supabaseClient';

export type ProductOptionKind = 'onde' | 'local';

export interface ProductOption {
  id: string;
  tenant_id: string;
  kind: ProductOptionKind;
  value: string;
  sort_order: number;
}

/**
 * Normalize a user-entered option value: trim, collapse internal whitespace,
 * uppercase. Uppercasing keeps the case-sensitive DB unique index from letting
 * "Estoque" and "ESTOQUE" coexist. Returns '' for blank input (caller rejects).
 */
export function normalizeOptionValue(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export async function listProductOptions(
  tenantId: string,
  kind: ProductOptionKind,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('tenant_product_options')
    .select('value, sort_order')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('value', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.value as string);
}

export async function listProductOptionRows(
  tenantId: string,
  kind: ProductOptionKind,
): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from('tenant_product_options')
    .select('id, tenant_id, kind, value, sort_order')
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('sort_order', { ascending: true })
    .order('value', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductOption[];
}

export async function addProductOption(
  tenantId: string,
  kind: ProductOptionKind,
  rawValue: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = normalizeOptionValue(rawValue);
  if (!value) return { ok: false, error: 'Informe um valor.' };
  const { error } = await supabase
    .from('tenant_product_options')
    .insert({ tenant_id: tenantId, kind, value });
  if (error) {
    if (error.code === '23505') return { ok: false, error: `"${value}" já existe.` };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeProductOption(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tenant_product_options')
    .delete()
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/productOptions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/productOptions.ts src/services/productOptions.test.ts
git commit -m "feat(options): productOptions service + value normalizer"
```

---

## Task 3: Settings page to manage both lists

**Files:**
- Create: `src/components/settings/ProductOptionsPage.tsx`
- Modify: `src/components/settings/TenantSettingsLayout.tsx:36-46`
- Modify: `src/App.tsx:488-491`

- [ ] **Step 1: Create the page**

```tsx
// src/components/settings/ProductOptionsPage.tsx
//
// Tenant admin management of the per-tenant "Onde" (placement) and "Local"
// (store) value lists. Members can read these; only admins can add/remove
// (enforced by RLS on tenant_product_options).
import { useEffect, useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import {
  addProductOption,
  listProductOptionRows,
  removeProductOption,
  type ProductOption,
  type ProductOptionKind,
} from '../../services/productOptions';

const LISTS: { kind: ProductOptionKind; title: string; hint: string }[] = [
  { kind: 'onde', title: 'Onde (local físico do produto)', hint: 'Ex.: ESTOQUE, GAVETA, VITRINE' },
  { kind: 'local', title: 'Local (loja)', hint: 'Ex.: LOJA PRINCIPAL, BRASÍLIA SHOPPING' },
];

const OptionList = ({ kind, title, hint }: { kind: ProductOptionKind; title: string; hint: string }) => {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? '';
  const [rows, setRows] = useState<ProductOption[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!tenantId) return;
    try {
      setRows(await listProductOptionRows(tenantId, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    }
  };

  useEffect(() => { void load(); }, [tenantId, kind]);

  const handleAdd = async () => {
    if (!tenantId || !draft.trim()) return;
    setBusy(true);
    setError('');
    const res = await addProductOption(tenantId, kind, draft);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDraft('');
    void load();
  };

  const handleRemove = async (id: string) => {
    setBusy(true);
    setError('');
    const res = await removeProductOption(id);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    void load();
  };

  return (
    <section className="rounded-2xl border border-border/40 bg-card p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
          placeholder="Novo valor"
          className="flex-1 rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring/60"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !draft.trim()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Adicionar
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-4 flex flex-wrap gap-2">
        {rows.length === 0 && <li className="text-xs text-muted-foreground">Nenhum valor ainda.</li>}
        {rows.map((row) => (
          <li key={row.id} className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted px-3 py-1 text-xs uppercase tracking-[0.15em]">
            {row.value}
            <button
              type="button"
              onClick={() => handleRemove(row.id)}
              disabled={busy}
              aria-label={`Remover ${row.value}`}
              className="text-muted-foreground hover:text-red-600">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ProductOptionsPage = () => (
  <div className="space-y-6">
    {LISTS.map((l) => <OptionList key={l.kind} {...l} />)}
  </div>
);

export default ProductOptionsPage;
```

- [ ] **Step 2: Add the nav link** in `TenantSettingsLayout.tsx`, after the "Join requests" `<Link>` (around line 45), inside the same `<nav>`:

```tsx
          <Link
            to="/settings/product-options"
            className={`rounded-full px-3 py-1 transition ${
              location.pathname.startsWith("/settings/product-options")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            Onde / Local
          </Link>
```

- [ ] **Step 3: Add the route** in `App.tsx`. Import near line 20:

```tsx
import ProductOptionsPage from './components/settings/ProductOptionsPage';
```

Then inside the `<Route element={<TenantSettingsLayout />}>` block (line 488-491), add a sibling route before the `/settings` redirect:

```tsx
						<Route path="/settings/product-options" element={<ProductOptionsPage />} />
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Manual: log in as admin, open Settings → "Onde / Local", add "VITRINE" to Onde, see it appear, remove it, see it disappear. Adding a duplicate shows `"X já existe."`.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ProductOptionsPage.tsx src/components/settings/TenantSettingsLayout.tsx src/App.tsx
git commit -m "feat(settings): manage Onde/Local value lists"
```

---

## Task 4: Consume lists in product edit, StatusUpdateForm, BulkEdit

**Files:**
- Modify: `src/components/ProductsPage.tsx` (edit drawer "Onde" + "Local" inputs; option source; BulkEdit props)
- Modify: `src/StatusUpdateForm.tsx:6,413-431`
- Modify: `src/components/products/BulkEditFieldPopover.tsx` (already takes `statusOptions`/`locationOptions` props — feed managed lists)

- [ ] **Step 1: Load the lists in ProductsPage.** Near the existing `useState` block (around `src/components/ProductsPage.tsx:49`), add state and a load effect. `tenantId` is already a prop.

```tsx
	const [ondeOptions, setOndeOptions] = useState<string[]>([]);
	const [localOptions, setLocalOptions] = useState<string[]>([]);

	useEffect(() => {
		if (!tenantId) return;
		void listProductOptions(tenantId, 'onde').then(setOndeOptions).catch(() => {});
		void listProductOptions(tenantId, 'local').then(setLocalOptions).catch(() => {});
	}, [tenantId]);
```

Add the import at the top of the file:

```tsx
import { listProductOptions } from '../services/productOptions';
```

- [ ] **Step 2: Turn the "Onde" edit input into a select.** Replace the free-text input (the block rendering `editDraft.status`, around `ProductsPage.tsx:786-793`):

```tsx
											<select
												value={editDraft.status}
												onChange={(event) => updateDraft({ status: event.target.value })}
												className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
												{!ondeOptions.includes(editDraft.status) && (
													<option value={editDraft.status}>{editDraft.status || 'Selecione…'}</option>
												)}
												{ondeOptions.map((opt) => (
													<option key={opt} value={opt}>{opt}</option>
												))}
											</select>
```

(The leading `!includes` option preserves a product's current value even if an admin later removed it from the list, so editing an unrelated field never silently rewrites "Onde".)

- [ ] **Step 3: Turn the "Local" edit input into a select** the same way. Find the `editDraft.location` input in the same drawer and replace it with:

```tsx
											<select
												value={editDraft.location}
												onChange={(event) => updateDraft({ location: event.target.value })}
												className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
												{!localOptions.includes(editDraft.location) && (
													<option value={editDraft.location}>{editDraft.location || 'Selecione…'}</option>
												)}
												{localOptions.map((opt) => (
													<option key={opt} value={opt}>{opt}</option>
												))}
											</select>
```

- [ ] **Step 4: Feed managed lists to BulkEdit.** Find where `<BulkEditFieldPopover` is rendered in `ProductsPage.tsx` and pass the managed lists instead of the catalog-derived ones:

```tsx
						statusOptions={ondeOptions.length ? ondeOptions : statusOptions}
						locationOptions={localOptions.length ? localOptions : locations}
```

(Falls back to the existing catalog-derived `statusOptions`/`locations` memos if a tenant has no managed list yet.)

- [ ] **Step 5: StatusUpdateForm reads the 'onde' list.** In `src/StatusUpdateForm.tsx`, remove the hardcoded `const STATUS_SUGGESTIONS = ['ESTOQUE', 'GAVETA', 'VM'];` (line 6) and load from the tenant. Add imports:

```tsx
import { useEffect, useState } from 'react';
import { listProductOptions } from './services/productOptions';
```

Inside the component (it already calls `useTenant()` for `tenant`), add:

```tsx
	const [ondeOptions, setOndeOptions] = useState<string[]>([]);
	useEffect(() => {
		if (!tenant?.id) return;
		void listProductOptions(tenant.id, 'onde').then(setOndeOptions).catch(() => {});
	}, [tenant?.id]);
```

Replace the `{STATUS_SUGGESTIONS.map(...)}` inside the `<select>` (around line 423-429) with `{ondeOptions.map(...)}` keeping the existing `<option value="" disabled>Selecione onde está</option>` first.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Manual: edit a product → "Onde" and "Local" are now dropdowns sourced from the Settings lists; the product's current value stays selected even if not in the list. Bulk-edit "Onde" lists the managed values. StatusUpdateForm shows managed values.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductsPage.tsx src/StatusUpdateForm.tsx
git commit -m "feat(products): Onde/Local edited via managed dropdowns"
```

---

## Task 5: Wire the Dashboard store filter (products)

**Files:**
- Modify: `src/components/Dashboard.tsx:113-123` (the orphan `<select>`)
- Modify: `src/components/Dashboard.tsx:221-285` (pass filtered products to subpages)

- [ ] **Step 1: Add filter state + derived list.** After the `locations` memo (`Dashboard.tsx:76-79`), add:

```tsx
	const [locationFilter, setLocationFilter] = useState<'all' | string>('all');

	const visibleProducts = useMemo(
		() => (locationFilter === 'all' ? products : products.filter((p) => p.location === locationFilter)),
		[products, locationFilter],
	);
```

- [ ] **Step 2: Wire the select.** Replace the orphan select (`Dashboard.tsx:113-123`):

```tsx
									<select
										value={locationFilter}
										onChange={(e) => setLocationFilter(e.target.value)}
										className="h-9 cursor-pointer rounded-full border border-border/40 bg-card px-3 text-[11px] uppercase tracking-[0.3em] text-muted-foreground outline-none transition hover:border-border/70 focus:border-ring/60 focus:ring-1 focus:ring-ring/20">
										<option value="all">Todos os locais</option>
										{locations.map((loc) => (
											<option key={loc} value={loc}>
												{loc}
											</option>
										))}
									</select>
```

- [ ] **Step 3: Feed filtered products to the product-facing surfaces.** Change the `products={products}` props on `<OverviewPage>` (line 222) and `<ProductsPage>` (line 237) to `products={visibleProducts}`. Leave Clients/Sellers/Orders on the full set for now (they are not location-scoped until Phase 6).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Manual (tenant has ≥2 stores): pick "Brasília Shopping" in the top filter → Overview KPIs and the Products list recompute to that store; "Todos os locais" restores the full set.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(dashboard): wire store filter to products + overview"
```

---

## Task 6 (OPTIONAL follow-up): store on sales_orders → revenue by store

Deferred by default. Implementing the "Tudo" alcance (filter revenue by store) needs `sales_orders.location` plus changes to the sale RPCs (`register_sale_order`, etc.). **Per memory `project_warehouse_sales_migrations_risk`, those migrations/RPCs MUST be applied to the app's Supabase or sale/void break at runtime.** Treat as its own plan once Phases 1–5 are merged and verified.

---

## Self-Review

- **Spec coverage:** "where values are defined" → Task 1 (table) + Task 3 (Settings UI). "Onde becomes dropdown" → Task 4 steps 2/5. "Local managed too" → Task 1 (kind 'local') + Task 4 step 3. "Dashboard filter interactive" → Task 5. "spans products + sales" → products in Task 5; sales explicitly deferred to Task 6 with rationale.
- **Placeholder scan:** every code step shows real code; no TBD/“handle errors” placeholders.
- **Type consistency:** `ProductOptionKind` ('onde'|'local'), `listProductOptions(tenantId, kind): string[]`, `listProductOptionRows(...)→ProductOption[]`, `addProductOption`, `removeProductOption` used identically across Tasks 2–5. BulkEdit prop names `statusOptions`/`locationOptions` match existing `BulkEditFieldPopover` signature.
