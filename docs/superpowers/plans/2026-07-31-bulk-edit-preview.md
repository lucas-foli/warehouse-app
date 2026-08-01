# Edição em massa: preview antes de aplicar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A edição em massa passa a mostrar o antes→depois agregado e exigir Confirmar antes de gravar.

**Architecture:** Uma função pura (`src/utils/bulkEditPreview.ts`) agrupa os produtos
selecionados por transição (valor atual → novo) e classifica cada grupo (changed,
destructive). O `BulkEditFieldPopover` ganha um segundo passo (`edit` → `preview`) que
renderiza essa agregação; a gravação existente em `ProductsPage.handleBulkEditField` não
muda, só é chamada depois do Confirmar.

**Tech Stack:** React + TypeScript + Vite, Vitest, Tailwind. Supabase (inalterado nesta fatia).

**Spec:** `docs/superpowers/specs/2026-07-31-bulk-edit-preview-design.md`
**Alvo visual:** `docs/superpowers/specs/2026-07-31-bulk-edit-preview-preview.html` (referência
aprovada dos dois estados; implementar contra ele).

## Global Constraints

- Base da branch: `origin/main` @ `3f36088` (#62 mergeado). Baseline = 101 testes.
- Gate por commit: `npx tsc --noEmit` → 0 erros; `npx vitest run` → tudo passa; eslint limpo
  **nos arquivos tocados**.
- **Não tocar** os ~6 warnings de eslint pré-existentes fora da fatia (LoginForm,
  RequestsPage, MembersPage, JoinRequestsPage, ProductOptionsPage, PlatformAdminContext).
- **Não introduzir** `@testing-library/react`. A lógica é pura e testada sem UI; o passo de
  preview é verificado na checagem manual.
- Tokens reais do repo. Destaque destrutivo = padrão red default do Tailwind já usado no
  repo (`border-red-500/30 bg-red-500/10 text-red-700` / `text-red-600`); o design system
  **não tem** token semântico de perigo.
- Comando dos testes desta fatia: `npx vitest run src/utils/bulkEditPreview.test.ts`.

---

### Task 1: Função pura de preview (`bulkEditPreview.ts`)

**Files:**
- Create: `src/utils/bulkEditPreview.ts`
- Test: `src/utils/bulkEditPreview.test.ts`

**Interfaces:**
- Consumes: `Product` de `src/types` (campos usados: `status`, `location`, `price?`, `min?`,
  `is_active?`).
- Produces (Task 2 consome estes nomes/tipos exatos):
  - `type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min'`
  - `interface BulkEditGroup { from: unknown; to: unknown; count: number; changed: boolean; destructive: boolean }`
  - `interface BulkEditPreview { groups: BulkEditGroup[]; changedCount: number; unchangedCount: number; destructiveCount: number }`
  - `function computeBulkEditPreview(field: BulkEditableField, newValue: unknown, selected: Product[]): BulkEditPreview`
  - `function formatBulkFieldValue(field: BulkEditableField, value: unknown): string`

- [ ] **Step 1: Write the failing test**

Create `src/utils/bulkEditPreview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBulkEditPreview, formatBulkFieldValue } from './bulkEditPreview';
import type { Product } from '../types';

const p = (over: Partial<Product>): Product => ({
  id: over.id ?? 'x',
  name: 'n',
  sku: 's',
  status: 'A',
  location: 'L',
  qty: 0,
  ...over,
});

describe('computeBulkEditPreview', () => {
  it('price vazio apaga só os que tinham valor', () => {
    const r = computeBulkEditPreview('price', null, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
      p({ id: 'c', price: 30 }),
      p({ id: 'd', price: 30 }),
    ]);
    expect(r.changedCount).toBe(3);
    expect(r.destructiveCount).toBe(3);
    expect(r.unchangedCount).toBe(1);
    expect(r.groups.every((g) => (g.destructive ? g.to === null && g.changed : true))).toBe(true);
  });

  it('agrupa por transição e não conta sem-mudança como mudança', () => {
    const r = computeBulkEditPreview('price', 30, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
      p({ id: 'c', price: 30 }),
      p({ id: 'd', price: 30 }),
    ]);
    expect(r.groups).toHaveLength(3);
    expect(r.changedCount).toBe(2);
    expect(r.unchangedCount).toBe(2);
    expect(r.destructiveCount).toBe(0);
    expect(r.groups.find((g) => !g.changed)?.count).toBe(2);
  });

  it('is_active nunca é destrutivo e agrupa undefined à parte', () => {
    const r = computeBulkEditPreview('is_active', false, [
      p({ id: 'a', is_active: true }),
      p({ id: 'b', is_active: false }),
      p({ id: 'c', is_active: undefined }),
    ]);
    expect(r.destructiveCount).toBe(0);
    expect(r.changedCount).toBe(2);
    expect(r.groups).toHaveLength(3);
  });

  it('string: agrupa e nunca marca destrutivo', () => {
    const r = computeBulkEditPreview('status', 'B', [
      p({ id: 'a', status: 'A' }),
      p({ id: 'b', status: 'B' }),
    ]);
    expect(r.changedCount).toBe(1);
    expect(r.unchangedCount).toBe(1);
    expect(r.destructiveCount).toBe(0);
  });

  it('location agrupa por transição', () => {
    const r = computeBulkEditPreview('location', 'Loja 2', [
      p({ id: 'a', location: 'Loja 1' }),
      p({ id: 'b', location: 'Loja 2' }),
      p({ id: 'c', location: 'Loja 1' }),
    ]);
    expect(r.groups).toHaveLength(2);
    expect(r.changedCount).toBe(2);
    expect(r.unchangedCount).toBe(1);
  });

  it('seleção vazia → grupos vazios e contadores zero', () => {
    const r = computeBulkEditPreview('price', 30, []);
    expect(r.groups).toEqual([]);
    expect(r.changedCount).toBe(0);
    expect(r.unchangedCount).toBe(0);
    expect(r.destructiveCount).toBe(0);
  });

  it('ordena grupos alterados antes dos sem-mudança', () => {
    const r = computeBulkEditPreview('price', 30, [
      p({ id: 'a', price: 30 }),
      p({ id: 'b', price: 25 }),
    ]);
    expect(r.groups[0].changed).toBe(true);
    expect(r.groups[r.groups.length - 1].changed).toBe(false);
  });

  it('no apagar, destrutivos vêm antes do sem-mudança', () => {
    const r = computeBulkEditPreview('price', null, [
      p({ id: 'a', price: undefined }),
      p({ id: 'b', price: 25 }),
    ]);
    expect(r.groups[0].destructive).toBe(true);
    expect(r.groups[r.groups.length - 1].changed).toBe(false);
  });
});

describe('formatBulkFieldValue', () => {
  it('price', () => {
    expect(formatBulkFieldValue('price', null)).toBe('—');
    expect(formatBulkFieldValue('price', 30)).toBe('R$ 30');
  });
  it('min', () => {
    expect(formatBulkFieldValue('min', null)).toBe('—');
    expect(formatBulkFieldValue('min', 5)).toBe('5');
  });
  it('is_active', () => {
    expect(formatBulkFieldValue('is_active', true)).toBe('Ativo');
    expect(formatBulkFieldValue('is_active', false)).toBe('Inativo');
    expect(formatBulkFieldValue('is_active', undefined)).toBe('—');
  });
  it('status/location vazio vira —', () => {
    expect(formatBulkFieldValue('status', '')).toBe('—');
    expect(formatBulkFieldValue('location', 'Loja 1')).toBe('Loja 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/bulkEditPreview.test.ts`
Expected: FAIL — módulo `./bulkEditPreview` não existe.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/bulkEditPreview.ts`:

```ts
// src/utils/bulkEditPreview.ts
import type { Product } from '../types';

export type BulkEditableField = 'status' | 'is_active' | 'location' | 'price' | 'min';

export interface BulkEditGroup {
  from: unknown;
  to: unknown;
  count: number;
  changed: boolean;
  destructive: boolean;
}

export interface BulkEditPreview {
  groups: BulkEditGroup[];
  changedCount: number;
  unchangedCount: number;
  destructiveCount: number;
}

// price/min: undefined e null são a mesma coisa ("—"). Demais campos ficam como estão.
const normalize = (field: BulkEditableField, v: unknown): unknown => {
  if (field === 'price' || field === 'min') return v == null ? null : v;
  return v;
};

// Chave estável de agrupamento que distingue null, undefined e '' entre si.
const keyOf = (v: unknown): string =>
  v === null ? ' null' : v === undefined ? ' undef' : String(v);

export function computeBulkEditPreview(
  field: BulkEditableField,
  newValue: unknown,
  selected: Product[],
): BulkEditPreview {
  const to = normalize(field, newValue);
  const toKey = keyOf(to);
  const isNumeric = field === 'price' || field === 'min';

  const map = new Map<string, { from: unknown; count: number }>();
  for (const item of selected) {
    const from = normalize(field, (item as Record<string, unknown>)[field]);
    const key = keyOf(from);
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { from, count: 1 });
  }

  const groups: BulkEditGroup[] = [];
  for (const { from, count } of map.values()) {
    const changed = keyOf(from) !== toKey;
    const destructive = isNumeric && to === null && changed;
    groups.push({ from, to, count, changed, destructive });
  }

  const rank = (g: BulkEditGroup): number => (g.destructive ? 0 : g.changed ? 1 : 2);
  groups.sort((a, b) => rank(a) - rank(b));

  const sumWhere = (pred: (g: BulkEditGroup) => boolean): number =>
    groups.filter(pred).reduce((s, g) => s + g.count, 0);

  return {
    groups,
    changedCount: sumWhere((g) => g.changed),
    unchangedCount: sumWhere((g) => !g.changed),
    destructiveCount: sumWhere((g) => g.destructive),
  };
}

export function formatBulkFieldValue(field: BulkEditableField, value: unknown): string {
  if (field === 'price') return value == null ? '—' : `R$ ${(value as number).toLocaleString('pt-BR')}`;
  if (field === 'min') return value == null ? '—' : String(value);
  if (field === 'is_active') return value == null ? '—' : value ? 'Ativo' : 'Inativo';
  return value == null || value === '' ? '—' : String(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/bulkEditPreview.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros tsc; 101 baseline + os novos passam.

- [ ] **Step 6: Commit**

```bash
git add src/utils/bulkEditPreview.ts src/utils/bulkEditPreview.test.ts
git commit -m "feat: função pura de preview da edição em massa (agrupa por transição)"
```

---

### Task 2: Passo de preview no popover + fiação no ProductsPage

**Files:**
- Modify: `src/components/products/BulkEditFieldPopover.tsx` (reescrita do componente)
- Modify: `src/components/ProductsPage.tsx` (montagem do popover, ~linha 988)
- Test: verificação manual (sem @testing-library)

**Interfaces:**
- Consumes de Task 1: `computeBulkEditPreview`, `formatBulkFieldValue`, `BulkEditableField`,
  `BulkEditPreview` (assinaturas no bloco Produces da Task 1).
- Produces: `BulkEditFieldPopover` passa a exigir a prop `selectedProducts: Product[]`.
  O tipo `BulkEditableField` deixa de ser declarado aqui e é **re-exportado** do util (o
  import existente em `ProductsPage` — `import { BulkEditFieldPopover, type
  BulkEditableField } from './products/BulkEditFieldPopover'` — continua válido).

- [ ] **Step 1: Reescrever o popover**

Substituir todo o conteúdo de `src/components/products/BulkEditFieldPopover.tsx` por:

```tsx
// src/components/products/BulkEditFieldPopover.tsx
import { useEffect, useState } from 'react';
import type { Product } from '../../types';
import {
  computeBulkEditPreview,
  formatBulkFieldValue,
  type BulkEditPreview,
} from '../../utils/bulkEditPreview';

// O tipo mora no util (camada pura); re-exportado para não quebrar quem importa daqui.
export type { BulkEditableField } from '../../utils/bulkEditPreview';
import type { BulkEditableField } from '../../utils/bulkEditPreview';

type Props = {
  open: boolean;
  count: number;
  statusOptions: string[];
  locationOptions: string[];
  selectedProducts: Product[];
  onApply: (field: BulkEditableField, value: unknown) => void;
  onCancel: () => void;
};

export const BulkEditFieldPopover = ({
  open,
  count,
  statusOptions,
  locationOptions,
  selectedProducts,
  onApply,
  onCancel,
}: Props) => {
  const [field, setField] = useState<BulkEditableField>('status');
  const [value, setValue] = useState<string>('');
  const [boolValue, setBoolValue] = useState<boolean>(true);
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [pending, setPending] = useState<unknown>(null);
  const [preview, setPreview] = useState<BulkEditPreview | null>(null);

  // Reset the value when switching fields so dropdowns start on a valid option.
  useEffect(() => {
    if (field === 'status') setValue(statusOptions[0] ?? '');
    else if (field === 'location') setValue(locationOptions[0] ?? '');
    else setValue('');
  }, [field, statusOptions, locationOptions]);

  // Reabrir o popover sempre começa no passo de edição.
  useEffect(() => {
    if (open) setStep('edit');
  }, [open]);

  if (!open) return null;

  // Parse + validação na fronteira: entrada numérica inválida (NaN) não avança.
  const parseValue = (): { ok: true; value: unknown } | { ok: false } => {
    if (field === 'is_active') return { ok: true, value: boolValue };
    if (field === 'price') {
      if (value === '') return { ok: true, value: null };
      const n = Number(value);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    if (field === 'min') {
      if (value === '') return { ok: true, value: null };
      const n = Number.parseInt(value, 10);
      return Number.isNaN(n) ? { ok: false } : { ok: true, value: n };
    }
    return { ok: true, value };
  };

  const parsed = parseValue();
  const canReview = parsed.ok;

  const goToPreview = () => {
    if (!parsed.ok) return;
    setPending(parsed.value);
    setPreview(computeBulkEditPreview(field, parsed.value, selectedProducts));
    setStep('preview');
  };

  const confirm = () => onApply(field, pending);

  const inputClass =
    'mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground';

  const renderValueControl = () => {
    if (field === 'is_active') {
      return (
        <select
          value={String(boolValue)}
          onChange={(e) => setBoolValue(e.target.value === 'true')}
          className={inputClass}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      );
    }

    // Status and Location are constrained to the values already present in the
    // catalog, so editing them is a pick from a dropdown rather than free text.
    if (field === 'status' && statusOptions.length > 0) {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          {statusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (field === 'location' && locationOptions.length > 0) {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          {locationOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type={field === 'price' || field === 'min' ? 'number' : 'text'}
        className={inputClass}
      />
    );
  };

  const renderEdit = () => (
    <>
      <h3 className="text-lg font-semibold text-foreground">Edit field on {count} products</h3>

      <label className="mt-4 block text-sm font-medium text-foreground">Field</label>
      <select
        value={field}
        onChange={(e) => setField(e.target.value as BulkEditableField)}
        className={inputClass}
      >
        <option value="status">Onde</option>
        <option value="is_active">Active</option>
        <option value="location">Location</option>
        <option value="price">Price</option>
        <option value="min">Min stock</option>
      </select>

      <label className="mt-4 block text-sm font-medium text-foreground">Value</label>
      {renderValueControl()}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={goToPreview}
          disabled={!canReview}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          Revisar
        </button>
      </div>
    </>
  );

  const renderPreview = () => {
    const data = preview;
    if (!data) return null;
    const hasDestructive = data.destructiveCount > 0;
    const nothingChanges = data.changedCount === 0;

    return (
      <>
        <h3 className="text-lg font-semibold text-foreground">Revisar alterações</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {count} produtos · campo {field}
        </p>

        {hasDestructive && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>Vai apagar o valor de {data.destructiveCount} produtos</span>
          </div>
        )}

        <div className="mt-3 max-h-64 overflow-auto">
          {data.groups.map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-between border-t border-border py-2.5 text-sm text-foreground ${
                g.changed ? '' : 'opacity-50'
              }`}
            >
              <span>
                {formatBulkFieldValue(field, g.from)}{' '}
                <span className={g.destructive ? 'text-red-600' : 'text-muted-foreground'}>→</span>{' '}
                <span className={`font-medium ${g.destructive ? 'text-red-600' : ''}`}>
                  {formatBulkFieldValue(field, g.to)}
                </span>
                {!g.changed && <span className="text-xs"> · sem mudança</span>}
              </span>
              <span className="text-muted-foreground">{g.count} produtos</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {data.changedCount} alterados · {data.unchangedCount} sem mudança
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('edit')}
              className="rounded border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={nothingChanges}
              className={
                hasDestructive
                  ? 'rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 disabled:opacity-40'
                  : 'rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40'
              }
            >
              Confirmar
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
        {step === 'edit' ? renderEdit() : renderPreview()}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Ligar a prop no ProductsPage**

Em `src/components/ProductsPage.tsx`, na montagem do `<BulkEditFieldPopover .../>`
(~linha 988), adicionar a prop `selectedProducts`. O bloco atual:

```tsx
		<BulkEditFieldPopover
			open={bulkEditOpen}
			count={selectedIds.size}
			statusOptions={ondeOptions.length ? ondeOptions : statusOptions}
			locationOptions={localOptions.length ? localOptions : locations}
			onApply={handleBulkEditField}
			onCancel={() => setBulkEditOpen(false)}
		/>
```

passa a ser (só a linha `selectedProducts` é nova):

```tsx
		<BulkEditFieldPopover
			open={bulkEditOpen}
			count={selectedIds.size}
			statusOptions={ondeOptions.length ? ondeOptions : statusOptions}
			locationOptions={localOptions.length ? localOptions : locations}
			selectedProducts={products.filter((sp) => selectedIds.has(sp.id))}
			onApply={handleBulkEditField}
			onCancel={() => setBulkEditOpen(false)}
		/>
```

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/components/products/BulkEditFieldPopover.tsx src/components/ProductsPage.tsx`
Expected: 0 erros tsc; 101 + novos passam; eslint sem erros novos nos dois arquivos.

- [ ] **Step 4: Verificação manual (dados reais — desfazer o que alterar)**

1. `npm run dev` (conferir a porta que o vite escolheu; 5173 costuma estar ocupada).
2. Abrir a lista de produtos, selecionar alguns, botão de edição em massa.
3. Escolher **Price**, digitar um valor → **Revisar**. Conferir contra o `preview.html`:
   agregação por transição, linha "sem mudança" apagada no fim, rodapé com contagem.
4. **Voltar**, deixar o valor **vazio** → **Revisar**: banner de aviso, transições em
   vermelho, botão Confirmar vermelho. **Não confirmar** (ou confirmar e desfazer).
5. Testar um campo de dropdown (Location/Onde) e o caso "tudo sem mudança" (Confirmar
   desabilitado).
6. Confirmar um caso benigno e checar que o `BulkResultDialog` aparece como antes.

- [ ] **Step 5: Commit**

```bash
git add src/components/products/BulkEditFieldPopover.tsx src/components/ProductsPage.tsx
git commit -m "feat: passo de preview na edição em massa antes de gravar"
```

---

## Self-Review

**Spec coverage:**
- Formato agregado por transição → Task 1 (`computeBulkEditPreview`) + render Task 2. ✔
- 5 campos → normalização por campo + testes de price/min/is_active/status/location. ✔
- Destrutivo destaca sem bloquear → `destructive` na função + banner/cores/botão Task 2;
  Confirmar só desabilita quando `changedCount === 0`, nunca por ser destrutivo. ✔
- Escopo só preview (sem descoberta de desativação) → nada além disso. ✔
- Fluxo `Revisar → preview → Confirmar` com `step` → Task 2. ✔
- NaN herdado do #62 → `parseValue` na fronteira, `disabled={!canReview}`. ✔
- `handleBulkEditField` inalterado → Task 2 Step 2 só adiciona uma prop. ✔
- Alvo visual `preview.html` → citado no Step 4. ✔

**Placeholder scan:** sem TBD/TODO; todo código presente. ✔

**Type consistency:** `BulkEditableField`, `BulkEditPreview`, `computeBulkEditPreview`,
`formatBulkFieldValue` idênticos entre Produces da Task 1 e Consumes/uso da Task 2. A prop
`selectedProducts: Product[]` casa com `products.filter(...)` (tipo `Product[]`). ✔
