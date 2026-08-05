# Integridade do import CSV (clientes/vendedores) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir dois furos de integridade do import CSV de clientes/vendedores: avisar/confirmar antes de desvincular vendas ao "Limpar dados" (BUG-11) e pular/reportar linhas com e-mail duplicado (BUG-12).

**Architecture:** A lógica testável vai para duas funções puras novas em `src/utils/` (padrão dos `csv.*.test.ts`); o `DataImport.tsx` faz as queries Supabase e o wiring de estado/UI. Nenhuma mudança de gravação — a normalização de e-mail permanece como está (decisão de escopo: fechar o case só na leitura).

**Tech Stack:** React + TypeScript, Supabase JS client, Vitest.

## Global Constraints

- Escopo: **só** `kind === 'clients'` e `kind === 'sellers'`. Não tocar em `products`, `orders`, `items`, `options`.
- Não alterar como o e-mail é gravado (import ou CRUD). A comparação de e-mail é case-insensitive **na leitura**; a coluna `email` continua case-misto no banco.
- Confirmação inline no padrão do #67 (`confirmDelete`), **sem** `window.confirm`.
- `external_id` já chega normalizado em MAIÚSCULAS pela sanitização existente (`DataImport.tsx:379-387`); a dedupe compara `external_id` em maiúsculas nos dois lados.
- Verificação de wiring usa `npx tsc -b` (NÃO `tsc --noEmit` — o tsconfig raiz tem `files: []`) e `npm test`. Baseline atual: **137 testes, 0 falhas**.
- Português com acentuação correta em toda copy visível ao usuário.

---

### Task 1: `buildClearWarning` (puro)

**Files:**
- Create: `src/utils/importClearWarning.ts`
- Test: `src/utils/importClearWarning.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `buildClearWarning(kind: 'clients' | 'sellers', count: number): string` — usado pelo componente na Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { buildClearWarning } from './importClearWarning';

describe('buildClearWarning', () => {
	it('plural + kind clients fala em cliente', () => {
		expect(buildClearWarning('clients', 12)).toBe(
			'Isso vai desvincular 12 vendas — elas ficarão sem cliente.',
		);
	});
	it('plural + kind sellers fala em vendedor', () => {
		expect(buildClearWarning('sellers', 3)).toBe(
			'Isso vai desvincular 3 vendas — elas ficarão sem vendedor.',
		);
	});
	it('singular usa "1 venda" e "ela ficará"', () => {
		expect(buildClearWarning('clients', 1)).toBe(
			'Isso vai desvincular 1 venda — ela ficará sem cliente.',
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/importClearWarning.test.ts`
Expected: FAIL — não encontra o módulo / `buildClearWarning is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// Aviso mostrado quando "Limpar dados antes de importar" vai desvincular vendas
// (FK on delete set null). Espelha o tom de deleteBlockMessage em clientSellerForms.ts.
export const buildClearWarning = (kind: 'clients' | 'sellers', count: number): string => {
	const alvo = kind === 'clients' ? 'cliente' : 'vendedor';
	const vendas = count === 1 ? '1 venda' : `${count} vendas`;
	const ficarao = count === 1 ? 'ela ficará' : 'elas ficarão';
	return `Isso vai desvincular ${vendas} — ${ficarao} sem ${alvo}.`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/importClearWarning.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/importClearWarning.ts src/utils/importClearWarning.test.ts
git commit -m "feat(import): buildClearWarning para aviso de desvinculo (BUG-11)"
```

---

### Task 2: `dedupeByEmail` (puro)

**Files:**
- Create: `src/utils/importEmailDedup.ts`
- Test: `src/utils/importEmailDedup.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `dedupeByEmail<T extends { external_id: string; email?: string }>(rows: T[], existingByEmail: Map<string, string>): { toImport: T[]; skippedEmails: number }` — usado pelo componente na Task 4. `existingByEmail` mapeia `emailLowercase -> external_id` dos registros já no banco.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { dedupeByEmail } from './importEmailDedup';

type Row = { external_id: string; email?: string };

describe('dedupeByEmail', () => {
	it('pula duplicata interna do CSV (mesmo e-mail, case-insensitive)', () => {
		const rows: Row[] = [
			{ external_id: 'A@X.COM', email: 'a@x.com' },
			{ external_id: 'OUTRO', email: 'A@X.COM' },
		];
		const res = dedupeByEmail(rows, new Map());
		expect(res.toImport).toEqual([{ external_id: 'A@X.COM', email: 'a@x.com' }]);
		expect(res.skippedEmails).toBe(1);
	});

	it('pula e-mail já no banco sob external_id diferente', () => {
		const rows: Row[] = [{ external_id: 'NOVO', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'ANTIGO']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual([]);
		expect(res.skippedEmails).toBe(1);
	});

	it('NÃO pula quando o external_id é o mesmo do banco (update legítimo)', () => {
		const rows: Row[] = [{ external_id: 'A@X.COM', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'A@X.COM']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});

	it('não pula linhas sem e-mail, mesmo repetidas', () => {
		const rows: Row[] = [
			{ external_id: 'ANA', email: '' },
			{ external_id: 'BEA' },
		];
		const res = dedupeByEmail(rows, new Map());
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});

	// Mata a mutação de remover o toUpperCase na comparação de external_id:
	// banco em minúsculas + linha em maiúsculas = mesmo registro, não pode pular.
	it('compara external_id case-insensitive (banco lower vs linha upper = mesmo)', () => {
		const rows: Row[] = [{ external_id: 'A@X.COM', email: 'a@x.com' }];
		const existing = new Map([['a@x.com', 'a@x.com']]);
		const res = dedupeByEmail(rows, existing);
		expect(res.toImport).toEqual(rows);
		expect(res.skippedEmails).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/importEmailDedup.test.ts`
Expected: FAIL — não encontra o módulo / `dedupeByEmail is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// Pula linhas de e-mail duplicado antes do upsert do import (BUG-12).
// Uma linha com e-mail (case-insensitive, não vazio) é pulada quando:
//  - o e-mail já apareceu antes no próprio CSV, OU
//  - o e-mail existe no banco sob um external_id DIFERENTE do da linha.
// Mesmo external_id = atualização legítima do próprio registro (não pula).
// Linhas sem e-mail nunca são puladas por este motivo.
export const dedupeByEmail = <T extends { external_id: string; email?: string }>(
	rows: T[],
	existingByEmail: Map<string, string>,
): { toImport: T[]; skippedEmails: number } => {
	const seen = new Set<string>();
	const toImport: T[] = [];
	let skippedEmails = 0;

	for (const row of rows) {
		const email = (row.email ?? '').trim().toLowerCase();
		if (!email) {
			toImport.push(row);
			continue;
		}
		if (seen.has(email)) {
			skippedEmails += 1;
			continue;
		}
		const existing = existingByEmail.get(email);
		if (existing && existing.toUpperCase() !== row.external_id.toUpperCase()) {
			skippedEmails += 1;
			continue;
		}
		seen.add(email);
		toImport.push(row);
	}

	return { toImport, skippedEmails };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/importEmailDedup.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/importEmailDedup.ts src/utils/importEmailDedup.test.ts
git commit -m "feat(import): dedupeByEmail para pular e-mail duplicado (BUG-12)"
```

---

### Task 3: Wiring BUG-11 — aviso + confirmação inline no "Limpar dados"

**Files:**
- Modify: `src/components/DataImport.tsx`

**Interfaces:**
- Consumes: `buildClearWarning` (Task 1).
- Produces: comportamento de UI; nada consumido por tasks posteriores.

- [ ] **Step 1: Importar o helper e adicionar estados**

Em `DataImport.tsx`, adicionar o import (após a linha 16, junto dos outros utils):

```typescript
import { buildClearWarning } from '../utils/importClearWarning';
```

Adicionar dois estados após `const [clearBeforeImport, setClearBeforeImport] = useState(false);` (linha 169):

```typescript
	const [unlinkCount, setUnlinkCount] = useState(0);
	const [confirmClear, setConfirmClear] = useState(false);
```

- [ ] **Step 2: Zerar os estados novos no reset**

Em `resetCsv` (linha 176-186), adicionar antes do fechamento:

```typescript
		setUnlinkCount(0);
		setConfirmClear(false);
```

- [ ] **Step 3: Função que recalcula a contagem ao togglar o checkbox**

Adicionar esta função dentro do componente (ex.: logo antes de `handleImport`, linha 344):

```typescript
	const updateClearState = async (nextChecked: boolean) => {
		setClearBeforeImport(nextChecked);
		setConfirmClear(false);
		if (!nextChecked || !tenantId || (kind !== 'clients' && kind !== 'sellers')) {
			setUnlinkCount(0);
			return;
		}
		const fk = kind === 'clients' ? 'client_id' : 'seller_id';
		const { count, error } = await supabase
			.from('sales_orders')
			.select('*', { count: 'exact', head: true })
			.eq('tenant_id', tenantId)
			.not(fk, 'is', null);
		setUnlinkCount(error ? 0 : count ?? 0);
	};
```

- [ ] **Step 4: Ligar o checkbox à nova função**

No checkbox do "Limpar dados" (linha 611-612), trocar o `onChange`:

```typescript
									checked={clearBeforeImport}
									onChange={(event) => void updateClearState(event.target.checked)}
```

- [ ] **Step 5: Mostrar o aviso abaixo do checkbox**

Dentro do container do checkbox, logo após o `</label>` de fecho (linha 620), antes do `</div>` que fecha o bloco `rounded-md border ...` (linha 621), inserir:

```typescript
							{clearBeforeImport && (kind === 'clients' || kind === 'sellers') && unlinkCount > 0 && (
								<p className="mt-2 text-xs font-medium text-amber-700">
									{buildClearWarning(kind, unlinkCount)}
								</p>
							)}
```

- [ ] **Step 6: Gate de confirmação no `handleImport`**

No topo de `handleImport` (após `if (!tenantId || csvRows.length === 0) return;`, linha 345), inserir:

```typescript
		const riskyClear =
			clearBeforeImport && (kind === 'clients' || kind === 'sellers') && unlinkCount > 0;
		if (riskyClear && !confirmClear) {
			setConfirmClear(true);
			return;
		}
		setConfirmClear(false);
```

- [ ] **Step 7: Botões — modo confirmação inline**

Substituir o botão de importar (linha 689-696) pelo bloco condicional. O bloco atual é:

```typescript
							<button
								type="button"
								onClick={handleImport}
								disabled={isImportDisabled}
								className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
							>
								{loading ? 'Importando...' : 'Importar CSV'}
							</button>
```

Trocar por:

```typescript
							{confirmClear ? (
								<>
									<button
										type="button"
										onClick={() => setConfirmClear(false)}
										className="w-full inline-flex justify-center rounded-md border border-border/40 shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm"
									>
										Cancelar
									</button>
									<button
										type="button"
										onClick={handleImport}
										disabled={isImportDisabled}
										className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
									>
										{loading
											? 'Importando...'
											: `Confirmar (${unlinkCount} ${unlinkCount === 1 ? 'venda ficará' : 'vendas ficarão'} sem vínculo)`}
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={handleImport}
									disabled={isImportDisabled}
									className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring/25 sm:text-sm disabled:opacity-50"
								>
									{loading ? 'Importando...' : 'Importar CSV'}
								</button>
							)}
```

- [ ] **Step 8: Typecheck + build + suíte**

Run: `npx tsc -b && npm test`
Expected: build sem erro de tipo; **137 testes anteriores + 8 novos (Task 1: 3, Task 2: 5) = 145, 0 falhas**.

- [ ] **Step 9: Commit**

```bash
git add src/components/DataImport.tsx
git commit -m "feat(import): aviso + confirmação inline ao limpar clientes/vendedores (BUG-11)"
```

---

### Task 4: Wiring BUG-12 — pular + reportar e-mail duplicado no import

**Files:**
- Modify: `src/components/DataImport.tsx`

**Interfaces:**
- Consumes: `dedupeByEmail` (Task 2).
- Produces: comportamento de UI; nada consumido por tasks posteriores.

- [ ] **Step 1: Importar o helper e adicionar o estado do relatório**

Adicionar o import (junto do da Task 3):

```typescript
import { dedupeByEmail } from '../utils/importEmailDedup';
```

Adicionar o estado após `confirmClear` (Task 3):

```typescript
	const [skippedEmailCount, setSkippedEmailCount] = useState(0);
```

Zerar em `resetCsv` (junto dos resets da Task 3):

```typescript
		setSkippedEmailCount(0);
```

Zerar também no início de `processCsvFile` (junto de `setImportedRows(null)`, linha 219) para não vazar entre uploads:

```typescript
		setSkippedEmailCount(0);
```

- [ ] **Step 2: Buscar e-mails do banco + dedupe no ramo clients/sellers**

No `handleImport`, o ramo `if (kind === 'clients' || kind === 'sellers')` hoje é (linhas 379-392):

```typescript
			if (kind === 'clients' || kind === 'sellers') {
				const sanitized = (csvRows as Array<Record<string, unknown>>).map((row) => {
					const rawExternal = String(row.external_id ?? '').trim();
					return {
						...row,
						external_id: rawExternal ? normalizeKey(rawExternal) : rawExternal,
						name: String(row.name ?? '').trim(),
					};
				});
				const uploaded = await upsertRows(sanitized);
				setImportedRows(uploaded);
				setLoading(false);
				return;
			}
```

Substituir o miolo (a partir de `const uploaded = ...`) para buscar os e-mails existentes, rodar `dedupeByEmail` e reportar. O ramo inteiro passa a ser:

```typescript
			if (kind === 'clients' || kind === 'sellers') {
				const sanitized = (csvRows as Array<Record<string, unknown>>).map((row) => {
					const rawExternal = String(row.external_id ?? '').trim();
					return {
						...row,
						external_id: rawExternal ? normalizeKey(rawExternal) : rawExternal,
						name: String(row.name ?? '').trim(),
					};
				});

				const hasCsvEmails = sanitized.some((row) => String(row.email ?? '').trim() !== '');
				const existingByEmail = new Map<string, string>();
				if (hasCsvEmails) {
					const PAGE = 1000;
					for (let from = 0; ; from += PAGE) {
						const { data, error } = await supabase
							.from(config.table)
							.select('external_id, email')
							.eq('tenant_id', tenantId)
							.not('email', 'is', null)
							.range(from, from + PAGE - 1);
						if (error) throw error;
						const page = (data ?? []) as Array<{ external_id: string | null; email: string | null }>;
						page.forEach((row) => {
							const em = String(row.email ?? '').trim().toLowerCase();
							const ext = String(row.external_id ?? '').trim();
							if (em && ext) existingByEmail.set(em, ext);
						});
						if (page.length < PAGE) break;
					}
				}

				const { toImport, skippedEmails } = dedupeByEmail(
					sanitized as Array<{ external_id: string; email?: string }>,
					existingByEmail,
				);
				const uploaded = await upsertRows(toImport as Array<Record<string, unknown>>);
				setImportedRows(uploaded);
				setSkippedEmailCount(skippedEmails);
				setLoading(false);
				return;
			}
```

- [ ] **Step 3: Reportar as ignoradas no bloco de sucesso**

No bloco de sucesso (linhas 669-673), estender a mensagem quando houver puladas. Trocar:

```typescript
						{importedRows !== null && (
							<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
								Importacao concluida: {importedRows} registros enviados.
							</div>
						)}
```

Por:

```typescript
						{importedRows !== null && (
							<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
								Importacao concluida: {importedRows} registros enviados.
								{skippedEmailCount > 0 && (
									<span className="mt-1 block">
										{skippedEmailCount} linha(s) ignorada(s): e-mail já cadastrado.
									</span>
								)}
							</div>
						)}
```

- [ ] **Step 4: Typecheck + build + suíte**

Run: `npx tsc -b && npm test`
Expected: build sem erro de tipo; **145 testes, 0 falhas**.

- [ ] **Step 5: Commit**

```bash
git add src/components/DataImport.tsx
git commit -m "feat(import): pular + reportar e-mail duplicado no import de clientes/vendedores (BUG-12)"
```

---

## Verificação final (antes do finishing)

- [ ] `npm run build` limpo (typecheck + vite build).
- [ ] `npm test` — 145, 0 falhas.
- [ ] E2e manual (segue a memória feedback_testing_workflow / feedback_follow_proper_flow, pela UI):
  - BUG-11: com vendas vinculadas a um cliente, marcar "Limpar dados" no import de clientes → aparece o aviso com a contagem; "Importar" vira "Confirmar (N ...)" + "Cancelar"; Cancelar aborta; Confirmar limpa e importa.
  - BUG-11: sem vendas vinculadas (count 0) → sem aviso, "Importar" segue direto.
  - BUG-12: CSV com dois e-mails iguais (case diferente) → só 1 importado, relatório mostra "1 linha(s) ignorada(s)".
  - BUG-12: CSV com e-mail já no banco sob external_id diferente → pulado; mesmo external_id → atualiza normal.
  - BUG-12: CSV sem coluna de e-mail → importa tudo, sem relatório de ignoradas.

## Self-review (checado contra a spec)

- BUG-11 (aviso + confirmação): Task 3. ✅
- BUG-12 (pular + reportar): Tasks 2 + 4. ✅
- `buildClearWarning` puro/testado: Task 1. ✅
- `dedupeByEmail` puro/testado: Task 2. ✅
- Escopo restrito a clients/sellers: gate `kind === 'clients' || kind === 'sellers'` em todos os ramos. ✅
- Furo de case fechado na leitura (busca `email is not null` + comparação lowercase, sem `.in`): decisão do arquiteto sobre a spec, Task 4 Step 2. ✅
- Type consistency: `buildClearWarning(kind, count)` e `dedupeByEmail(rows, Map)` idênticos entre definição (Tasks 1-2) e uso (Tasks 3-4). ✅
