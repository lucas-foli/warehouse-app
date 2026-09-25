# Fix-pack 2 do CRUD de clientes/vendedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Corrigir 3 achados do 2º e2e: cruzamento CSV quebrado (external_id manual em minúsculas), e-mail duplicado inconsistente entre criar/editar, e a falta de rolagem no mobile das listas.

**Architecture:** Continuação da branch `feat/clients-sellers-crud`. Mesmos arquivos (`clientSellerForms.ts`, os dois modais, as duas páginas). Sem migrations.

## Global Constraints

- Typecheck `npm run build` (NÃO `tsc --noEmit`). Testes `npm test` (baseline 136).
- Português com acentos; sem caracteres de controle.
- Decisões (fechadas no e2e):
  - **external_id na criação manual deve ser MAIÚSCULO** (igual ao import CSV, que faz `normalizeKey` = `trim().toUpperCase()` — `DataImport.tsx:146,384`). Hoje a criação manual grava minúsculo, e por isso `fetchIdMap` (busca `.in` case-sensitive) não cruza pedidos importados.
  - **E-mail único (bloquear sempre):** no criar E no editar, e-mail já usado por OUTRO registro é erro (bloqueia), não aviso. Nome continua com aviso soft (homônimos permitidos).
  - **Mobile das listas rola** (mesma ideia do desktop) e o botão "Ver mais"/"Ver menos" é removido.
- Não mexer no cap "Top 15 de N" de vendedores (`isSellerListCapped`) — é separado do "Ver mais".

## File Structure

- Modify `src/utils/clientSellerForms.ts` — `clientExternalId`/`sellerExternalId` em maiúsculas; nova `emailDuplicateError`.
- Modify `src/utils/clientSellerForms.test.ts` — ajustar asserts p/ maiúsculas; testar `emailDuplicateError`.
- Modify `src/components/clients/ClientFormModal.tsx` — checagem hard de e-mail único.
- Modify `src/components/sellers/SellerFormModal.tsx` — idem.
- Modify `src/components/ClientsPage.tsx` — mobile rola, remover "Ver mais".
- Modify `src/components/SellersPage.tsx` — idem.

---

### Task 1: external_id em maiúsculas + `emailDuplicateError` (TDD)

**Files:**
- Modify: `src/utils/clientSellerForms.ts`
- Test: `src/utils/clientSellerForms.test.ts`

**Interfaces:**
- Produces: `emailDuplicateError(kind: 'cliente' | 'vendedor'): string` (consumido pela Task 2). `clientExternalId`/`sellerExternalId` passam a retornar maiúsculas.

- [ ] **Step 1: Ajustar os testes existentes + adicionar os novos (falham primeiro)**

Em `src/utils/clientSellerForms.test.ts`:

Atualizar os asserts de `clientExternalId` para maiúsculas:
```typescript
	it('prefere email', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '9', email: 'a@x.com' })).toBe('A@X.COM');
	});
	it('cai para telefone', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '99', email: '' })).toBe('99');
	});
	it('cai para nome', () => {
		expect(clientExternalId({ nome: 'Ana', cidade: '', telefone: '', email: '' })).toBe('ANA');
	});
```
Atualizar `buildClientInsert`:
```typescript
	it('define tenant + external_id e omite opcionais vazios', () => {
		const row = buildClientInsert({ nome: ' Ana ', cidade: '', telefone: '', email: '' }, TENANT);
		expect(row).toEqual({ tenant_id: TENANT, external_id: 'ANA', name: 'Ana' });
	});
	it('inclui opcionais trimados quando presentes', () => {
		const row = buildClientInsert({ nome: 'Ana', cidade: ' SP ', telefone: ' 9 ', email: ' a@x.com ' }, TENANT);
		expect(row).toMatchObject({ name: 'Ana', city: 'SP', phone: '9', email: 'a@x.com', external_id: 'A@X.COM' });
	});
```
Atualizar o bloco 'vendedor':
```typescript
	it('external_id = email || nome', () => {
		expect(sellerExternalId({ nome: 'Bea', email: '' })).toBe('BEA');
		expect(sellerExternalId({ nome: 'Bea', email: 'b@x.com' })).toBe('B@X.COM');
	});
	it('insert omite email vazio', () => {
		expect(buildSellerInsert({ nome: 'Bea', email: '' }, TENANT)).toEqual({
			tenant_id: TENANT,
			external_id: 'BEA',
			name: 'Bea',
		});
	});
```
Adicionar o teste da nova função e incluí-la no import do topo:
```typescript
describe('emailDuplicateError', () => {
	it('monta a mensagem com o tipo', () => {
		expect(emailDuplicateError('cliente')).toBe('Já existe um cliente com esse e-mail.');
		expect(emailDuplicateError('vendedor')).toContain('um vendedor com esse e-mail');
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- clientSellerForms`
Expected: FAIL (external_id ainda minúsculo; `emailDuplicateError` inexistente).

- [ ] **Step 3: Implementar**

Em `src/utils/clientSellerForms.ts`, tornar o external_id maiúsculo (alinha com `normalizeKey` do import):
```typescript
export const clientExternalId = (d: ClientDraft): string =>
	(d.email.trim() || d.telefone.trim() || d.nome.trim()).toUpperCase();

export const sellerExternalId = (d: SellerDraft): string =>
	(d.email.trim() || d.nome.trim()).toUpperCase();
```
E adicionar (após `nameDuplicateWarning`):
```typescript
export const emailDuplicateError = (kind: 'cliente' | 'vendedor'): string =>
	`Já existe um ${kind} com esse e-mail.`;
```
(Não alterar `buildClientInsert`/`buildSellerInsert`: eles já usam `clientExternalId`/`sellerExternalId`, então herdam o maiúsculo. `name`/`city`/`phone`/`email` continuam como estão — só o `external_id` normaliza.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`; Expected: PASS. Depois `npm run build` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/utils/clientSellerForms.ts src/utils/clientSellerForms.test.ts
git commit -m "fix(clients-sellers): external_id manual em maiúsculas (cruza com CSV) + msg de e-mail duplicado"
```

---

### Task 2: E-mail único (bloqueio hard no criar e editar)

**Files:**
- Modify: `src/components/clients/ClientFormModal.tsx`
- Modify: `src/components/sellers/SellerFormModal.tsx`

**Interfaces:**
- Consumes: `emailDuplicateError` (Task 1).

Aplicar a MESMA mudança nos dois modais (`clients`/`sellers`, `'cliente'`/`'vendedor'`):

- [ ] **Step 1: Import**

Adicionar `emailDuplicateError` ao import de `../../utils/clientSellerForms`.

- [ ] **Step 2: Checagem hard de e-mail no `save`**

No `save`, DENTRO do `try`, ANTES do bloco `if (!force) { …aviso de nome… }`, inserir (cliente):
```tsx
			// E-mail único (hard): bloqueia sempre — no criar e no editar. Roda mesmo com force,
			// porque forçar vale só para o aviso de nome, não para o e-mail.
			if (draft.email.trim()) {
				let emailQuery = supabase
					.from('clients')
					.select('id', { count: 'exact', head: true })
					.eq('tenant_id', tenantId)
					.ilike('email', draft.email.trim().replace(/([%_\\])/g, '\\$1'));
				if (isEdit && client) emailQuery = emailQuery.neq('id', client.id);
				const { count: emailCount, error: emailErr } = await emailQuery;
				if (emailErr) throw emailErr;
				if (emailCount && emailCount > 0) {
					setError(emailDuplicateError('cliente'));
					setSaving(false);
					return;
				}
			}
```
No vendedor: `.from('sellers')`, `emailDuplicateError('vendedor')`, `seller` no lugar de `client`.

O bloco do aviso soft de nome (`if (!force) { … }`) e o insert/update seguem inalterados abaixo. Como o `external_id` agora é maiúsculo (Task 1), o e-mail duplicado no create também bateria no índice; esta checagem explícita dá a mensagem clara e cobre o edit (onde o índice não pega, pois o external_id é imutável).

- [ ] **Step 3: Typecheck + testes**

Run: `npm run build` e `npm test` (136 verdes; sem testes novos de UI).

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/ClientFormModal.tsx src/components/sellers/SellerFormModal.tsx
git commit -m "fix(clients-sellers): e-mail único — bloqueia duplicado no criar e no editar"
```

---

### Task 3: Mobile das listas rola + remover "Ver mais"

**Files:**
- Modify: `src/components/ClientsPage.tsx`
- Modify: `src/components/SellersPage.tsx`

- [ ] **Step 1: ClientsPage — remover estado de expandir**

Remover as duas linhas:
```tsx
	const [clientsExpanded, setClientsExpanded] = useState(false);
	const CLIENTS_INITIAL = 5;
```

- [ ] **Step 2: ClientsPage — mobile rola e mostra todos**

No `<div className="grid grid-cols-1 gap-3 p-3 md:hidden">`, acrescentar `max-h-[70vh] overflow-auto`:
```tsx
						<div className="grid grid-cols-1 gap-3 p-3 md:hidden max-h-[70vh] overflow-auto">
```
Trocar `(clientsExpanded ? clientes : clientes.slice(0, CLIENTS_INITIAL)).map((c) => (` por:
```tsx
							{clientes.map((c) => (
```
(Manter a linha existente de "Nenhum cliente encontrado" quando `clientes.length === 0`.)

- [ ] **Step 3: ClientsPage — remover o botão "Ver mais"**

Apagar todo o bloco:
```tsx
							{clientes.length > CLIENTS_INITIAL && (
								<button
									type="button"
									onClick={() => setClientsExpanded((v) => !v)}
									className="...">
									{clientsExpanded
										? 'Ver menos'
										: `Ver mais ${clientes.length - CLIENTS_INITIAL} clientes`}
								</button>
							)}
```

- [ ] **Step 4: SellersPage — remover estado de expandir**

Remover:
```tsx
	const [sellersExpanded, setSellersExpanded] = useState(false);
	const SELLERS_INITIAL = 5;
```

- [ ] **Step 5: SellersPage — mobile rola e mostra a lista (respeitando o cap 15)**

No `<div className="grid grid-cols-1 gap-3 p-3 md:hidden">`, acrescentar `max-h-[70vh] overflow-auto`.
Trocar `(sellersExpanded ? sellersForDisplay : sellersForDisplay.slice(0, SELLERS_INITIAL)).map((v) => {` por:
```tsx
									{sellersForDisplay.map((v) => {
```
Manter o aviso `isSellerListCapped` ("Exibindo Top 15 de N…") — não é o "Ver mais".

- [ ] **Step 6: SellersPage — remover o botão "Ver mais"**

Apagar o bloco `{sellersForDisplay.length > SELLERS_INITIAL && ( …button… )}` inteiro.

- [ ] **Step 7: Typecheck + testes**

Run: `npm run build` e `npm test`. (Se sobrar algum uso de `clientsExpanded`/`sellersExpanded`/`CLIENTS_INITIAL`/`SELLERS_INITIAL`, o build acusa — remover.)

- [ ] **Step 8: Verificação manual**

- Mobile (viewport estreito): as listas de clientes e vendedores rolam dentro do card; não há mais "Ver mais".
- Desktop: inalterado (já rolava).

- [ ] **Step 9: Commit**

```bash
git add src/components/ClientsPage.tsx src/components/SellersPage.tsx
git commit -m "feat(clients-sellers): listas rolam no mobile e removem o 'Ver mais'"
```

---

## Verificação final (após as 3 tasks)

- `npm run build` + `npm test` verdes.
- E2e: (12) recriar `external`/`internal` e reimportar o CSV de pedidos → cruzam (external_id agora maiúsculo casa com o import); (e-mail) editar para um e-mail já usado → erro; (mobile) listas rolam sem "Ver mais".
