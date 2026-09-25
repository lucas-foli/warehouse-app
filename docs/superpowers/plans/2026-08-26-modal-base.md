# Modal base + fluxo Novo Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um `<Modal>` base (portal + a11y) que todas as 11 modais usam — matando o BUG-14 — e um `ProductFormModal` que resolve BUG-1/2/3 no fluxo de produto.

**Architecture:** `createPortal` para `document.body` tira o overlay do container com `space-y-10` do shell (fix do BUG-14). O `<Modal>` provê backdrop, foco preso, Esc, scroll-lock e a11y; cada modal passa só seu conteúdo. O drawer de produto vira um `ProductFormModal` apresentacional (recebe draft+callbacks; a persistência fica no `ProductsPage`), testável sem Supabase.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + (novo) jsdom + @testing-library/react.

## Global Constraints

- Typecheck/build gate: **`npx tsc -b`** (ou `npm run build`). NUNCA `tsc --noEmit` — o tsconfig raiz tem `files: []` e não checa nada.
- Testes: **`npm test`** (`vitest run`). Um arquivo só: `npm test -- <padrão>`.
- Se `npm`/`npx` falhar com FETCH_ERROR de proxy, reexecute com `env -u HTTP_PROXY -u HTTPS_PROXY <comando>`.
- Portal obrigatório: toda modal renderiza via `createPortal(..., document.body)`. É o que mata o BUG-14.
- A11y de toda modal: `role="dialog"`, `aria-modal="true"`, foco preso, Esc fecha, clique no backdrop fecha, clique dentro não fecha, scroll-lock do `body`.
- **Não** mexer em copy/idioma dos labels (inglês/PT é locale app-wide, fora desta fatia).
- **Não** migrar `products/BulkEditFieldPopover.tsx` (é popover ancorado, não modal).
- **Não** fundir as modais admin/settings duplicadas — só migrar cada uma.
- Ao migrar, **remover** o listener de Esc e o handler de clique-no-backdrop próprios de cada modal (passam a viver no `<Modal>`).

---

### Task 1: Infra de teste (jsdom + Testing Library)

Adiciona o ambiente DOM para testar componentes. Sem isso, `<Modal>` e `ProductFormModal` não são testáveis.

**Files:**
- Modify: `package.json` (devDeps)
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/canary.test.tsx` (canário — removível depois, mas fica como smoke da infra)

**Interfaces:**
- Produces: ambiente `jsdom` para vitest; `render`/`screen` de `@testing-library/react` disponíveis; matchers de `@testing-library/jest-dom` (`toBeInTheDocument`, etc.).

- [ ] **Step 1: Instalar devDeps**

Run:
```bash
env -u HTTP_PROXY -u HTTPS_PROXY npm install -D jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configurar o vite.config.ts**

Substituir o conteúdo de `vite.config.ts` por:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 3: Criar o setup**

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Escrever o canário**

`src/test/canary.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('infra jsdom + testing-library', () => {
	it('renderiza um componente e acha o texto', () => {
		render(<button type="button">clique</button>);
		expect(screen.getByRole('button', { name: 'clique' })).toBeInTheDocument();
	});
});
```

- [ ] **Step 5: Rodar a suíte inteira — canário passa e os 157 pré-existentes continuam verdes**

Run: `npx tsc -b && npm test`
Expected: `tsc` sem erros; canário PASS; total 158 (157 + canário) verdes. Se algum teste de função pura quebrar sob jsdom, investigar antes de prosseguir (não deveria — jsdom é superset).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test/setup.ts src/test/canary.test.tsx
git commit -m "test: infra jsdom + testing-library para testes de componente"
```

---

### Task 2: Componente `<Modal>` base (TDD)

A peça central. Comportamento testado primeiro (RTL), depois a implementação.

**Files:**
- Create: `src/components/ui/Modal.tsx`
- Test: `src/components/ui/Modal.test.tsx`

**Interfaces:**
- Produces: `Modal` (named export) —
  `({ open: boolean; onClose: () => void; labelledById?: string; size?: 'sm'|'md'|'lg'|'xl'; mobileSheet?: boolean; children: React.ReactNode }) => JSX | null`.

- [ ] **Step 1: Escrever os testes de comportamento (falham — módulo não existe)**

`src/components/ui/Modal.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

const open = (props = {}) =>
	render(
		<Modal open onClose={vi.fn()} {...props}>
			<h2 id="t">Título</h2>
			<button type="button">interno</button>
		</Modal>,
	);

describe('Modal', () => {
	it('não renderiza nada quando open=false', () => {
		render(
			<Modal open={false} onClose={vi.fn()}>
				<p>oi</p>
			</Modal>,
		);
		expect(screen.queryByText('oi')).not.toBeInTheDocument();
	});

	it('renderiza em portal, fora do container que o montou', () => {
		const { container } = open();
		// mata: voltar a renderizar inline (o conteúdo estaria dentro de container)
		expect(container).toBeEmptyDOMElement();
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('tem role=dialog + aria-modal, e aria-labelledby quando fornecido', () => {
		open({ labelledById: 't' });
		const dialog = screen.getByRole('dialog');
		// mata: remover a semântica de diálogo
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAttribute('aria-labelledby', 't');
	});

	it('Esc chama onClose', () => {
		const onClose = vi.fn();
		open({ onClose });
		fireEvent.keyDown(document, { key: 'Escape' });
		// mata: remover o handler de Esc
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('clique no backdrop fecha; clique dentro do painel não', () => {
		const onClose = vi.fn();
		open({ onClose });
		fireEvent.click(screen.getByText('interno'));
		expect(onClose).not.toHaveBeenCalled(); // mata: fechar no clique interno
		fireEvent.click(screen.getByTestId('modal-backdrop'));
		expect(onClose).toHaveBeenCalledTimes(1); // mata: não fechar no backdrop
	});

	it('trava o scroll do body enquanto aberto e restaura ao desmontar', () => {
		const { unmount } = open();
		expect(document.body.style.overflow).toBe('hidden');
		unmount();
		// mata: não restaurar o overflow
		expect(document.body.style.overflow).toBe('');
	});

	it('restaura o foco ao elemento que abriu, ao desmontar', () => {
		const trigger = document.createElement('button');
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);
		const { unmount } = open();
		// foco entrou no painel/conteúdo
		expect(trigger).not.toBe(document.activeElement);
		unmount();
		// mata: não restaurar o foco ao trigger
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- Modal`
Expected: FAIL — `./Modal` inexistente.

- [ ] **Step 3: Implementar o `<Modal>`**

`src/components/ui/Modal.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<ModalSize, string> = {
	sm: 'sm:max-w-md',
	md: 'sm:max-w-lg',
	lg: 'sm:max-w-2xl',
	xl: 'sm:max-w-3xl',
};

type ModalProps = {
	open: boolean;
	onClose: () => void;
	labelledById?: string;
	size?: ModalSize;
	mobileSheet?: boolean;
	children: ReactNode;
};

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({
	open,
	onClose,
	labelledById,
	size = 'md',
	mobileSheet = false,
	children,
}: ModalProps) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;

		previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		const panel = panelRef.current;
		const focusables = () => (panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
		(focusables()[0] ?? panel)?.focus();

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
				return;
			}
			if (e.key === 'Tab' && panel) {
				const items = focusables();
				if (!items.length) {
					e.preventDefault();
					panel.focus();
					return;
				}
				const first = items[0];
				const last = items[items.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.body.style.overflow = prevOverflow;
			previouslyFocused.current?.focus?.();
		};
	}, [open, onClose]);

	if (!open) return null;

	const panelClass = mobileSheet
		? `absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:static sm:w-full ${sizeClass[size]} sm:max-h-[90vh] sm:rounded-[var(--radius-card)]`
		: `w-full ${sizeClass[size]} max-h-[90vh] overflow-y-auto rounded-[var(--radius-card)] bg-card shadow-xl`;

	return createPortal(
		<div
			data-testid="modal-backdrop"
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
			onClick={onClose}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={labelledById}
				tabIndex={-1}
				className={panelClass}
				onClick={(e) => e.stopPropagation()}>
				{mobileSheet && (
					<div className="flex flex-shrink-0 justify-center py-3 sm:hidden">
						<div className="h-1 w-10 rounded-full bg-border" />
					</div>
				)}
				{children}
			</div>
		</div>,
		document.body,
	);
};
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npm test -- Modal`
Expected: PASS (7 casos).

- [ ] **Step 5: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx src/components/ui/Modal.test.tsx
git commit -m "feat(ui): componente Modal base (portal + a11y, fix BUG-14)"
```

---

### Task 3: `productForm.ts` — `canSaveProduct` + `ProductDraft` (TDD)

Move o tipo `ProductDraft` para um módulo compartilhável e extrai a regra do BUG-3 como função pura.

**Files:**
- Create: `src/utils/productForm.ts`
- Test: `src/utils/productForm.test.ts`
- Modify: `src/components/ProductsPage.tsx` (remover a def local do tipo, importar de `../utils/productForm`)

**Interfaces:**
- Produces: `ProductDraft` (type) e `canSaveProduct(mode: 'create'|'edit', draft: ProductDraft | null, dirty: boolean, saving: boolean, hasTenant: boolean): boolean`.

- [ ] **Step 1: Escrever os testes (falham — módulo não existe)**

`src/utils/productForm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canSaveProduct, type ProductDraft } from './productForm';

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
	id: '', name: '', sku: '', status: 'ESTOQUE', location: 'Loja principal',
	qty: '0', min: '', price: '', barcode: '', image: '', ...over,
});

describe('canSaveProduct', () => {
	it('create: exige sku E name preenchidos', () => {
		// mata: habilitar no create ao primeiro campo (regra antiga do dirty)
		expect(canSaveProduct('create', draft({ sku: 'A' }), true, false, true)).toBe(false);
		expect(canSaveProduct('create', draft({ name: 'X' }), true, false, true)).toBe(false);
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, false, true)).toBe(true);
		expect(canSaveProduct('create', draft({ sku: '  ', name: '  ' }), true, false, true)).toBe(false);
	});

	it('edit: basta dirty', () => {
		// mata: ignorar o modo
		expect(canSaveProduct('edit', draft(), false, false, true)).toBe(false);
		expect(canSaveProduct('edit', draft(), true, false, true)).toBe(true);
	});

	it('bloqueia sem tenant, salvando, ou draft nulo', () => {
		// mata: permitir salvar sem tenant / durante saving
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, false, false)).toBe(false);
		expect(canSaveProduct('create', draft({ sku: 'A', name: 'X' }), true, true, true)).toBe(false);
		expect(canSaveProduct('create', null, true, false, true)).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- productForm`
Expected: FAIL — `./productForm` inexistente.

- [ ] **Step 3: Implementar `productForm.ts`**

`src/utils/productForm.ts`:

```ts
export type ProductDraft = {
	id: string;
	name: string;
	sku: string;
	status: string;
	location: string;
	qty: string;
	min: string;
	price: string;
	barcode: string;
	image: string;
};

export const canSaveProduct = (
	mode: 'create' | 'edit',
	draft: ProductDraft | null,
	dirty: boolean,
	saving: boolean,
	hasTenant: boolean,
): boolean => {
	if (!draft || saving || !hasTenant) return false;
	if (mode === 'create') return Boolean(draft.sku.trim() && draft.name.trim());
	return dirty;
};
```

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npm test -- productForm`
Expected: PASS.

- [ ] **Step 5: Apontar o `ProductsPage` para o tipo compartilhado**

Em `src/components/ProductsPage.tsx`: remover o bloco `type ProductDraft = { ... };` (linhas 16-27) e adicionar, junto aos imports do topo:

```ts
import type { ProductDraft } from '../utils/productForm';
```

(O `ProductsPage` já usa `ProductDraft` internamente; só muda a origem do tipo. Não altere mais nada nesta task.)

- [ ] **Step 6: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde (o `ProductsPage` compila com o tipo importado).

- [ ] **Step 7: Commit**

```bash
git add src/utils/productForm.ts src/utils/productForm.test.ts src/components/ProductsPage.tsx
git commit -m "refactor(products): canSaveProduct puro + ProductDraft compartilhado (BUG-3)"
```

---

### Task 4: `ProductFormModal` + fiação no `ProductsPage` (BUG-1/2/3)

Extrai o drawer para um componente próprio que usa `<Modal>`, com os obrigatórios marcados (BUG-2) e o Salvar honesto (BUG-3).

**Files:**
- Create: `src/components/products/ProductFormModal.tsx`
- Test: `src/components/products/ProductFormModal.test.tsx`
- Modify: `src/components/ProductsPage.tsx` (remover o drawer inline `738-961`; montar `<ProductFormModal>`)

**Interfaces:**
- Consumes: `Modal` (Task 2); `canSaveProduct`, `ProductDraft` (Task 3).
- Produces: `ProductFormModal` (default export) com as props abaixo.

> **Nota de linhas:** a Task 3 removeu ~11 linhas acima (o `type ProductDraft` local), então os
> números de linha citados abaixo (`738-961`, `794-910`, `769-792`, `913-928`) são do arquivo
> **pré-Task 3** e agora estão ~11 linhas mais acima. **Localize os blocos por conteúdo**
> (o `{isEditPanelOpen && (`, os `<label>`/`<input>` de cada campo, o `Danger zone`), não pelos
> números — eles são só orientação aproximada.

- [ ] **Step 1: Escrever os testes de componente (falham — módulo não existe)**

`src/components/products/ProductFormModal.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProductFormModal from './ProductFormModal';
import type { ProductDraft } from '../../utils/productForm';

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
	id: '', name: '', sku: '', status: 'ESTOQUE', location: 'Loja principal',
	qty: '0', min: '', price: '', barcode: '', image: '', ...over,
});

const base = {
	open: true as const, mode: 'create' as const, saving: false, error: '', dirty: false,
	hasTenant: true, ondeOptions: ['ESTOQUE'], localOptions: ['Loja principal'],
	onChange: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), onRequestDelete: vi.fn(),
};

describe('ProductFormModal', () => {
	it('BUG-2: SKU e Name marcados como obrigatórios (aria-required)', () => {
		render(<ProductFormModal {...base} draft={draft()} />);
		// mata: faltar a marcação de obrigatório
		expect(screen.getByLabelText(/SKU/i)).toHaveAttribute('aria-required', 'true');
		expect(screen.getByLabelText(/Name/i)).toHaveAttribute('aria-required', 'true');
	});

	it('BUG-3: Salvar desabilitado sem sku+name; habilitado com ambos', () => {
		const { rerender } = render(<ProductFormModal {...base} draft={draft()} />);
		// mata: botão habilitado sem os obrigatórios
		expect(screen.getByRole('button', { name: /salvar/i })).toBeDisabled();
		rerender(<ProductFormModal {...base} dirty draft={draft({ sku: 'A', name: 'X' })} />);
		expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled();
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- ProductFormModal`
Expected: FAIL — `./ProductFormModal` inexistente.

- [ ] **Step 3: Implementar o `ProductFormModal`**

Criar `src/components/products/ProductFormModal.tsx`. É a extração do bloco `ProductsPage.tsx:738-961` para dentro de `<Modal>`, apresentacional. Regras:

- Props:

```tsx
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Primitives';
import { canSaveProduct, type ProductDraft } from '../../utils/productForm';

type ProductFormModalProps = {
	open: boolean;
	mode: 'create' | 'edit';
	draft: ProductDraft | null;
	saving: boolean;
	error: string;
	dirty: boolean;
	hasTenant: boolean;
	ondeOptions: string[];
	localOptions: string[];
	onChange: (partial: Partial<ProductDraft>) => void;
	onSave: () => void;
	onReset: () => void;
	onClose: () => void;
	onRequestDelete: () => void;
};
```

- Envolver tudo em `<Modal open={open} onClose={onClose} size="lg" mobileSheet labelledById="product-form-title">`.
- O heading da modal recebe `id="product-form-title"` (para o `aria-labelledby`): use o texto atual `{mode === 'create' ? 'New product' : 'Edit product'}`.
- Reaproveite **verbatim** os campos do drawer atual (`ProductsPage.tsx:794-910`): SKU/Name (só no `create`), Onde, Local, Qtd, Mínimo, Preço, Código de barras, URL da imagem — trocando `updateDraft(...)` por `onChange(...)` e `editDraft` por `draft`. Mantenha as mesmas classes.
- **BUG-2:** nos labels de SKU e Name (create), acrescente `*` ao texto (ex.: `SKU *`, `Name *`) e nos respectivos `<input>` adicione `aria-required` e um `id` que o label referencie (para `getByLabelText` funcionar — use `<label htmlFor="pf-sku">` + `<input id="pf-sku" aria-required>`, idem `pf-name`). Realce de borda no campo faltante quando `mode==='create'` e o valor está vazio (ex.: classe condicional `border-rose-400` quando `!draft.sku.trim()`); os demais campos ficam neutros.
- Header do produto (imagem+nome+SKU) e "Danger zone" (excluir) apenas no `mode==='edit'` — reaproveite de `ProductsPage.tsx:769-792` e `913-928`, trocando `editDraft`→`draft`, `editSaving`→`saving`, e o `onClick` do excluir por `onRequestDelete`.
- Botões: Salvar usa `disabled={!canSaveProduct(mode, draft, dirty, saving, hasTenant)}` e `onClick={onSave}`; "Descartar" usa `disabled={!dirty || saving}` e `onClick={onReset}`. Rótulo do Salvar: `{saving ? 'Salvando…' : 'Salvar ajustes'}`.
- O `error` (prop) é exibido no rodapé como hoje: `{error && <p className="text-xs text-rose-500">{error}</p>}`.
- Se `draft` for `null`, renderize o mesmo fallback atual ("Selecione um produto na lista para ajustar.").

- [ ] **Step 4: Rodar os testes do componente — devem PASSAR**

Run: `npm test -- ProductFormModal`
Expected: PASS (2 casos).

- [ ] **Step 5: Fiar no `ProductsPage`**

Em `src/components/ProductsPage.tsx`: remover todo o bloco `{isEditPanelOpen && ( … )}` de `738-961` e, no lugar, montar:

```tsx
<ProductFormModal
	open={isEditPanelOpen}
	mode={drawerMode ?? 'edit'}
	draft={editDraft}
	saving={editSaving}
	error={editError}
	dirty={editDirty}
	hasTenant={Boolean(tenantId)}
	ondeOptions={ondeOptions}
	localOptions={localOptions}
	onChange={updateDraft}
	onSave={handleSaveDraft}
	onReset={resetDraft}
	onClose={closeEditPanel}
	onRequestDelete={() => setDeleteConfirmOpen(true)}
/>
```

Adicionar `import ProductFormModal from './products/ProductFormModal';` no topo. Remover imports que ficaram órfãos (o `npx tsc -b` acusa sob `noUnusedLocals`). Não alterar `handleSaveDraft`/`updateDraft`/`closeEditPanel` — só deixam de ser consumidos inline.

- [ ] **Step 6: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/products/ProductFormModal.tsx src/components/products/ProductFormModal.test.tsx src/components/ProductsPage.tsx
git commit -m "feat(products): ProductFormModal via Modal base (BUG-1/2/3)"
```

---

## Padrão de migração (Tasks 5-7)

Cada modal restante segue a mesma transformação mecânica. **Antes** (exemplo, SellerFormModal):

```tsx
return (
	<div className="fixed inset-0 z-50 bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
		<div className="absolute inset-x-0 bottom-0 ... sm:max-w-lg sm:rounded-[var(--radius-card)]">
			<div className="flex ... justify-center py-3 sm:hidden"><div className="h-1 w-10 ..." /></div>
			<div className="... overflow-y-auto p-6 ...">
				{/* header + campos + botões */}
			</div>
		</div>
	</div>
);
```

**Depois:**

```tsx
return (
	<Modal open={open} onClose={onClose} size="md" mobileSheet labelledById="seller-form-title">
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
			{/* header (dê id="seller-form-title" ao <p>/<h_> do título) + campos + botões — inalterados */}
		</div>
	</Modal>
);
```

Regras da migração, por arquivo:
- Trocar o `<div overlay>` + wrapper de painel + drag-handle pelo `<Modal … >`; o **conteúdo interno** (header/campos/botões) fica igual.
- Remover o `useEffect`/handler de **Esc** próprio e o `onClick` de backdrop/`stopPropagation` próprios (agora no `<Modal>`). Manter os `if (!open) return null` que sobrarem? Não — o `<Modal>` já trata `open`; passe `open` ao `<Modal>` e remova o early-return próprio.
- Mapear o `onClose`/`onCancel` da modal para o `onClose` do `<Modal>`.
- Dar um `id` ao heading e passar em `labelledById`.
- `import { Modal } from '../ui/Modal';` (ajuste o caminho relativo conforme a pasta).
- `size`/`mobileSheet` conforme a tabela; **confirmar** olhando o `sm:max-w-*` atual do arquivo (se divergir da tabela, use o do arquivo e anote no report).

Cada task de migração termina com `npx tsc -b && npm test` verde e um commit.

---

### Task 5: Migrar modais de `products/`

**Files:**
- Modify: `src/components/products/SaleOrderModal.tsx` (`size="xl"`, `mobileSheet`)
- Modify: `src/components/products/ConfirmDialog.tsx` (`size="sm"`, sem sheet)
- Modify: `src/components/products/BulkResultDialog.tsx` (`size="md"`, sem sheet)
- Test: `src/components/products/ConfirmDialog.test.tsx` (smoke de migração)

**Interfaces:**
- Consumes: `Modal` (Task 2).

- [ ] **Step 1: Escrever o smoke de migração (falha — comportamento novo via Modal)**

`src/components/products/ConfirmDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog via Modal', () => {
	it('renderiza em dialog e fecha por Esc e por backdrop', () => {
		const onCancel = vi.fn();
		render(
			<ConfirmDialog open title="T" message="M" onConfirm={vi.fn()} onCancel={onCancel} />,
		);
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		fireEvent.keyDown(document, { key: 'Escape' }); // mata: perder o Esc na migração
		fireEvent.click(screen.getByTestId('modal-backdrop')); // mata: perder o fechar-no-backdrop
		expect(onCancel).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npm test -- ConfirmDialog`
Expected: FAIL — hoje o ConfirmDialog não renderiza `role="dialog"` nem `data-testid="modal-backdrop"` (não usa `<Modal>`).

- [ ] **Step 3: Migrar as três modais de `products/`**

Aplicar o **Padrão de migração** a `SaleOrderModal.tsx`, `ConfirmDialog.tsx` e `BulkResultDialog.tsx`. Para o `ConfirmDialog`: `onClose` do `<Modal>` = `onCancel`; `size="sm"`; heading `<h3 id="confirm-title">{title}`; `labelledById="confirm-title"`. Remover o `useEffect` de Esc (linhas 24-35) e o `onClick={onCancel}` do overlay.

- [ ] **Step 4: Rodar o smoke — deve PASSAR**

Run: `npm test -- ConfirmDialog`
Expected: PASS.

- [ ] **Step 5: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/products/SaleOrderModal.tsx src/components/products/ConfirmDialog.tsx src/components/products/BulkResultDialog.tsx src/components/products/ConfirmDialog.test.tsx
git commit -m "refactor(products): migra modais para Modal base (BUG-14)"
```

---

### Task 6: Migrar modais de formulário (`clients`, `sellers`, `members`)

**Files:**
- Modify: `src/components/clients/ClientFormModal.tsx` (`size="md"`, `mobileSheet`)
- Modify: `src/components/sellers/SellerFormModal.tsx` (`size="md"`, `mobileSheet`)
- Modify: `src/components/members/InviteMemberModal.tsx` (`size="md"`, `mobileSheet`)

**Interfaces:**
- Consumes: `Modal` (Task 2).

- [ ] **Step 1: Migrar as três modais de formulário**

Aplicar o **Padrão de migração** a cada uma. Heading recebe `id` (ex.: `seller-form-title`, `client-form-title`, `invite-member-title`) e vai em `labelledById`. `onClose` do `<Modal>` = o `onClose` de cada modal. Remover Esc/backdrop próprios.

- [ ] **Step 2: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde (as suítes existentes de forms de cliente/vendedor continuam passando).

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/ClientFormModal.tsx src/components/sellers/SellerFormModal.tsx src/components/members/InviteMemberModal.tsx
git commit -m "refactor(forms): migra modais de cliente/vendedor/convite para Modal base (BUG-14)"
```

---

### Task 7: Migrar modais de `admin/` e `settings/`

**Files:**
- Modify: `src/components/admin/ApproveRequestModal.tsx` (`size="md"`)
- Modify: `src/components/admin/DeclineRequestModal.tsx` (`size="md"`)
- Modify: `src/components/settings/ApproveJoinRequestModal.tsx` (`size="md"`)
- Modify: `src/components/settings/DeclineJoinRequestModal.tsx` (`size="md"`)

**Interfaces:**
- Consumes: `Modal` (Task 2).

- [ ] **Step 1: Migrar as quatro modais**

Aplicar o **Padrão de migração** a cada uma (`size="md"`, `mobileSheet` conforme o arquivo — a maioria é diálogo centrado, então provavelmente sem sheet; confirme pelo `sm:max-w-*`/`bottom-0` atual). Heading com `id` + `labelledById`. Remover Esc/backdrop próprios. **Não** fundir os pares admin/settings.

- [ ] **Step 2: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: limpo e verde.

- [ ] **Step 3: Grep de sanidade — só o popover mantém overlay próprio**

Run: `grep -rl "fixed inset-0.*bg-black" src/components`
Expected: única linha `src/components/products/BulkEditFieldPopover.tsx`. Qualquer outro arquivo listado significa migração faltando.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ApproveRequestModal.tsx src/components/admin/DeclineRequestModal.tsx src/components/settings/ApproveJoinRequestModal.tsx src/components/settings/DeclineJoinRequestModal.tsx
git commit -m "refactor(admin/settings): migra modais para Modal base (BUG-14)"
```

---

## Verificação final (após as 7 tasks)

- `npx tsc -b` limpo e `npm test` verde (as suítes novas + as 157 pré-existentes + o canário).
- `grep -rl "fixed inset-0.*bg-black" src/components` → só `products/BulkEditFieldPopover.tsx`.
- E2e manual no app real (executado por mim, com screenshots), seguindo o roteiro da spec:
  backdrop cobrindo o topo em ≥3 modais; Esc/backdrop/foco/scroll-lock; "Novo produto" como modal
  com Nome/SKU marcados `*` e Salvar desabilitado até ambos preenchidos; criar/editar produto
  persiste; as demais modais abrem/salvam/fecham.

## Ordem das tasks

1. Infra de teste (jsdom + Testing Library).
2. `<Modal>` base (TDD).
3. `productForm.ts` (`canSaveProduct` + `ProductDraft`).
4. `ProductFormModal` + fiação `ProductsPage` (BUG-1/2/3).
5. Migração `products/` (+ smoke).
6. Migração forms (`clients`/`sellers`/`members`).
7. Migração `admin/`/`settings/` (+ grep de sanidade).

Tasks 5-7 são independentes entre si (arquivos disjuntos) e podem ir em paralelo por subagents, cada uma com seu review; todas dependem da Task 2.
