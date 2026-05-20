# Products: In-UI CRUD + Bulk Action Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `ProductsPage` with create, delete, and bulk-action capabilities so Products can be fully managed in-UI without re-running a CSV import.

**Architecture:** All changes are client-side, layered on top of the existing drawer pattern in `src/components/ProductsPage.tsx`. New pure helpers go in `src/utils/bulk.ts`. New presentational components (`BulkActionBar`, `ConfirmDialog`, `BulkResultDialog`) live under `src/components/products/`. No DB migration; existing RLS enforces permissions.

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind. Supabase JS SDK 2.48. Vitest for pure-function unit tests. No React Testing Library available, so UI behavior is verified manually per the spec's test plan.

**Spec:** `docs/superpowers/specs/2026-05-19-products-inline-edit-design.md` — read it first.

**Copy language:** New user-facing strings ship in English (per project policy 2026-05-12). Existing pt-BR strings in `ProductsPage` stay untouched unless directly modified by a task.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/utils/bulk.ts` | Create | `chunked()` helper + `BulkResult` type + `aggregateBulkResults()` helper |
| `src/utils/bulk.test.ts` | Create | Vitest tests for the above |
| `src/components/products/ConfirmDialog.tsx` | Create | Reusable destructive-action confirm dialog |
| `src/components/products/BulkActionBar.tsx` | Create | Dark action bar above table, renders when selection ≥ 1 |
| `src/components/products/BulkEditFieldPopover.tsx` | Create | Field + value picker shown by "Edit field…" |
| `src/components/products/BulkResultDialog.tsx` | Create | Shows success count + per-row failure reasons |
| `src/components/ProductsPage.tsx` | Modify | Add create mode, delete, selection, toolbar wiring |
| `src/types.ts` | Modify (if needed) | Confirm `Product` type has `is_active`; add if missing |

---

## Task 1: Bulk helpers (`chunked` + `BulkResult`)

**Files:**
- Create: `src/utils/bulk.ts`
- Create: `src/utils/bulk.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/utils/bulk.test.ts
import { describe, expect, it } from 'vitest';
import { aggregateBulkResults, chunked, type BulkResult } from './bulk';

describe('chunked', () => {
  it('splits an array into fixed-size chunks', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunked([], 500)).toEqual([]);
  });

  it('returns one chunk when input fits', () => {
    expect(chunked([1, 2, 3], 500)).toEqual([[1, 2, 3]]);
  });

  it('throws on non-positive size', () => {
    expect(() => chunked([1], 0)).toThrow();
  });
});

describe('aggregateBulkResults', () => {
  it('sums successes and concatenates failures', () => {
    const a: BulkResult = { succeeded: 3, failed: [{ id: 'x', reason: 'fk' }] };
    const b: BulkResult = { succeeded: 2, failed: [] };
    expect(aggregateBulkResults([a, b])).toEqual({
      succeeded: 5,
      failed: [{ id: 'x', reason: 'fk' }],
    });
  });

  it('returns zero result for empty input', () => {
    expect(aggregateBulkResults([])).toEqual({ succeeded: 0, failed: [] });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/utils/bulk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/bulk.ts
export type BulkFailure = { id: string; reason: string };
export type BulkResult = { succeeded: number; failed: BulkFailure[] };

export const chunked = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) throw new Error('chunked: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

export const aggregateBulkResults = (results: BulkResult[]): BulkResult =>
  results.reduce<BulkResult>(
    (acc, r) => ({ succeeded: acc.succeeded + r.succeeded, failed: [...acc.failed, ...r.failed] }),
    { succeeded: 0, failed: [] },
  );
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- src/utils/bulk.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/bulk.ts src/utils/bulk.test.ts
git commit -m "feat(products): add bulk helpers (chunked, aggregateBulkResults)"
```

---

## Task 2: `ConfirmDialog` component

**Files:**
- Create: `src/components/products/ConfirmDialog.tsx`

A small modal used by single delete, bulk delete, and FK-blocked "Set inactive" prompt. No external deps — pure Tailwind on a portal-less fixed overlay.

- [ ] **Step 1: Implement**

```tsx
// src/components/products/ConfirmDialog.tsx
type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? 'rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Manually verify (no UI test framework available)**

Render the component temporarily in `ProductsPage` with `open={true}` and confirm:
- Overlay covers the page.
- Cancel/Confirm buttons fire their callbacks.
- Destructive variant renders red.

Remove the temporary render before committing.

- [ ] **Step 3: Commit**

```bash
git add src/components/products/ConfirmDialog.tsx
git commit -m "feat(products): add reusable ConfirmDialog component"
```

---

## Task 3: Drawer create mode — state plumbing

**Files:**
- Modify: `src/components/ProductsPage.tsx`

Introduce `drawerMode` so the drawer can render both `'edit'` and `'create'`. No UI change yet — this task is plumbing only.

- [ ] **Step 1: Add `drawerMode` state**

In the state block (around line 37–42), add:

```tsx
const [drawerMode, setDrawerMode] = useState<'edit' | 'create' | null>(null);
```

- [ ] **Step 2: Update `startEditProduct` and `closeEditPanel`**

In `startEditProduct` (around line 74–91), add at the end:

```tsx
setDrawerMode('edit');
```

In `closeEditPanel` (around line 104–110), add:

```tsx
setDrawerMode(null);
```

- [ ] **Step 3: Verify no behavior change**

Run: `npm run dev`. Open Products page, click a product row. Drawer opens as before. Close it. No errors in console.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): introduce drawerMode state (no-op refactor)"
```

---

## Task 4: Drawer create mode — empty draft + New Product button

**Files:**
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Add a `startCreateProduct` handler**

After `startEditProduct` (after line 91), add:

```tsx
const startCreateProduct = () => {
  setSelectedProductId(null);
  setEditDraft({
    id: '',
    name: '',
    sku: '',
    status: 'ESTOQUE',
    location: 'Loja principal',
    qty: '0',
    min: '',
    price: '',
    barcode: '',
    image: '',
  });
  setEditDirty(false);
  setEditError('');
  setIsEditPanelOpen(true);
  setDrawerMode('create');
};
```

- [ ] **Step 2: Add a "New product" button to the page header**

Locate the page-header flex container (around line 177–180, `<div className="flex flex-wrap items-center justify-between gap-4">`). Add a button to the right side:

```tsx
<button
  type="button"
  onClick={startCreateProduct}
  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
>
  New product
</button>
```

- [ ] **Step 3: Update drawer title to reflect mode**

Find the drawer's title element (the existing "Editar produto" or similar heading inside the side panel). Replace its content with:

```tsx
{drawerMode === 'create' ? 'New product' : 'Edit product'}
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`. Click "New product" — drawer opens with empty fields. Click an existing row — drawer opens populated. Switch between them. Close drawer.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): add New product button opening drawer in create mode"
```

---

## Task 5: Create mutation — `insert` on save when in create mode

**Files:**
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Branch `handleSaveDraft` on drawer mode**

Replace the body of `handleSaveDraft` (line 126–173). Keep parsing and payload construction unchanged; branch the Supabase call:

```tsx
const handleSaveDraft = async () => {
  if (!tenantId || !editDraft) return;
  setEditSaving(true);
  setEditError('');

  const qty = parseOptionalInteger(editDraft.qty) ?? 0;
  const min = parseOptionalInteger(editDraft.min);
  const price = parseOptionalNumber(editDraft.price);
  const status = editDraft.status.trim() || 'ESTOQUE';
  const location = editDraft.location.trim() || 'Loja principal';
  const barcode = editDraft.barcode.trim();
  const image = editDraft.image.trim();
  const sku = editDraft.sku.trim();
  const name = editDraft.name.trim();

  if (drawerMode === 'create' && (!sku || !name)) {
    setEditError('SKU and Name are required.');
    setEditSaving(false);
    return;
  }

  const payload = { status, location, qty, min, price, barcode: barcode || null, image: image || null };

  try {
    if (drawerMode === 'create') {
      const { data, error } = await supabase
        .from('products')
        .insert({ ...payload, sku, name, tenant_id: tenantId, is_active: true })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          setEditError(`A product with SKU "${sku}" already exists.`);
        } else {
          throw error;
        }
        return;
      }
      if (data && onProductUpdated) onProductUpdated(data as Product);
      closeEditPanel();
      return;
    }

    const { error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', editDraft.id)
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const existing = products.find((item) => item.id === editDraft.id);
    if (existing && onProductUpdated) {
      onProductUpdated({
        ...existing,
        status,
        location,
        qty,
        min: min ?? undefined,
        price: price ?? undefined,
        barcode: barcode || undefined,
        image: image || undefined,
      });
    }
    setEditDirty(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.';
    setEditError(message);
  } finally {
    setEditSaving(false);
  }
};
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev`.
- Create a new product with valid SKU + Name → row appears in list, drawer closes.
- Create with empty SKU → inline error, drawer stays open.
- Create with a duplicate SKU → "A product with SKU X already exists" error.
- Edit an existing product (existing flow) → still works.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): wire insert mutation for create mode with duplicate SKU handling"
```

---

## Task 6: Single-record delete with FK-block "Set inactive" path

**Files:**
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Add delete state**

Below `editSaving` state, add:

```tsx
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
const [fkBlockOpen, setFkBlockOpen] = useState(false);
```

- [ ] **Step 2: Add delete handlers**

After `handleSaveDraft`, add:

```tsx
const handleDeleteProduct = async () => {
  if (!tenantId || !editDraft || drawerMode !== 'edit') return;
  setEditSaving(true);
  setEditError('');
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', editDraft.id)
      .eq('tenant_id', tenantId);
    if (error) {
      if (error.code === '23503') {
        setDeleteConfirmOpen(false);
        setFkBlockOpen(true);
        return;
      }
      throw error;
    }
    if (onProductUpdated) {
      const existing = products.find((item) => item.id === editDraft.id);
      if (existing) onProductUpdated({ ...existing, _deleted: true } as Product & { _deleted: true });
    }
    setDeleteConfirmOpen(false);
    closeEditPanel();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed.';
    setEditError(message);
  } finally {
    setEditSaving(false);
  }
};

const handleSetInactiveFromFkBlock = async () => {
  if (!tenantId || !editDraft) return;
  setEditSaving(true);
  try {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', editDraft.id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    const existing = products.find((item) => item.id === editDraft.id);
    if (existing && onProductUpdated) onProductUpdated({ ...existing, is_active: false } as Product);
    setFkBlockOpen(false);
    closeEditPanel();
  } catch (err) {
    setEditError(err instanceof Error ? err.message : 'Update failed.');
  } finally {
    setEditSaving(false);
  }
};
```

**Note on `_deleted` marker:** the parent's `onProductUpdated` handler must recognize this flag and remove the product from the local list. If it doesn't yet, that's a separate small change in the parent that holds `products` state (likely `Dashboard.tsx` or the hook `useDashboardData`). Inspect the call site and adjust accordingly — if simpler, replace `_deleted` with a new `onProductDeleted(id)` callback prop. Implement whichever fits the existing parent shape.

- [ ] **Step 3: Add a "Danger zone" section + button in the drawer (edit mode only)**

Inside the drawer JSX, before the save/cancel footer, add:

```tsx
{drawerMode === 'edit' && (
  <div className="mt-8 rounded border border-red-200 bg-red-50 p-4">
    <h4 className="text-sm font-semibold text-red-900">Danger zone</h4>
    <p className="mt-1 text-xs text-red-800">
      Deleting a product is permanent. Products referenced by sales records can't be deleted.
    </p>
    <button
      type="button"
      onClick={() => setDeleteConfirmOpen(true)}
      className="mt-3 rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
      disabled={editSaving}
    >
      Delete product
    </button>
  </div>
)}
```

- [ ] **Step 4: Render the two dialogs**

Below the drawer JSX (but inside the page root), add:

```tsx
<ConfirmDialog
  open={deleteConfirmOpen}
  title="Delete product?"
  message={`Delete "${editDraft?.name}"? This cannot be undone.`}
  confirmLabel="Delete"
  destructive
  onConfirm={handleDeleteProduct}
  onCancel={() => setDeleteConfirmOpen(false)}
/>
<ConfirmDialog
  open={fkBlockOpen}
  title="Can't delete"
  message={`"${editDraft?.name}" has sales records and can't be deleted. Set it inactive instead?`}
  confirmLabel="Set inactive"
  onConfirm={handleSetInactiveFromFkBlock}
  onCancel={() => setFkBlockOpen(false)}
/>
```

Import `ConfirmDialog` at the top.

- [ ] **Step 5: Manually verify**

Run: `npm run dev`.
- Open an unreferenced product → click Delete → confirm → row gone.
- Open a product that has sales (create one via CSV if needed) → click Delete → confirm → FK-block dialog appears → click "Set inactive" → drawer closes, product is now `is_active: false`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): add single-product delete with FK-block 'set inactive' fallback"
```

---

## Task 7: Selection layer — checkbox column + selectedIds state

**Files:**
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Add `selectedIds` state**

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Add a toggle helper**

```tsx
const toggleSelection = (id: string) => {
  setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};
```

- [ ] **Step 3: Reset selection on filter / search changes**

Wrap the filter setter calls so any of these clears selection:
- `setProductQuery`
- `setProductStatusFilter`
- `setProductLocationFilter`

Easiest: add a `useEffect` that clears `selectedIds` whenever any filter input changes:

```tsx
import { useEffect, useMemo, useState } from 'react';
// ...
useEffect(() => {
  setSelectedIds(new Set());
}, [productQuery, productStatusFilter, productLocationFilter]);
```

- [ ] **Step 4: Add checkbox column to the table**

Find the table `<thead>` row. Add as the first `<th>`:

```tsx
<th className="w-10 px-2 py-2">
  <input
    type="checkbox"
    aria-label="Select all on page"
    checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id))}
    onChange={(e) => {
      if (e.target.checked) setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
      else setSelectedIds(new Set());
    }}
  />
</th>
```

In the row template (the `<tr>` mapped from `filteredProducts`), add as the first `<td>`:

```tsx
<td className="w-10 px-2 py-2" onClick={(e) => e.stopPropagation()}>
  <input
    type="checkbox"
    aria-label={`Select ${product.sku}`}
    checked={selectedIds.has(product.id)}
    onChange={() => toggleSelection(product.id)}
  />
</td>
```

The `stopPropagation` prevents the row-click-opens-drawer behavior from firing when the user clicks the checkbox.

- [ ] **Step 5: Manually verify**

Run: `npm run dev`.
- Click row checkboxes → individual selection toggles.
- Click header checkbox → all visible rows select; click again → all deselect.
- Change filter or search → selection clears.
- Click a row body (not checkbox) → drawer still opens.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): add row selection with checkbox column and select-all-on-page"
```

---

## Task 8: `BulkActionBar` component (shell, no actions wired yet)

**Files:**
- Create: `src/components/products/BulkActionBar.tsx`
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/products/BulkActionBar.tsx
type BulkActionBarProps = {
  selectedCount: number;
  onEditField: () => void;
  onDelete: () => void;
  onClear: () => void;
  busy?: boolean;
};

export const BulkActionBar = ({ selectedCount, onEditField, onDelete, onClear, busy }: BulkActionBarProps) => {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-t bg-slate-800 px-4 py-2 text-white">
      <span className="text-sm">{selectedCount} selected</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEditField}
          disabled={busy}
          className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600 disabled:opacity-50"
        >
          Edit field…
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded bg-red-600 px-3 py-1 text-sm hover:bg-red-700 disabled:opacity-50"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="rounded bg-transparent px-3 py-1 text-sm underline hover:bg-slate-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire it into ProductsPage above the table**

Import the component. Just above the `<table>` element, render:

```tsx
<BulkActionBar
  selectedCount={selectedIds.size}
  onEditField={() => { /* wired in Task 9 */ }}
  onDelete={() => { /* wired in Task 10 */ }}
  onClear={() => setSelectedIds(new Set())}
/>
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`.
- Select a row → action bar appears with count "1 selected".
- Click Clear → bar disappears.
- Edit field / Delete buttons do nothing yet (expected).

- [ ] **Step 4: Commit**

```bash
git add src/components/products/BulkActionBar.tsx src/components/ProductsPage.tsx
git commit -m "feat(products): add BulkActionBar component (clear wired)"
```

---

## Task 9: Bulk edit field — popover + chunked update

**Files:**
- Create: `src/components/products/BulkEditFieldPopover.tsx`
- Create: `src/components/products/BulkResultDialog.tsx`
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Implement `BulkResultDialog`**

```tsx
// src/components/products/BulkResultDialog.tsx
import type { BulkResult } from '../../utils/bulk';

type Props = {
  open: boolean;
  result: BulkResult | null;
  action: 'updated' | 'deleted';
  onClose: () => void;
};

export const BulkResultDialog = ({ open, result, action, onClose }: Props) => {
  if (!open || !result) return null;
  const total = result.succeeded + result.failed.length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{action === 'updated' ? 'Update' : 'Delete'} complete</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {result.succeeded} of {total} products {action}.
          {result.failed.length > 0 && ` ${result.failed.length} failed.`}
        </p>
        {result.failed.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Show failures</summary>
            <ul className="mt-2 max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 text-xs">
              {result.failed.map((f) => (
                <li key={f.id} className="py-0.5">
                  <span className="font-mono">{f.id}</span>: {f.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Implement `BulkEditFieldPopover`**

```tsx
// src/components/products/BulkEditFieldPopover.tsx
import { useState } from 'react';

export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

type Props = {
  open: boolean;
  count: number;
  onApply: (field: BulkEditableField, value: unknown) => void;
  onCancel: () => void;
};

export const BulkEditFieldPopover = ({ open, count, onApply, onCancel }: Props) => {
  const [field, setField] = useState<BulkEditableField>('status');
  const [value, setValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean>(true);
  if (!open) return null;

  const submit = () => {
    if (field === 'is_active') return onApply(field, boolValue);
    if (field === 'price') return onApply(field, value === '' ? null : Number(value));
    if (field === 'min') return onApply(field, value === '' ? null : Number.parseInt(value, 10));
    return onApply(field, value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Edit field on {count} products</h3>

        <label className="mt-4 block text-sm font-medium">Field</label>
        <select
          value={field}
          onChange={(e) => setField(e.target.value as BulkEditableField)}
          className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
        >
          <option value="status">Status</option>
          <option value="is_active">Active</option>
          <option value="location">Location</option>
          <option value="price">Price</option>
          <option value="min">Min stock</option>
        </select>

        <label className="mt-4 block text-sm font-medium">Value</label>
        {field === 'is_active' ? (
          <select
            value={String(boolValue)}
            onChange={(e) => setBoolValue(e.target.value === 'true')}
            className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={field === 'price' || field === 'min' ? 'number' : 'text'}
            className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
          />
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Wire bulk-edit handler in `ProductsPage`**

Add state:

```tsx
const [bulkEditOpen, setBulkEditOpen] = useState(false);
const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
const [bulkResultAction, setBulkResultAction] = useState<'updated' | 'deleted'>('updated');
const [bulkBusy, setBulkBusy] = useState(false);
```

Imports:

```tsx
import { aggregateBulkResults, chunked, type BulkResult } from '../utils/bulk';
import { BulkActionBar } from './products/BulkActionBar';
import { BulkEditFieldPopover, type BulkEditableField } from './products/BulkEditFieldPopover';
import { BulkResultDialog } from './products/BulkResultDialog';
```

Handler:

```tsx
const handleBulkEditField = async (field: BulkEditableField, value: unknown) => {
  if (!tenantId || selectedIds.size === 0) return;
  setBulkBusy(true);
  setBulkEditOpen(false);
  const ids = Array.from(selectedIds);
  const perChunk: BulkResult[] = [];

  for (const chunk of chunked(ids, 500)) {
    const { data, error } = await supabase
      .from('products')
      .update({ [field]: value })
      .in('id', chunk)
      .eq('tenant_id', tenantId)
      .select('id');
    if (error) {
      perChunk.push({ succeeded: 0, failed: chunk.map((id) => ({ id, reason: error.message })) });
    } else {
      const updatedIds = new Set((data ?? []).map((r) => r.id));
      const failed = chunk.filter((id) => !updatedIds.has(id)).map((id) => ({ id, reason: 'No permission or row not found' }));
      perChunk.push({ succeeded: updatedIds.size, failed });
    }
  }

  const result = aggregateBulkResults(perChunk);
  setBulkResult(result);
  setBulkResultAction('updated');
  setBulkBusy(false);

  if (onProductUpdated) {
    products.forEach((p) => {
      if (selectedIds.has(p.id) && !result.failed.some((f) => f.id === p.id)) {
        onProductUpdated({ ...p, [field]: value } as Product);
      }
    });
  }
  setSelectedIds(new Set());
};
```

Update the `BulkActionBar` props:

```tsx
<BulkActionBar
  selectedCount={selectedIds.size}
  busy={bulkBusy}
  onEditField={() => setBulkEditOpen(true)}
  onDelete={() => { /* Task 10 */ }}
  onClear={() => setSelectedIds(new Set())}
/>
```

Render dialogs:

```tsx
<BulkEditFieldPopover
  open={bulkEditOpen}
  count={selectedIds.size}
  onApply={handleBulkEditField}
  onCancel={() => setBulkEditOpen(false)}
/>
<BulkResultDialog
  open={bulkResult !== null}
  result={bulkResult}
  action={bulkResultAction}
  onClose={() => setBulkResult(null)}
/>
```

- [ ] **Step 4: Manually verify**

Run: `npm run dev`.
- Select 3 rows → click "Edit field…" → choose "Active" → "Inactive" → Apply.
- Result dialog shows "3 of 3 updated".
- Verify rows show as inactive in the list.
- Try with a member (non-admin) account if available → RLS blocks → result dialog shows N failures with "No permission" reason.

- [ ] **Step 5: Commit**

```bash
git add src/components/products/ src/components/ProductsPage.tsx
git commit -m "feat(products): add bulk edit-field with chunked update and result dialog"
```

---

## Task 10: Bulk delete with FK-aware result

**Files:**
- Modify: `src/components/ProductsPage.tsx`

- [ ] **Step 1: Add state and handler**

```tsx
const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
```

```tsx
const handleBulkDelete = async () => {
  if (!tenantId || selectedIds.size === 0) return;
  setBulkBusy(true);
  setBulkDeleteConfirmOpen(false);
  const ids = Array.from(selectedIds);
  const perChunk: BulkResult[] = [];

  for (const chunk of chunked(ids, 500)) {
    // Delete one at a time within the chunk so FK-blocked rows don't fail the whole chunk.
    let succeeded = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const id of chunk) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) {
        if (error.code === '23503') {
          failed.push({ id, reason: 'Referenced by sales records' });
        } else {
          failed.push({ id, reason: error.message });
        }
      } else {
        succeeded += 1;
      }
    }
    perChunk.push({ succeeded, failed });
  }

  const result = aggregateBulkResults(perChunk);
  setBulkResult(result);
  setBulkResultAction('deleted');
  setBulkBusy(false);

  if (onProductUpdated) {
    const failedSet = new Set(result.failed.map((f) => f.id));
    products.forEach((p) => {
      if (selectedIds.has(p.id) && !failedSet.has(p.id)) {
        onProductUpdated({ ...p, _deleted: true } as Product & { _deleted: true });
      }
    });
  }
  setSelectedIds(new Set());
};
```

**Note:** the per-row loop inside each chunk is intentional — Supabase's `.delete().in('id', chunk)` would fail the entire `IN` clause if any row is FK-blocked. Iterating gives accurate per-row results at the cost of N round-trips. If perf becomes an issue past ~100 selections, switch to: first try `.in()`, on FK error fall back to per-row for that chunk.

- [ ] **Step 2: Wire the toolbar button**

```tsx
onDelete={() => setBulkDeleteConfirmOpen(true)}
```

- [ ] **Step 3: Render the confirm dialog**

```tsx
<ConfirmDialog
  open={bulkDeleteConfirmOpen}
  title={`Delete ${selectedIds.size} products?`}
  message="This cannot be undone. Products referenced by sales records will be skipped."
  confirmLabel="Delete"
  destructive
  onConfirm={handleBulkDelete}
  onCancel={() => setBulkDeleteConfirmOpen(false)}
/>
```

- [ ] **Step 4: Manually verify**

- Select 3 unreferenced products → bulk delete → result "3 of 3 deleted".
- Select a mix where at least one is referenced by sales → result shows the FK-blocked SKU in the failures list with reason "Referenced by sales records".
- Selection clears after the result dialog closes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductsPage.tsx
git commit -m "feat(products): add bulk delete with per-row FK handling"
```

---

## Task 11: Parent state — handle `_deleted` marker and new-product append

**Files:**
- Modify: `src/components/Dashboard.tsx` (lines 222–226)

The current handler only patches existing items. It must also (a) remove items flagged `_deleted` and (b) append items whose id isn't already in the list (covers create).

- [ ] **Step 1: Replace the inline handler**

In `Dashboard.tsx` at lines 222–226, replace:

```tsx
onProductUpdated={(updated) =>
  setProducts((current) =>
    current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
  )
}
```

with:

```tsx
onProductUpdated={(updated) =>
  setProducts((current) => {
    if ((updated as Product & { _deleted?: boolean })._deleted) {
      return current.filter((item) => item.id !== updated.id);
    }
    const idx = current.findIndex((item) => item.id === updated.id);
    if (idx === -1) return [...current, updated];
    const next = [...current];
    next[idx] = { ...next[idx], ...updated };
    return next;
  })
}
```

- [ ] **Step 3: Verify create-and-list path**

After this change, creating a new product (Task 5) should append it to the list, since the handler now appends when the id isn't found.

- [ ] **Step 4: Manually verify**

- Create a product → row appears.
- Delete a product → row disappears.
- Bulk delete → all successfully-deleted rows disappear; FK-blocked rows remain.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(products): support _deleted marker and new-product append in product state handler"
```

---

## Task 12: Manual end-to-end test pass

- [ ] **Step 1: Run the full manual test plan from the spec**

Walk through every item from "Testing" in `docs/superpowers/specs/2026-05-19-products-inline-edit-design.md`:

1. Create product with valid input → appears in list.
2. Create product with duplicate SKU → inline error, drawer stays open.
3. Create product missing required field → inline error.
4. Delete single product not referenced by sales → row gone.
5. Delete single product referenced by sales → FK error surfaces → "Set inactive" path works.
6. Select 3 rows, bulk-set `is_active = false` → all three update.
7. Select 50+ rows spanning two 500-row chunks → both chunks run.
8. Bulk delete with one FK-blocked row → result dialog lists the blocked SKU.
9. Member (non-admin) account: create rejected with error, edit/delete/bulk silently 0-affected → result dialog explains permissions.

- [ ] **Step 2: Type-check and lint**

Run:
```bash
npm run build
npm run lint
```

Both must pass with no errors.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(products): resolve issues from manual test pass"
```

---

## Done criteria

- All 12 tasks complete and committed.
- `npm test` passes (the 6 tests from Task 1).
- `npm run build` passes.
- `npm run lint` passes.
- Manual test plan (Task 12) all items verified.
- No new pt-BR copy strings introduced; all new strings are English.
