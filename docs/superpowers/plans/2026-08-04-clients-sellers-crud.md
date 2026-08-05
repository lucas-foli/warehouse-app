# CRUD individual de clientes e vendedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar criar/editar/excluir individual de clientes e vendedores por botões e modais no UI, sem tocar no import CSV (que segue para bulk).

**Architecture:** `ClientsPage`/`SellersPage` são apresentacionais e recebem dados por prop do `Dashboard` (carregados por `useDashboardData`, que expõe `reload()`). Adicionamos modais de formulário (padrão `SaleOrderModal`) que escrevem direto no Supabase e chamam `reload()`. A lógica de payload/validação/`external_id` vive em funções puras testáveis; os modais fazem a mutação e a checagem de FK inline (padrão do CRUD de produto).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest, Supabase JS, Tailwind (tokens `--*` via classes utilitárias).

## Global Constraints

- Prosa/comentários em português com acentuação correta; strings de UI seguem o estilo existente do repo (sem acento nas labels curtas é aceitável se o arquivo vizinho fizer assim — mas mensagens de erro completas levam acento).
- `external_id` é `NOT NULL` e imutável após a criação; nunca aparece no formulário. Regra na criação: cliente `email || telefone || nome`; vendedor `email || nome` (espelha `src/utils/csv.ts`).
- Botões/ações de escrita só aparecem quando `isAdmin` (padrão de `canImport`/`OrdersPage`).
- Typecheck é via `npm run build` (`tsc -b && vite build`) — NÃO usar `tsc --noEmit` (o tsconfig raiz não checa nada).
- Testes: `npm test` (`vitest run`). Baseline atual: 122 testes, 0 falhas.
- Não introduzir mutação otimista/cache; sempre `onReload()` após sucesso.

## File Structure

- Modify `src/types/index.ts` — adicionar `email?: string` a `Client` e `Seller`.
- Modify `src/services/dashboardService.ts` — mapear `email` em `fetchClients` e `fetchSellers`.
- Create `src/utils/clientSellerForms.ts` — funções puras (drafts, validação, payloads, `external_id`, mensagem de bloqueio).
- Create `src/utils/clientSellerForms.test.ts` — testes das funções puras.
- Create `src/components/clients/ClientFormModal.tsx` — modal de cliente (criar/editar/excluir).
- Create `src/components/sellers/SellerFormModal.tsx` — modal de vendedor.
- Modify `src/components/ClientsPage.tsx` — botão "Novo cliente", linha clicável para editar, estado do modal, props novas.
- Modify `src/components/SellersPage.tsx` — idem para vendedores.
- Modify `src/components/Dashboard.tsx` — passar `tenantId`, `isAdmin`, `onReload={reload}` às duas páginas.

---

### Task 1: Funções puras + types + mapeamento de email

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/dashboardService.ts` (fetchClients ~133-141, fetchSellers ~148-156)
- Create: `src/utils/clientSellerForms.ts`
- Test: `src/utils/clientSellerForms.test.ts`

**Interfaces:**
- Consumes: `Client`, `Seller` de `../types`.
- Produces (usados nas Tasks 2 e 3):
  - `type ClientDraft = { nome: string; cidade: string; telefone: string; email: string }`
  - `type SellerDraft = { nome: string; email: string }`
  - `emptyClientDraft(): ClientDraft`, `emptySellerDraft(): SellerDraft`
  - `clientToDraft(c: Client): ClientDraft`, `sellerToDraft(s: Seller): SellerDraft`
  - `validateClientDraft(d: ClientDraft): string | null`, `validateSellerDraft(d: SellerDraft): string | null`
  - `buildClientInsert(d: ClientDraft, tenantId: string): ClientInsert`
  - `buildClientUpdate(d: ClientDraft): ClientUpdate`
  - `buildSellerInsert(d: SellerDraft, tenantId: string): SellerInsert`
  - `buildSellerUpdate(d: SellerDraft): SellerUpdate`
  - `deleteBlockMessage(kind: 'cliente' | 'vendedor', count: number): string`

- [ ] **Step 1: Adicionar `email?` aos types**

Em `src/types/index.ts`, dentro de `interface Client` (após `telefone?: string;`) e `interface Seller` (após `nome: string;`), adicionar:

```typescript
	email?: string;
```

Resultado esperado — `Client`:
```typescript
export interface Client {
	id: string;
	externalId?: string;
	nome: string;
	cidade: string;
	telefone?: string;
	email?: string;
	ultimaCompra: string;
}
```
E `Seller` ganha `email?: string;` logo após `nome: string;`.

- [ ] **Step 2: Mapear email no dashboardService**

Em `src/services/dashboardService.ts`, no `.map` de `fetchClients`, adicionar a linha após `telefone: ...`:
```typescript
			email: toText(row.email) || undefined,
```
E no `.map` de `fetchSellers`, adicionar após `nome: ...`:
```typescript
			email: toText(row.email) || undefined,
```

- [ ] **Step 3: Escrever o teste das funções puras (falha primeiro)**

Criar `src/utils/clientSellerForms.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
	validateClientDraft,
	validateSellerDraft,
	clientExternalId,
	sellerExternalId,
	buildClientInsert,
	buildClientUpdate,
	buildSellerInsert,
	deleteBlockMessage,
} from './clientSellerForms';

const TENANT = '00000000-0000-0000-0000-000000000000';

describe('validateClientDraft', () => {
	it('rejeita nome em branco', () => {
		expect(validateClientDraft({ nome: '  ', cidade: '', telefone: '', email: '' })).toMatch(/nome/i);
	});
	it('aceita quando há nome', () => {
		expect(validateClientDraft({ nome: 'Ana', cidade: '', telefone: '', email: '' })).toBeNull();
	});
});

describe('clientExternalId (espelha o import: email || telefone || nome)', () => {
	it('prefere email', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '9', email: 'a@x.com' })).toBe('a@x.com');
	});
	it('cai para telefone', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '99', email: '' })).toBe('99');
	});
	it('cai para nome', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '', email: '' })).toBe('Ana');
	});
});

describe('buildClientInsert', () => {
	it('define tenant + external_id e omite opcionais vazios', () => {
		const row = buildClientInsert({ nome: ' Ana ', cidade: '', telefone: '', email: '' }, TENANT);
		expect(row).toEqual({ tenant_id: TENANT, external_id: 'Ana', name: 'Ana' });
	});
	it('inclui opcionais trimados quando presentes', () => {
		const row = buildClientInsert({ nome: 'Ana', cidade: ' SP ', telefone: ' 9 ', email: ' a@x.com ' }, TENANT);
		expect(row).toMatchObject({ name: 'Ana', city: 'SP', phone: '9', email: 'a@x.com', external_id: 'a@x.com' });
	});
});

describe('buildClientUpdate (não toca external_id)', () => {
	it('zera campos vazios com null para limpá-los', () => {
		const row = buildClientUpdate({ nome: 'Ana', cidade: '', telefone: '', email: '' });
		expect(row).toEqual({ name: 'Ana', city: null, phone: null, email: null });
		expect(row).not.toHaveProperty('external_id');
	});
});

describe('vendedor', () => {
	it('valida nome', () => {
		expect(validateSellerDraft({ nome: '', email: '' })).toMatch(/nome/i);
	});
	it('external_id = email || nome', () => {
		expect(sellerExternalId({ nome: 'Bea', email: '' })).toBe('Bea');
		expect(sellerExternalId({ nome: 'Bea', email: 'b@x.com' })).toBe('b@x.com');
	});
	it('insert omite email vazio', () => {
		expect(buildSellerInsert({ nome: 'Bea', email: '' }, TENANT)).toEqual({
			tenant_id: TENANT,
			external_id: 'Bea',
			name: 'Bea',
		});
	});
});

describe('deleteBlockMessage', () => {
	it('singular', () => {
		expect(deleteBlockMessage('vendedor', 1)).toContain('1 venda vinculada');
	});
	it('plural', () => {
		expect(deleteBlockMessage('cliente', 3)).toContain('3 vendas vinculadas');
	});
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `npm test -- clientSellerForms`
Expected: FAIL — módulo `./clientSellerForms` não existe.

- [ ] **Step 5: Implementar as funções puras**

Criar `src/utils/clientSellerForms.ts`:

```typescript
import type { Client, Seller } from '../types';

export type ClientDraft = {
	nome: string;
	cidade: string;
	telefone: string;
	email: string;
};

export type SellerDraft = {
	nome: string;
	email: string;
};

export type ClientInsert = {
	tenant_id: string;
	external_id: string;
	name: string;
	city?: string;
	phone?: string;
	email?: string;
};

export type ClientUpdate = {
	name: string;
	city: string | null;
	phone: string | null;
	email: string | null;
};

export type SellerInsert = {
	tenant_id: string;
	external_id: string;
	name: string;
	email?: string;
};

export type SellerUpdate = {
	name: string;
	email: string | null;
};

export const emptyClientDraft = (): ClientDraft => ({ nome: '', cidade: '', telefone: '', email: '' });
export const emptySellerDraft = (): SellerDraft => ({ nome: '', email: '' });

export const clientToDraft = (c: Client): ClientDraft => ({
	nome: c.nome ?? '',
	// A cidade ausente chega do map como o placeholder '—'; não queremos editá-lo como texto.
	cidade: c.cidade && c.cidade !== '—' ? c.cidade : '',
	telefone: c.telefone ?? '',
	email: c.email ?? '',
});

export const sellerToDraft = (s: Seller): SellerDraft => ({
	nome: s.nome ?? '',
	email: s.email ?? '',
});

export const validateClientDraft = (d: ClientDraft): string | null =>
	d.nome.trim() ? null : 'Informe o nome do cliente.';

export const validateSellerDraft = (d: SellerDraft): string | null =>
	d.nome.trim() ? null : 'Informe o nome do vendedor.';

// external_id espelha a regra do import CSV (src/utils/csv.ts): mantém o registro
// criado à mão deduplicável e cruzável com importações futuras.
export const clientExternalId = (d: ClientDraft): string =>
	d.email.trim() || d.telefone.trim() || d.nome.trim();

export const sellerExternalId = (d: SellerDraft): string => d.email.trim() || d.nome.trim();

export const buildClientInsert = (d: ClientDraft, tenantId: string): ClientInsert => {
	const city = d.cidade.trim();
	const phone = d.telefone.trim();
	const email = d.email.trim();
	return {
		tenant_id: tenantId,
		external_id: clientExternalId(d),
		name: d.nome.trim(),
		city: city || undefined,
		phone: phone || undefined,
		email: email || undefined,
	};
};

// Na edição NÃO tocamos external_id (chave imutável de cruzamento); campos vazios
// viram null para efetivamente limpar o valor antigo.
export const buildClientUpdate = (d: ClientDraft): ClientUpdate => ({
	name: d.nome.trim(),
	city: d.cidade.trim() || null,
	phone: d.telefone.trim() || null,
	email: d.email.trim() || null,
});

export const buildSellerInsert = (d: SellerDraft, tenantId: string): SellerInsert => {
	const email = d.email.trim();
	return {
		tenant_id: tenantId,
		external_id: sellerExternalId(d),
		name: d.nome.trim(),
		email: email || undefined,
	};
};

export const buildSellerUpdate = (d: SellerDraft): SellerUpdate => ({
	name: d.nome.trim(),
	email: d.email.trim() || null,
});

export const deleteBlockMessage = (kind: 'cliente' | 'vendedor', count: number): string =>
	`Este ${kind} tem ${count} ${count === 1 ? 'venda vinculada' : 'vendas vinculadas'}. ` +
	`Desvincule ou remova ${count === 1 ? 'essa venda' : 'essas vendas'} antes de excluir.`;
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — os novos testes + os 122 existentes (total sobe para 122 + novos).

- [ ] **Step 7: Typecheck**

Run: `npm run build`
Expected: build conclui sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/services/dashboardService.ts src/utils/clientSellerForms.ts src/utils/clientSellerForms.test.ts
git commit -m "feat(clients-sellers): funções puras de formulário + email nos types e no mapeamento"
```

---

### Task 2: CRUD de cliente (modal + wire em ClientsPage/Dashboard)

**Files:**
- Create: `src/components/clients/ClientFormModal.tsx`
- Modify: `src/components/ClientsPage.tsx`
- Modify: `src/components/Dashboard.tsx` (bloco `page === 'clientes'`, ~406-413)

**Interfaces:**
- Consumes: da Task 1 — `ClientDraft`, `emptyClientDraft`, `clientToDraft`, `validateClientDraft`, `buildClientInsert`, `buildClientUpdate`, `deleteBlockMessage`. Tipo `Client` de `../../types`. `supabase` de `../../lib/supabaseClient`.
- Produces: componente `ClientFormModal` com props `{ open: boolean; tenantId?: string; client?: Client | null; onClose: () => void; onSaved: () => void }`. `ClientsPage` passa a aceitar `tenantId?: string; isAdmin?: boolean; onReload?: () => void`.

- [ ] **Step 1: Criar o `ClientFormModal`**

Criar `src/components/clients/ClientFormModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Client } from '../../types';
import {
	buildClientInsert,
	buildClientUpdate,
	clientToDraft,
	deleteBlockMessage,
	emptyClientDraft,
	validateClientDraft,
	type ClientDraft,
} from '../../utils/clientSellerForms';

type Props = {
	open: boolean;
	tenantId?: string;
	client?: Client | null;
	onClose: () => void;
	onSaved: () => void;
};

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

export const ClientFormModal = ({ open, tenantId, client, onClose, onSaved }: Props) => {
	const isEdit = !!client;
	const [draft, setDraft] = useState<ClientDraft>(emptyClientDraft());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		if (!open) return;
		setDraft(client ? clientToDraft(client) : emptyClientDraft());
		setError('');
		setConfirmDelete(false);
		setSaving(false);
	}, [open, client]);

	if (!open) return null;

	const update = (partial: Partial<ClientDraft>) => setDraft((c) => ({ ...c, ...partial }));

	const save = async () => {
		if (!tenantId) return;
		const validationError = validateClientDraft(draft);
		if (validationError) {
			setError(validationError);
			return;
		}
		setSaving(true);
		setError('');
		try {
			if (isEdit && client) {
				const { error: err } = await supabase
					.from('clients')
					.update(buildClientUpdate(draft))
					.eq('tenant_id', tenantId)
					.eq('id', client.id);
				if (err) throw err;
			} else {
				const { error: err } = await supabase.from('clients').insert(buildClientInsert(draft, tenantId));
				if (err) {
					if (err.code === '23505') {
						setError('Já existe um cliente com esse e-mail/telefone/nome. Adicione um e-mail para diferenciar.');
						setSaving(false);
						return;
					}
					throw err;
				}
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível salvar o cliente.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!tenantId || !client) return;
		setSaving(true);
		setError('');
		try {
			// FK é on delete set null: excluir não gera erro, apenas desvincula em silêncio.
			// Por isso a checagem é proativa — bloqueia se houver vendas vinculadas.
			const { count, error: countErr } = await supabase
				.from('sales_orders')
				.select('id', { count: 'exact', head: true })
				.eq('tenant_id', tenantId)
				.eq('client_id', client.id);
			if (countErr) throw countErr;
			if (count && count > 0) {
				setError(deleteBlockMessage('cliente', count));
				setConfirmDelete(false);
				setSaving(false);
				return;
			}
			const { error: delErr } = await supabase
				.from('clients')
				.delete()
				.eq('tenant_id', tenantId)
				.eq('id', client.id);
			if (delErr) throw delErr;
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível excluir o cliente.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
			<div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:static sm:max-h-[90vh] sm:max-w-lg sm:rounded-[var(--radius-card)]">
				<div className="flex flex-shrink-0 justify-center py-3 sm:hidden">
					<div className="h-1 w-10 rounded-full bg-border" />
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
								{isEdit ? 'Editar cliente' : 'Novo cliente'}
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{isEdit ? 'Atualize os dados do cliente.' : 'Cadastre um cliente manualmente.'}
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
							Fechar
						</button>
					</div>

					<div className="mt-6 grid gap-4">
						<div>
							<label className={labelClass}>Nome *</label>
							<input value={draft.nome} onChange={(e) => update({ nome: e.target.value })} autoFocus className={fieldClass} />
						</div>
						<div>
							<label className={labelClass}>Cidade</label>
							<input value={draft.cidade} onChange={(e) => update({ cidade: e.target.value })} className={fieldClass} />
						</div>
						<div>
							<label className={labelClass}>Telefone</label>
							<input value={draft.telefone} onChange={(e) => update({ telefone: e.target.value })} className={fieldClass} />
						</div>
						<div>
							<label className={labelClass}>E-mail</label>
							<input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} className={fieldClass} />
						</div>
						{error && <p className="text-xs text-rose-500">{error}</p>}
					</div>
				</div>

				<div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border/20 px-6 py-4">
					<div>
						{isEdit &&
							(confirmDelete ? (
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={remove}
										disabled={saving}
										className="rounded-full bg-rose-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-50">
										Confirmar exclusão
									</button>
									<button
										type="button"
										onClick={() => setConfirmDelete(false)}
										className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Cancelar
									</button>
								</div>
							) : (
								<button
									type="button"
									onClick={() => {
										setError('');
										setConfirmDelete(true);
									}}
									className="rounded-full border border-rose-500/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 transition hover:bg-rose-500/10">
									Excluir
								</button>
							))}
					</div>
					<div className="flex gap-3">
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
							Cancelar
						</button>
						<button
							type="button"
							onClick={save}
							disabled={saving || !tenantId}
							className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
							{saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar cliente'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Fiar o modal em `ClientsPage`**

Em `src/components/ClientsPage.tsx`:

2a. Adicionar imports no topo (após os imports existentes):
```typescript
import { ClientFormModal } from './clients/ClientFormModal';
import type { Client } from '../types';
```
(Se `Client` já estiver importado de `../types`, apenas garantir que está na lista — não duplicar.)

2b. Ampliar a assinatura de props. Trocar o objeto de props desestruturado e seu tipo para incluir os três novos campos:
```tsx
const ClientsPage = ({
	clientes,
	clientEvolution: clientEvolutionProp,
	primaryColor,
	secondaryColor,
	tenantId,
	isAdmin = false,
	onReload,
}: {
	clientes: Client[];
	clientEvolution?: HistoryItem[];
	primaryColor: string;
	secondaryColor: string;
	tenantId?: string;
	isAdmin?: boolean;
	onReload?: () => void;
}) => {
```

2c. Logo após `const CLIENTS_INITIAL = 5;`, adicionar o estado do modal:
```tsx
	const [modalOpen, setModalOpen] = useState(false);
	const [editingClient, setEditingClient] = useState<Client | null>(null);

	const openCreate = () => {
		setEditingClient(null);
		setModalOpen(true);
	};
	const openEdit = (c: Client) => {
		if (!isAdmin) return;
		setEditingClient(c);
		setModalOpen(true);
	};
```

2d. Adicionar o botão "Novo cliente". Imediatamente após a abertura do fragmento `<>` (antes do primeiro `<Section ...>` de métricas), inserir:
```tsx
			{isAdmin && (
				<Section className="mt-8 flex justify-end">
					<button
						type="button"
						onClick={openCreate}
						className="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
						Novo cliente
					</button>
				</Section>
			)}
```
E trocar a classe do `<Section>` de métricas que vinha logo abaixo, de `className="mt-8 grid ..."` para `className="mt-6 grid ..."` (mantém o espaçamento agradável quando o botão aparece; o resto da string de classes fica igual).

2e. Tornar as linhas clicáveis para editar (apenas admin). No card mobile, na `div` de cada cliente `key={c.id}`, adicionar handler e cursor quando admin:
```tsx
								<div
									key={c.id}
									onClick={() => openEdit(c)}
									className={`rounded-2xl border border-border/40 bg-card p-4${isAdmin ? ' cursor-pointer transition hover:border-border' : ''}`}>
```
E na tabela desktop, na `<tr key={c.id} ...>`:
```tsx
										<tr
											key={c.id}
											onClick={() => openEdit(c)}
											className={`hover:bg-muted/60${isAdmin ? ' cursor-pointer' : ''}`}>
```

2f. Renderizar o modal antes do fechamento `</>`:
```tsx
			<ClientFormModal
				open={modalOpen}
				tenantId={tenantId}
				client={editingClient}
				onClose={() => setModalOpen(false)}
				onSaved={() => onReload?.()}
			/>
```

- [ ] **Step 3: Passar as props novas no `Dashboard`**

Em `src/components/Dashboard.tsx`, no bloco `{page === 'clientes' && ( <ClientsPage ... /> )}`, adicionar as três props:
```tsx
						<ClientsPage
							clientes={visibleClientes}
							clientEvolution={visibleClientEvolution}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
							tenantId={tenantId}
							isAdmin={isAdmin}
							onReload={reload}
						/>
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: sem erros de tipo. (Confere props do modal, tipos de `Client`, `count` numérico.)

- [ ] **Step 5: Testes de regressão**

Run: `npm test`
Expected: PASS — nenhum teste quebrado (nenhum teste novo nesta task; a cobertura pura veio na Task 1).

- [ ] **Step 6: Verificação manual (admin logado)**

- Ir para a aba Clientes. Confirmar que "Novo cliente" aparece (admin) e some para não-admin.
- Criar um cliente só com nome → aparece na lista após reload.
- Clicar numa linha → editar cidade/telefone/e-mail → Salvar → mudança reflete.
- Criar dois clientes de mesmo nome sem e-mail/telefone → o segundo mostra o erro de duplicidade (23505).
- Excluir um cliente sem vendas → some. Excluir um cliente com venda vinculada → bloqueio com a mensagem de N vendas.

- [ ] **Step 7: Commit**

```bash
git add src/components/clients/ClientFormModal.tsx src/components/ClientsPage.tsx src/components/Dashboard.tsx
git commit -m "feat(clients): criar/editar/excluir cliente por modal no UI"
```

---

### Task 3: CRUD de vendedor (modal + wire em SellersPage/Dashboard)

**Files:**
- Create: `src/components/sellers/SellerFormModal.tsx`
- Modify: `src/components/SellersPage.tsx`
- Modify: `src/components/Dashboard.tsx` (bloco `page === 'vendedores'`, ~415-419)

**Interfaces:**
- Consumes: da Task 1 — `SellerDraft`, `emptySellerDraft`, `sellerToDraft`, `validateSellerDraft`, `buildSellerInsert`, `buildSellerUpdate`, `deleteBlockMessage`. Tipo `Seller` de `../../types`. `supabase` de `../../lib/supabaseClient`.
- Produces: `SellerFormModal` com props `{ open: boolean; tenantId?: string; seller?: Seller | null; onClose: () => void; onSaved: () => void }`. `SellersPage` passa a aceitar `tenantId?: string; isAdmin?: boolean; onReload?: () => void`.

- [ ] **Step 1: Criar o `SellerFormModal`**

Criar `src/components/sellers/SellerFormModal.tsx` (mesma estrutura do `ClientFormModal`, mas só nome + e-mail; FK usa `seller_id`; textos de vendedor):

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Seller } from '../../types';
import {
	buildSellerInsert,
	buildSellerUpdate,
	deleteBlockMessage,
	emptySellerDraft,
	sellerToDraft,
	validateSellerDraft,
	type SellerDraft,
} from '../../utils/clientSellerForms';

type Props = {
	open: boolean;
	tenantId?: string;
	seller?: Seller | null;
	onClose: () => void;
	onSaved: () => void;
};

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

export const SellerFormModal = ({ open, tenantId, seller, onClose, onSaved }: Props) => {
	const isEdit = !!seller;
	const [draft, setDraft] = useState<SellerDraft>(emptySellerDraft());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		if (!open) return;
		setDraft(seller ? sellerToDraft(seller) : emptySellerDraft());
		setError('');
		setConfirmDelete(false);
		setSaving(false);
	}, [open, seller]);

	if (!open) return null;

	const update = (partial: Partial<SellerDraft>) => setDraft((c) => ({ ...c, ...partial }));

	const save = async () => {
		if (!tenantId) return;
		const validationError = validateSellerDraft(draft);
		if (validationError) {
			setError(validationError);
			return;
		}
		setSaving(true);
		setError('');
		try {
			if (isEdit && seller) {
				const { error: err } = await supabase
					.from('sellers')
					.update(buildSellerUpdate(draft))
					.eq('tenant_id', tenantId)
					.eq('id', seller.id);
				if (err) throw err;
			} else {
				const { error: err } = await supabase.from('sellers').insert(buildSellerInsert(draft, tenantId));
				if (err) {
					if (err.code === '23505') {
						setError('Já existe um vendedor com esse e-mail/nome. Adicione um e-mail para diferenciar.');
						setSaving(false);
						return;
					}
					throw err;
				}
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível salvar o vendedor.');
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!tenantId || !seller) return;
		setSaving(true);
		setError('');
		try {
			const { count, error: countErr } = await supabase
				.from('sales_orders')
				.select('id', { count: 'exact', head: true })
				.eq('tenant_id', tenantId)
				.eq('seller_id', seller.id);
			if (countErr) throw countErr;
			if (count && count > 0) {
				setError(deleteBlockMessage('vendedor', count));
				setConfirmDelete(false);
				setSaving(false);
				return;
			}
			const { error: delErr } = await supabase
				.from('sellers')
				.delete()
				.eq('tenant_id', tenantId)
				.eq('id', seller.id);
			if (delErr) throw delErr;
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível excluir o vendedor.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/60 sm:flex sm:items-center sm:justify-center sm:p-4">
			<div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:static sm:max-h-[90vh] sm:max-w-lg sm:rounded-[var(--radius-card)]">
				<div className="flex flex-shrink-0 justify-center py-3 sm:hidden">
					<div className="h-1 w-10 rounded-full bg-border" />
				</div>
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-2 sm:pt-6">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
								{isEdit ? 'Editar vendedor' : 'Novo vendedor'}
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{isEdit ? 'Atualize os dados do vendedor.' : 'Cadastre um vendedor manualmente.'}
							</p>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-border/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
							Fechar
						</button>
					</div>

					<div className="mt-6 grid gap-4">
						<div>
							<label className={labelClass}>Nome *</label>
							<input value={draft.nome} onChange={(e) => update({ nome: e.target.value })} autoFocus className={fieldClass} />
						</div>
						<div>
							<label className={labelClass}>E-mail</label>
							<input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} className={fieldClass} />
						</div>
						{error && <p className="text-xs text-rose-500">{error}</p>}
					</div>
				</div>

				<div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border/20 px-6 py-4">
					<div>
						{isEdit &&
							(confirmDelete ? (
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={remove}
										disabled={saving}
										className="rounded-full bg-rose-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-50">
										Confirmar exclusão
									</button>
									<button
										type="button"
										onClick={() => setConfirmDelete(false)}
										className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
										Cancelar
									</button>
								</div>
							) : (
								<button
									type="button"
									onClick={() => {
										setError('');
										setConfirmDelete(true);
									}}
									className="rounded-full border border-rose-500/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 transition hover:bg-rose-500/10">
									Excluir
								</button>
							))}
					</div>
					<div className="flex gap-3">
						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
							Cancelar
						</button>
						<button
							type="button"
							onClick={save}
							disabled={saving || !tenantId}
							className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
							{saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar vendedor'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Fiar o modal em `SellersPage`**

Em `src/components/SellersPage.tsx`:

2a. Adicionar imports:
```typescript
import { SellerFormModal } from './sellers/SellerFormModal';
```
(`Seller` já é importado de `../types` no arquivo.)

2b. Ampliar props:
```tsx
const SellersPage = ({
	vendedores,
	primaryColor,
	secondaryColor,
	tenantId,
	isAdmin = false,
	onReload,
}: {
	vendedores: Seller[];
	primaryColor: string;
	secondaryColor: string;
	tenantId?: string;
	isAdmin?: boolean;
	onReload?: () => void;
}) => {
```

2c. Após `const SELLERS_INITIAL = 5;`, adicionar estado:
```tsx
	const [modalOpen, setModalOpen] = useState(false);
	const [editingSeller, setEditingSeller] = useState<Seller | null>(null);

	const openCreate = () => {
		setEditingSeller(null);
		setModalOpen(true);
	};
	const openEdit = (s: Seller) => {
		if (!isAdmin) return;
		setEditingSeller(s);
		setModalOpen(true);
	};
```

2d. Adicionar o botão "Novo vendedor" logo após a abertura do fragmento/`return` (antes do primeiro bloco de conteúdo — o arquivo abre com `<>` seguido de uma `<Section>`; inserir o botão como primeiro filho):
```tsx
			{isAdmin && (
				<Section className="mt-8 flex justify-end">
					<button
						type="button"
						onClick={openCreate}
						className="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-primary hover:text-primary-foreground">
						Novo vendedor
					</button>
				</Section>
			)}
```
(Se o primeiro `<Section>` de conteúdo usa `className="mt-8 ..."`, trocar para `mt-6` para o espaçamento ficar consistente quando o botão aparece.)

2e. Tornar as linhas/cartões de vendedor clicáveis para editar (admin). Atenção: só há **dois** elementos da lista de vendedores a tocar — o card mobile e a linha da tabela. Os outros `key={v.id}` do arquivo (linhas ~115 e ~147) são elementos de gráfico (`<linearGradient>`, barras) e **não** devem ser alterados.

Card mobile — trocar `<div key={v.id} className="rounded-2xl border border-border/40 bg-card p-4">` por:
```tsx
									<div
										key={v.id}
										onClick={() => openEdit(v)}
										className={`rounded-2xl border border-border/40 bg-card p-4${isAdmin ? ' cursor-pointer transition hover:border-border' : ''}`}>
```

Linha da tabela desktop — trocar `<tr key={v.id} className="hover:bg-muted/60">` por:
```tsx
											<tr
												key={v.id}
												onClick={() => openEdit(v)}
												className={`hover:bg-muted/60${isAdmin ? ' cursor-pointer' : ''}`}>
```

2f. Renderizar o modal antes do fechamento do fragmento (`</>`):
```tsx
			<SellerFormModal
				open={modalOpen}
				tenantId={tenantId}
				seller={editingSeller}
				onClose={() => setModalOpen(false)}
				onSaved={() => onReload?.()}
			/>
```

- [ ] **Step 3: Passar props novas no `Dashboard`**

Em `src/components/Dashboard.tsx`, no bloco `{page === 'vendedores' && ( <SellersPage ... /> )}`:
```tsx
						<SellersPage
							vendedores={visibleVendedores}
							primaryColor={primaryColor}
							secondaryColor={secondaryColor}
							tenantId={tenantId}
							isAdmin={isAdmin}
							onReload={reload}
						/>
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: sem erros de tipo.

- [ ] **Step 5: Testes de regressão**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verificação manual (admin logado)**

- Aba Vendedores: "Novo vendedor" aparece (admin) / some (não-admin).
- Criar vendedor só com nome → aparece após reload.
- Editar e-mail → Salvar → reflete.
- Excluir vendedor sem vendas → some. Com vendas vinculadas → bloqueio com a mensagem.

- [ ] **Step 7: Commit**

```bash
git add src/components/sellers/SellerFormModal.tsx src/components/SellersPage.tsx src/components/Dashboard.tsx
git commit -m "feat(sellers): criar/editar/excluir vendedor por modal no UI"
```

---

## Notas de verificação final (após as 3 tasks)

- `npm run build` e `npm test` verdes.
- E2e manual das duas telas (criar/editar/excluir, duplicidade, bloqueio por vendas vinculadas) — este é o gate real, como nas mutações de venda.
- Atualizar o PR #67 (tirar de draft quando o e2e manual passar).
