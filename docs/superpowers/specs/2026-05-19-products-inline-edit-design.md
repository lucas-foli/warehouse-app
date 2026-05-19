# Products: In-UI CRUD + Bulk Action Toolbar (Layer A)

**Status:** Draft — awaiting review
**Author:** Lucas Oliveira
**Date:** 2026-05-19
**Scope:** Products entity only. Clients, sellers, sales orders, and sales items are explicitly out of scope.

## Problem

CSV import is currently the only way to create, update, or delete products in bulk in warehouse-app. The single-product edit drawer exists in `ProductsPage.tsx` but cannot create or delete records, and there is no way to operate on multiple products at once without re-running an import. This means everyday corrections (add one product, kill three discontinued SKUs, mark 20 SKUs inactive) require leaving the app, editing a spreadsheet, and re-importing — friction that erodes the "the app just works" positioning we committed to.

## Goal

Make Products fully manageable in-UI, matching what CSV import can do today, by extending the existing drawer pattern rather than introducing new UI primitives.

Out of scope:
- Other entities (clients, sellers, orders, items) — separate future spec.
- Soft-delete semantics or audit history — schema does not support them and adding them is a separate decision.
- A spreadsheet edit mode for per-row bulk edits — CSV already covers that and the UI cost is high.
- "Select all matching filter" across pagination — page-level select-all covers v1.

## Non-goals (deliberate omissions)

- No form library introduction (Zod, react-hook-form). The existing manual-parse pattern stays.
- No TanStack Query introduction. Existing `onProductUpdated` callback + manual refetch stays.
- No new abstraction layer over Supabase. Direct `.insert()` / `.update()` / `.delete()` from the component.
- No new permission model. RLS continues to be the only enforcement (admins can write, members cannot).

## Architecture

Three coordinated changes inside `src/components/ProductsPage.tsx` and the small components it owns:

1. **Drawer mode extension** — the existing drawer gains a `create` mode and a `delete` action alongside today's `edit` mode.
2. **Selection layer** — the products table gains a leading checkbox column with `select-all-on-page` in the header.
3. **Bulk action toolbar** — a dark action bar that appears above the table when selection size ≥ 1.

No new routes. No new top-level components outside `ProductsPage` other than presentational helpers.

### Component shape

```
ProductsPage
├── ProductsToolbar (existing — filters, search)
├── BulkActionBar (new) — renders when selection.size >= 1
│   ├── selection count
│   ├── "Edit field…" → BulkEditFieldPopover
│   ├── "Delete" → ConfirmDialog
│   └── "Clear"
├── ProductsTable (existing — extended)
│   ├── checkbox column (new) — header + per-row
│   └── existing columns
└── ProductDrawer (existing — extended)
    ├── mode: 'edit' | 'create'
    ├── fields (unchanged)
    └── delete button (edit mode only) → ConfirmDialog
```

### State

All state stays in `ProductsPage` component state (consistent with current patterns):

- `editDraft: ProductDraft | null` — existing.
- `drawerMode: 'edit' | 'create' | null` — new (replaces implicit "drawer open if editDraft != null").
- `selectedIds: Set<string>` — new. Cleared on filter change, page change, and after successful bulk operations.
- `bulkOp: { kind: 'edit' | 'delete'; status: 'idle' | 'running' | 'done'; result?: BulkResult } | null` — new. Drives the result toast/dialog.

## Behavior

### Create

- "New product" button at the top of `ProductsPage`, next to the existing filter bar.
- Click → drawer opens with `drawerMode = 'create'` and empty `editDraft`.
- Save → `supabase.from('products').insert(draft).select().single()`.
- On success: close drawer, prepend to local product list (or trigger `onProductUpdated` refetch), toast "Product created".
- Required: `sku`, `name`. Same parse functions as edit. Unique constraint `(tenant_id, sku)` enforced by DB; on conflict error, surface "A product with SKU X already exists" inline next to the SKU field.

### Delete (single)

- In drawer, edit mode only: destructive button in a clearly-separated "Danger zone" section at the bottom.
- Click → confirm dialog: "Delete product X? This cannot be undone."
- Confirm → `supabase.from('products').delete().eq('id', id)`.
- On FK violation (product referenced by `sales_items`): surface "This product has N sales records and can't be deleted. Set it inactive instead?" with an inline "Set inactive" button that flips `is_active = false` and closes the drawer.

### Bulk edit (same value across N rows)

- Toolbar "Edit field…" → popover with two selects: **Field** (Status, Active, Location, Price, Min stock) and **Value** (input shape depends on field — boolean toggle for `is_active`, number input for price/min_stock, free-text for location, dropdown for status).
- Apply → chunked update in batches of 500 IDs:
  ```ts
  for (const chunk of chunks(Array.from(selectedIds), 500)) {
    await supabase.from('products').update({ [field]: value }).in('id', chunk);
  }
  ```
- Per-chunk success/failure is captured. After all chunks complete: show result dialog with success count and the list of failed IDs/reasons (if any). Successful rows are patched in local state; failed rows are unchanged.

### Bulk delete

- Toolbar "Delete" → confirm dialog: "Delete N products? This cannot be undone. Products referenced by sales records will be skipped."
- Confirm → chunked delete in batches of 500. FK-blocked rows surface in the same result dialog as bulk edit, with the explanation about sales records.
- Successful rows are removed from local state.

### Selection mechanics

- Header checkbox: empty → checked when any selected → checked-all when every visible row is selected. Clicking the header toggles all currently-visible rows.
- Selection is **not** persisted across:
  - Filter changes (cleared).
  - Page changes / scroll past virtualization boundary (cleared).
  - Drawer open/close (preserved — user may want to edit one item then return to bulk).
- "Clear" button in toolbar always clears.

## Data flow

```
User action
  → component state mutation (selectedIds / editDraft / drawerMode)
  → supabase client call (chunked for bulk)
  → onProductUpdated callback fires
  → parent refetches or patches local list
  → BulkActionBar shows result toast/dialog
```

No new query layer. No optimistic UI for v1 (pessimistic: show loading state on action button, wait for server response, then update local state). Optimistic UI is a follow-up if perf complaints arrive.

## Error handling

Three classes of error, each with a defined surface:

| Class | Example | Surface |
|---|---|---|
| Validation (client) | Empty SKU, malformed price | Inline next to field, on save click |
| Unique conflict | Duplicate SKU on create | Inline next to SKU field |
| FK / RLS / network | FK from sales_items, member trying to write, network blip | Toast for single ops; result dialog with per-row reason for bulk ops |

No silent failures. Every error surfaces text the user can act on.

## Testing

Existing repo has no test suite called out for ProductsPage. This spec does not introduce one — adding a test framework is a separate decision the user has not made. Manual test plan instead:

- Create product with valid input → appears in list.
- Create product with duplicate SKU → inline error, drawer stays open.
- Create product missing required field → inline error on that field.
- Delete single product not referenced by sales → row gone.
- Delete single product referenced by sales → FK error surfaces, "Set inactive" path works.
- Select 3 rows, bulk-set `is_active = false` → all three update, toolbar clears.
- Select 50+ rows spanning two 500-row chunks (seed if needed) → both chunks run, result reflects both.
- Bulk delete with one FK-blocked row → result dialog lists the blocked SKU with reason.
- Member (non-admin) account: create → RLS rejects with an error → inline error in drawer. Edit / delete / bulk op → RLS silently affects 0 rows → toast or result dialog says "You don't have permission to edit products" (not "Updated 0 of N"); see Open risks below.

## Migration / rollout

- Single PR. No DB migration needed — all behavior is client-side using existing tables, columns, and RLS policies.
- No feature flag. Layer A is small enough that gating it adds more code than it saves.
- Ship to production as soon as the manual test plan above passes.

## Open risks

- **No test coverage.** A bulk operation that corrupts data is harder to catch without tests. Mitigation: small chunks, pessimistic UI, dry-run confirm dialogs that show counts before apply. Long-term mitigation is the separate "introduce testing" decision.
- **RLS surprises.** If a member tries a bulk op and 0 rows update silently (RLS blocks without erroring), the result dialog would say "Updated 0 of N". Mitigation: detect 0-updated case explicitly and surface "You don't have permission to edit products" instead of a confusing zero.
- **Local state drift on bulk.** Patching local state for hundreds of rows after a bulk op may desync from DB if a concurrent CSV import is running. Mitigation: after any bulk op, trigger a full refetch (call `onProductUpdated()` with no patch), accepting one extra network round-trip in exchange for guaranteed consistency.

## Follow-ups (not in this spec)

- Layer B: list views and drawer CRUD for clients and sellers, reusing `BulkActionBar`.
- Layer C: parent/child UI for sales orders and items.
- Soft-delete / archive semantics (requires schema decision).
- Audit log for product mutations (requires schema decision).
- "Select all matching filter" across pagination.
- Spreadsheet bulk-edit mode (per-row).
- Optimistic UI for single edits if response latency becomes a complaint.
