# Fix-pack do CRUD de clientes/vendedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 4 achados do e2e do CRUD (PR #67): footer do modal com 4 botões ao excluir, rolagem na tela em vez da tabela, ausência de aviso de nome duplicado, e e-mail escondido na tabela.

**Architecture:** Iteração sobre a branch `feat/clients-sellers-crud`. Mesmos 4 arquivos do CRUD (`ClientFormModal`, `SellerFormModal`, `ClientsPage`, `SellersPage`) + a função pura em `clientSellerForms.ts`. Sem migrations, sem novas libs.

**Tech Stack:** React 19 + TS, Vite, Vitest, Supabase JS, Tailwind.

## Global Constraints

- Typecheck `npm run build` (NÃO `tsc --noEmit`). Testes `npm test` (baseline 135, 0 falhas).
- Prosa/comentários/UI em português com acentuação correta; sem caracteres de controle.
- Decisões de produto (do e2e, já fechadas):
  - Duplicidade: manter a regra de identidade por `external_id`; **adicionar AVISO soft por nome** (não bloqueia) no create e no edit.
  - **Adicionar coluna e-mail** nas tabelas de clientes e vendedores.
  - Validação de e-mail/máscara de telefone → backlog (NÃO fazer aqui).
- Os modais são dois arquivos separados por decisão travada — não unificar.

## File Structure

- Modify `src/utils/clientSellerForms.ts` — adicionar `nameDuplicateWarning` (pura).
- Modify `src/utils/clientSellerForms.test.ts` — testes da nova função.
- Modify `src/components/clients/ClientFormModal.tsx` — footer condicional + aviso soft.
- Modify `src/components/sellers/SellerFormModal.tsx` — idem.
- Modify `src/components/ClientsPage.tsx` — coluna e-mail + tabela rola (não a tela).
- Modify `src/components/SellersPage.tsx` — idem.

---

### Task 1: Função pura `nameDuplicateWarning` (TDD)

**Files:**
- Modify: `src/utils/clientSellerForms.ts`
- Test: `src/utils/clientSellerForms.test.ts`

**Interfaces:**
- Produces: `nameDuplicateWarning(kind: 'cliente' | 'vendedor', nome: string): string` — consumido pelos modais (Task 2).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Adicionar ao final de `src/utils/clientSellerForms.test.ts`:

```typescript
describe('nameDuplicateWarning', () => {
	it('monta o aviso com o tipo e o nome', () => {
		expect(nameDuplicateWarning('cliente', 'Jacksons')).toBe(
			'Já existe um cliente chamado "Jacksons". Criar mesmo assim?',
		);
		expect(nameDuplicateWarning('vendedor', 'Bruno')).toContain('um vendedor chamado "Bruno"');
	});
});
```

E adicionar `nameDuplicateWarning` ao import do topo do arquivo de teste.

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- clientSellerForms`
Expected: FAIL — `nameDuplicateWarning` não existe.

- [ ] **Step 3: Implementar**

Adicionar em `src/utils/clientSellerForms.ts` (após `deleteBlockMessage`):

```typescript
export const nameDuplicateWarning = (kind: 'cliente' | 'vendedor', nome: string): string =>
	`Já existe um ${kind} chamado "${nome}". Criar mesmo assim?`;
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm test`
Expected: PASS (136+ testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/clientSellerForms.ts src/utils/clientSellerForms.test.ts
git commit -m "feat(clients-sellers): aviso puro de nome duplicado"
```

---

### Task 2: Modais — footer condicional + aviso soft por nome

**Files:**
- Modify: `src/components/clients/ClientFormModal.tsx`
- Modify: `src/components/sellers/SellerFormModal.tsx`

**Interfaces:**
- Consumes: `nameDuplicateWarning` (Task 1). `supabase` já importado.

Aplicar as MESMAS duas mudanças nos dois modais (ajustando `clients`/`sellers`, `client_id`/`seller_id`, `'cliente'`/`'vendedor'`, `Client`/`Seller`, textos):

- [ ] **Step 1: Estado do aviso de nome**

Adicionar ao lado dos outros `useState`:
```tsx
	const [nameWarning, setNameWarning] = useState('');
```
No `useEffect([open, client])` (ou `[open, seller]`), adicionar o reset:
```tsx
		setNameWarning('');
```
No handler do campo Nome (`onChange`), limpar o aviso ao editar o nome:
```tsx
onChange={(e) => { update({ nome: e.target.value }); setNameWarning(''); }}
```

- [ ] **Step 2: Checagem soft de nome no `save`**

Transformar `save` para aceitar `force` e checar duplicata de nome antes de gravar (aqui, cliente):
```tsx
	const save = async (force = false) => {
		if (!tenantId) return;
		const validationError = validateClientDraft(draft);
		if (validationError) {
			setError(validationError);
			return;
		}
		setSaving(true);
		setError('');
		try {
			// Aviso soft: nome igual (case-insensitive) já existe? Não bloqueia — confirma.
			if (!force) {
				let dupQuery = supabase
					.from('clients')
					.select('id', { count: 'exact', head: true })
					.eq('tenant_id', tenantId)
					.ilike('name', draft.nome.trim());
				if (isEdit && client) dupQuery = dupQuery.neq('id', client.id);
				const { count, error: dupErr } = await dupQuery;
				if (dupErr) throw dupErr;
				if (count && count > 0) {
					setNameWarning(nameDuplicateWarning('cliente', draft.nome.trim()));
					setSaving(false);
					return;
				}
			}
			// ... (bloco de insert/update EXISTENTE, inalterado) ...
```
O restante do corpo do `save` (insert/update, tratamento de 23505, `onSaved()`, `onClose()`, catch/finally) permanece igual. No vendedor, trocar `clients`→`sellers`, `validateClientDraft`→`validateSellerDraft`, `'cliente'`→`'vendedor'`.

- [ ] **Step 3: Import da nova função**

Adicionar `nameDuplicateWarning` ao import de `../../utils/clientSellerForms`.

- [ ] **Step 4: Footer condicional (corrige os 4 botões) + botão "criar mesmo assim"**

Substituir o bloco do footer para ter DOIS modos exclusivos. Em modo confirmação de exclusão, o grupo Cancelar/Salvar some (some o problema dos 4 botões):
```tsx
				<div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border/20 px-6 py-4">
					{confirmDelete ? (
						<div className="flex w-full items-center justify-between gap-3">
							<span className="text-xs text-muted-foreground">Excluir este cliente?</span>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => setConfirmDelete(false)}
									className="rounded-full border border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-muted">
									Cancelar
								</button>
								<button
									type="button"
									onClick={remove}
									disabled={saving}
									className="rounded-full bg-rose-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:opacity-50">
									Confirmar exclusão
								</button>
							</div>
						</div>
					) : (
						<>
							<div>
								{isEdit && (
									<button
										type="button"
										onClick={() => {
											setError('');
											setNameWarning('');
											setConfirmDelete(true);
										}}
										className="rounded-full border border-rose-500/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 transition hover:bg-rose-500/10">
										Excluir
									</button>
								)}
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
									onClick={() => save(Boolean(nameWarning))}
									disabled={saving || !tenantId}
									className="rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
									{saving ? 'Salvando…' : nameWarning ? 'Criar mesmo assim' : isEdit ? 'Salvar' : 'Criar cliente'}
								</button>
							</div>
						</>
					)}
				</div>
```
(No vendedor: "Excluir este vendedor?" e `nameWarning ? 'Criar mesmo assim' : isEdit ? 'Salvar' : 'Criar vendedor'`.)

Observação sobre o clique: quando há `nameWarning`, o botão chama `save(true)` (força, pula a checagem e grava); ao editar o nome o aviso some e volta a `save(false)`.

- [ ] **Step 5: Renderizar o aviso de nome no corpo**

Onde hoje está `{error && <p className="text-xs text-rose-500">{error}</p>}`, adicionar acima dele:
```tsx
						{nameWarning && <p className="text-xs text-amber-600">{nameWarning}</p>}
```

- [ ] **Step 6: Typecheck + testes**

Run: `npm run build` (deve passar) e `npm test` (135+ verdes).

- [ ] **Step 7: Commit**

```bash
git add src/components/clients/ClientFormModal.tsx src/components/sellers/SellerFormModal.tsx
git commit -m "fix(clients-sellers): footer sem botões duplicados no excluir + aviso soft de nome duplicado"
```

---

### Task 3: Páginas — coluna e-mail + tabela rola (não a tela)

**Files:**
- Modify: `src/components/ClientsPage.tsx`
- Modify: `src/components/SellersPage.tsx`

**Interfaces:**
- Consumes: `Client.email` / `Seller.email` (já no type). Sem novas deps.

- [ ] **Step 1: Coluna e-mail — ClientsPage (tabela desktop)**

Na tabela desktop, adicionar o cabeçalho e a célula de e-mail entre Telefone e Última compra.
Cabeçalho (após `<th ...>Telefone</th>`):
```tsx
											<th className="px-4 py-3">E-mail</th>
```
Célula (após a `<td>` de telefone, dentro do `map`):
```tsx
												<td className="px-4 py-3 text-foreground">{c.email ?? '—'}</td>
```

- [ ] **Step 2: Coluna e-mail — ClientsPage (card mobile)**

No card mobile, dentro da `<dl>`, adicionar após a linha de Telefone:
```tsx
											<div className="flex items-center justify-between py-2">
												<dt className="text-muted-foreground">E-mail</dt>
												<dd className="text-foreground">{c.email ?? '—'}</dd>
											</div>
```

- [ ] **Step 3: Tabela rola, não a tela — ClientsPage**

O container da tabela desktop hoje é `<div className="hidden overflow-auto md:block">`. Trocar por um wrapper com altura máxima e scroll próprio, e tornar o `<thead>` fixo:
```tsx
						<div className="hidden md:block md:max-h-[640px] md:overflow-auto">
```
E no `<thead className="bg-muted ...">` da tabela, acrescentar `sticky top-0 z-10`:
```tsx
									<thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
```

- [ ] **Step 4: Repetir em SellersPage**

Aplicar o mesmo padrão em `SellersPage.tsx`:
- **Coluna e-mail (desktop):** adicionar `<th>E-mail</th>` logo após a coluna do vendedor e `<td>{v.email ?? '—'}</td>` na linha, na tabela de `sellersForDisplay` (o `<tr key={v.id}>`).
- **Coluna e-mail (mobile):** adicionar a linha de e-mail no card `<div key={v.id}>`, seguindo o layout de campos já usado ali.
- **Scroll:** envolver a tabela desktop num wrapper `md:max-h-[640px] md:overflow-auto` (se ainda não houver) e tornar o `<thead>` `sticky top-0 z-10 bg-muted`. Não tocar os elementos de gráfico.

- [ ] **Step 5: Typecheck + testes**

Run: `npm run build` e `npm test`.

- [ ] **Step 6: Verificação manual**

- Clientes/Vendedores: a coluna E-mail aparece e mostra o e-mail (ou —). Os dois "Jacksons" agora se distinguem pelo e-mail.
- Rolar a lista longa: a tabela rola internamente com cabeçalho fixo; a página não rola inteira.

- [ ] **Step 7: Commit**

```bash
git add src/components/ClientsPage.tsx src/components/SellersPage.tsx
git commit -m "feat(clients-sellers): coluna e-mail nas listas + rolagem na tabela (não na tela)"
```

---

## Verificação final

- `npm run build` + `npm test` verdes.
- E2e manual dos 4 itens: (A) excluir mostra só 2 botões; (B) tabela rola com header fixo; (C) criar/editar para um nome já existente mostra aviso amber e "Criar mesmo assim" grava; (D) coluna e-mail visível.
