# Bugs do Painel (BUG-20/21) + copy do set-password (BUG-9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tabela "Recebido x vendido" do Painel lista só SKUs com movimento; custo desconhecido nunca aparece como `US$ 0,00`; o set-password tem texto neutro.

**Architecture:** Leitura pura, sem migration. O filtro do BUG-20 mora em `buildReceivedVsSold` (a tela confia no contrato). O BUG-21 ganha um campo `costKnown: boolean` nas linhas agregadas (`SampleContactRow`, `SupplierReceivedRow`) e o `PanelView` decide a exibição por ele — nunca por `cost === 0`. O BUG-9 é troca de texto em `SetPassword`.

**Tech Stack:** React + TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-painel-bugs-design.md`

## Global Constraints

- Worktree: `/Users/lucasoliveira/projects/warehouse-app/.claude/worktrees/painel-bugs`, branch `bugs/e2e-manual-2026-08-04` (PR #66). Rodar tudo daqui.
- Gate de testes: `npm test` (vitest; a baseline antes da Task 1 é **311 testes verdes**).
- Gate de tipos: `npx tsc -b` — **nunca** `tsc --noEmit` (o tsconfig raiz tem `files: []` e não checa nada). Os arquivos `*.test.ts(x)` estão no `include` do `tsconfig.app.json`, então literal de teste sem campo obrigatório reprova o `tsc -b`.
- Indentação com **tab**, aspas simples, ponto e vírgula — igual aos arquivos vizinhos.
- Todo teste novo leva comentário `// mata: <mutação que ele pega>`, como os testes existentes.
- Regra do BUG-21: **o valor em US$ de um agregado só aparece se ao menos uma linha dele tem custo conhecido.** A decisão nunca olha `cost === 0`.
- Textos exatos: KPI sem custo conhecido → `custo desconhecido`; set-password título → `Definir senha`; subtítulo → `Defina sua senha para acessar sua conta.`
- `docs/bugs.md`: bug resolvido ganha ` (RESOLVIDO — PR #66)` no fim do título e um bloco `> **Resolvido** em PR #66: …` logo abaixo do título.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: BUG-20 — "Recebido x vendido" só com SKU que se moveu

**Files:**
- Modify: `src/utils/receivedVsSold.ts` (return de `buildReceivedVsSold`, ~linhas 76-88)
- Modify: `src/utils/receivedVsSold.test.ts`
- Modify: `src/components/field/PanelView.tsx` (bloco "Recebido x vendido", ~linhas 161-170)
- Modify: `src/components/field/PanelView.test.tsx`
- Modify: `docs/bugs.md` (entrada BUG-20)

**Interfaces:**
- Produces: `buildReceivedVsSold(input: ReceivedVsSoldInput): ReceivedVsSoldRow[]` — mesma assinatura; **novo contrato:** toda linha devolvida tem `received > 0 || sold > 0`. `ReceivedVsSoldRow` não muda.

- [ ] **Step 1: Escrever os testes que falham em `src/utils/receivedVsSold.test.ts`**

Dentro de `describe('buildReceivedVsSold', ...)`, adicionar ao final do bloco (antes do `});` que fecha o describe):

```ts
	it('não lista produto do catálogo sem movimento na janela', () => {
		// mata: remover o filtro — o catálogo inteiro volta como linhas 0/0 (BUG-20)
		const rows = buildReceivedVsSold({
			...base,
			products: [product('CAM-1620', 200, 'Camarão 16/20'), product('TIL-FIL', 80, 'Tilápia filé')],
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [], salesItems: [],
		});
		expect(rows.map((r) => r.sku)).toEqual(['CAM-1620']);
	});

	it('lista SKU só recebido na janela', () => {
		// mata: filtrar só por `sold > 0` (o recebimento sem venda sumiria da tabela)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [], salesItems: [],
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ sku: 'CAM-1620', received: 500, sold: 0 });
	});

	it('mantém a procedência de recebimento anterior à janela para SKU só vendido na janela', () => {
		// mata: restringir a procedência à janela junto com o filtro (o SKU
		// apareceria com procedência "—" apesar de ter fornecedor conhecido)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-01-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [order('o1', '2026-09-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 30)],
		});
		expect(rows).toEqual([{
			sku: 'CAM-1620', name: 'Camarão 16/20', received: 0, sold: 30,
			balance: 200, supplierName: 'Noronha Pescados', multipleSuppliers: false,
		}]);
	});
```

- [ ] **Step 2: Ajustar os testes existentes ao novo contrato no mesmo arquivo**

(a) Substituir o teste `'exclui recebimento e venda fora da janela'` inteiro por:

```ts
	it('exclui recebimento e venda fora da janela — e a linha some', () => {
		// mata: filtrar por "teve movimento em algum momento" em vez de "na
		// janela"; e ignorar a janela num dos dois lados (o mais provável é
		// sobrar no lado das vendas, cujo filtro mora no pedido, não no item)
		const rows = buildReceivedVsSold({
			...base,
			receipts: [receipt('r1', 's1', '2026-01-01T00:00:00.000Z')],
			receiptItems: [rItem('r1', 'CAM-1620', 500)],
			orders: [order('o1', '2026-01-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 300)],
		});
		expect(rows).toEqual([]);
	});
```

(b) No teste `'inclui SKU vendido que nunca foi recebido'`, trocar a linha de comentário `mata:` por:

```ts
		// mata: montar as linhas só a partir dos recebimentos, ou filtrar só por
		// `received > 0` (o produto some da tabela e a venda dele desaparece do painel)
```

(c) Substituir o teste `'descarta receiptItem cujo receiptId não tem recebimento correspondente (órfão)'` inteiro por (a venda na janela mantém a linha viva, para o teste continuar provando o descarte do órfão em vez de provar o filtro):

```ts
	it('descarta receiptItem cujo receiptId não tem recebimento correspondente (órfão)', () => {
		// mata: cair para qualquer data substituta em vez de descartar a linha —
		// mesma condição que sampleCost.lastKnownCostBySku agora também descarta,
		// pela mesma razão: sem o recebimento, não há data de fato conhecida.
		const rows = buildReceivedVsSold({
			...base,
			receipts: [], // 'r-orfao' não existe em `receipts`
			receiptItems: [rItem('r-orfao', 'CAM-1620', 500)],
			orders: [order('o1', '2026-09-02T00:00:00.000Z')],
			salesItems: [sItem('o1', 'CAM-1620', 5)],
		});
		expect(rows[0]).toMatchObject({ received: 0, sold: 5, supplierName: null, multipleSuppliers: false });
	});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/utils/receivedVsSold.test.ts`
Expected: FAIL em `'não lista produto do catálogo sem movimento na janela'` (volta `['CAM-1620', 'TIL-FIL']`) e em `'exclui recebimento e venda fora da janela — e a linha some'` (volta uma linha 0/0). Os demais passam.

- [ ] **Step 4: Implementar o filtro em `src/utils/receivedVsSold.ts`**

No `return` final de `buildReceivedVsSold`, inserir o `.filter` entre `[...acc.entries()]` e `.map(...)`:

```ts
	const supplierName = new Map(input.suppliers.map((s) => [s.id, s.name]));
	return [...acc.entries()]
		// Só SKU com movimento na janela (BUG-20). O catálogo entra no acc para
		// dar nome e saldo a quem se moveu, não para virar linha 0/0 na tela — e
		// a tela confia neste contrato em vez de refiltrar.
		.filter(([, row]) => row.received > 0 || row.sold > 0)
		.map(([sku, row]) => ({
```

(o restante do `.map` e do `.sort` fica igual)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/utils/receivedVsSold.test.ts`
Expected: PASS (todos)

- [ ] **Step 6: Simplificar a condição de vazio em `src/components/field/PanelView.tsx`**

Substituir o comentário e a condição do bloco "Recebido x vendido por produto":

```tsx
			{/* buildReceivedVsSold cria uma linha por produto do catálogo, então
			    `rows.length === 0` só é verdade sem catálogo — um tenant com
			    produtos e zero movimento no período veria a tabela inteira
			    zerada em vez desta frase. O vazio de verdade é nenhuma linha com
			    recebido ou vendido no período (o que também cobre catálogo vazio,
			    já que `.some` em array vazio é `false`). */}
			{!rows.some((row) => row.received > 0 || row.sold > 0) ? (
```

por:

```tsx
			{/* buildReceivedVsSold só devolve SKU com movimento na janela (BUG-20):
			    a regra de vazio mora lá, não aqui. */}
			{rows.length === 0 ? (
```

- [ ] **Step 7: Ajustar o teste de vazio em `src/components/field/PanelView.test.tsx`**

Substituir o teste `'mostra a frase de vazio em "Recebido x vendido" quando há produto mas nenhum movimento no período'` inteiro por:

```tsx
	it('mostra a frase de vazio em "Recebido x vendido" quando não há linha', () => {
		// mata: renderizar a tabela vazia (só o cabeçalho) em vez da frase — o
		// filtro de movimento mora em buildReceivedVsSold, então "sem movimento"
		// chega aqui como lista vazia
		render(<PanelView {...base} rows={[]} />);
		expect(screen.getByText(/Nenhum recebimento nem venda no período/i)).toBeInTheDocument();
		expect(screen.queryByText('Produto')).not.toBeInTheDocument();
	});
```

O teste `'mostra a tabela de "Recebido x vendido" quando há movimento no período'` fica como está.

- [ ] **Step 8: Rodar a suíte e o typecheck**

Run: `npm test && npx tsc -b`
Expected: todos verdes (311 + 3 novos = 314 testes); `tsc -b` sem saída.

- [ ] **Step 9: Marcar o BUG-20 como resolvido em `docs/bugs.md`**

Trocar o título:

```
## 2026-09-09 — BUG-20: o Painel lista o catálogo inteiro em "Recebido x vendido"
```

por:

```
## 2026-09-09 — BUG-20: o Painel lista o catálogo inteiro em "Recebido x vendido" (RESOLVIDO — PR #66)

> **Resolvido** em PR #66: `buildReceivedVsSold` só devolve SKU com `received > 0 ||
> sold > 0` na janela, e a condição de vazio do `PanelView` virou `rows.length === 0` —
> uma regra, num lugar só. Sem "ver todos": o catálogo mora na aba Produtos. O layout
> mobile da tabela (5 colunas com rolagem horizontal) ficou para o WAR-8.
```

- [ ] **Step 10: Commit**

```bash
git add src/utils/receivedVsSold.ts src/utils/receivedVsSold.test.ts src/components/field/PanelView.tsx src/components/field/PanelView.test.tsx docs/bugs.md
git commit -m "fix(painel): Recebido x vendido lista só SKU com movimento (BUG-20 / WAR-13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: BUG-21 (dado) — `costKnown` nas linhas de amostra e de fornecedor

**Files:**
- Modify: `src/utils/sampleCost.ts` (`SampleContactRow` e o laço de `summarizeSamples`)
- Modify: `src/utils/sampleCost.test.ts`
- Modify: `src/utils/receivedVsSold.ts` (`SupplierReceivedRow` e `buildReceivedBySupplier`)
- Modify: `src/utils/receivedVsSold.test.ts` (describe `buildReceivedBySupplier`)
- Modify: `src/components/field/PanelView.test.tsx` (só literais, para o `tsc -b` continuar verde)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces (a Task 3 usa):
  - `SampleContactRow = { key: string; name: string; qty: number; cost: number; partial: boolean; costKnown: boolean }`
  - `SupplierReceivedRow = { supplierId: string; name: string; qty: number; cost: number; partial: boolean; costKnown: boolean }`
  - `costKnown === true` ⇔ ao menos uma linha agregada teve custo conhecido (inclusive custo `0`).

- [ ] **Step 1: Testes que falham em `src/utils/sampleCost.test.ts`**

(a) No teste `'soma quantidade por contato e custeia com o último custo'`, trocar o `expect(r.byContact).toEqual(...)` por:

```ts
		expect(r.byContact).toEqual([
			{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 50, partial: false, costKnown: true },
		]);
```

(b) Adicionar ao final de `describe('summarizeSamples', ...)`:

```ts
	it('marca costKnown=false no contato que só recebeu SKU sem custo', () => {
		// mata: não distinguir "nada conhecido" de "parcial" — a tela voltaria a
		// mostrar "US$ 0,00 (parcial)" para um custo que ninguém sabe (BUG-21)
		const r = summarizeSamples({
			...base,
			interactions: [interaction({ clientId: 'c1', samples: [{ sku: 'LAG-CDA', qty: 6 }] })],
		});
		expect(r.byContact[0]).toMatchObject({ qty: 6, cost: 0, partial: true, costKnown: false });
	});

	it('marca costKnown=true quando o custo conhecido é zero', () => {
		// mata: derivar costKnown de `cost > 0` (um custo zero registrado é fato,
		// não ausência)
		const r = summarizeSamples({
			...base,
			receiptItems: [item('r1', 'BRINDE-1', 0)],
			interactions: [interaction({ clientId: 'c1', samples: [{ sku: 'BRINDE-1', qty: 2 }] })],
		});
		expect(r.byContact[0]).toMatchObject({ qty: 2, cost: 0, partial: false, costKnown: true });
	});
```

- [ ] **Step 2: Testes que falham em `src/utils/receivedVsSold.test.ts` (describe `buildReceivedBySupplier`)**

(a) No teste `'soma quantidade e custo por fornecedor dentro da janela'`, trocar o `expect(rows).toEqual(...)` por:

```ts
		expect(rows).toEqual([
			{ supplierId: 's1', name: 'Noronha Pescados', qty: 100, cost: 200, partial: false, costKnown: true },
			{ supplierId: 's2', name: 'Atlântico Sul', qty: 40, cost: 120, partial: false, costKnown: true },
		]);
```

(b) No teste `'conta a quantidade mesmo sem custo na linha'`, trocar o `expect` por:

```ts
		expect(rows[0]).toMatchObject({ qty: 100, cost: 0, costKnown: false });
```

e acrescentar à linha `mata:` desse teste: `; e marcar costKnown=true sem nenhuma linha com custo`.

(c) No teste `'marca o total como parcial quando alguma linha do fornecedor não tem custo'`, trocar o `expect` por:

```ts
		expect(rows[0]).toMatchObject({ qty: 140, cost: 200, partial: true, costKnown: true });
```

(d) Adicionar ao final do describe:

```ts
	it('marca costKnown=true quando a linha tem custo zero registrado', () => {
		// mata: derivar costKnown de `cost !== 0` — o critério que a tela usava
		// e que escondia um custo zero real
		const rows = buildReceivedBySupplier({
			receipts: [receipt('r1', 's1', '2026-09-01T00:00:00.000Z')],
			receiptItems: [{ ...rItem('r1', 'BRINDE-1', 10), unitCost: 0 }],
			suppliers: base.suppliers,
			window: W,
		});
		expect(rows[0]).toMatchObject({ qty: 10, cost: 0, partial: false, costKnown: true });
	});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/utils/sampleCost.test.ts src/utils/receivedVsSold.test.ts`
Expected: FAIL nos testes que esperam `costKnown` (o campo não existe ainda).

- [ ] **Step 4: Implementar em `src/utils/sampleCost.ts`**

Tipo:

```ts
export type SampleContactRow = {
	key: string; name: string; qty: number; cost: number; partial: boolean;
	/** true se ao menos uma amostra do contato tinha custo conhecido (mesmo
	 * que zero). false = nenhum custo conhecido: a tela não mostra valor. */
	costKnown: boolean;
};
```

No laço de `summarizeSamples`, o objeto inicial da linha e a marcação:

```ts
			const row = rows.get(key) ?? {
				key, name: nameByKey.get(key) ?? '—', qty: 0, cost: 0, partial: false, costKnown: false,
			};
			row.qty += sample.qty;
			row.cost += lineCost;
			if (unit === undefined) row.partial = true;
			else row.costKnown = true;
			rows.set(key, row);
```

- [ ] **Step 5: Implementar em `src/utils/receivedVsSold.ts`**

Tipo (acrescentar o campo ao fim do `SupplierReceivedRow`, mantendo o comentário de `partial`):

```ts
	partial: boolean;
	/** true se ao menos uma linha do fornecedor, na janela, tinha custo
	 * (mesmo que zero). false = nenhum custo conhecido: a tela não mostra
	 * valor. Nunca derivar de `cost !== 0`. */
	costKnown: boolean;
};
```

Em `buildReceivedBySupplier`, o objeto inicial ganha `costKnown: false`, e o ramo de custo:

```ts
		const row = acc.get(receipt.supplierId) ?? {
			supplierId: receipt.supplierId,
			name: nameById.get(receipt.supplierId) ?? '—',
			qty: 0,
			cost: 0,
			partial: false,
			costKnown: false,
		};
		row.qty += item.qty;
		// Linha sem custo entra na quantidade e não no valor: ausente não é zero,
		// mas também não invalida o que já se sabe do fornecedor. Marca o total
		// como parcial em vez de deixá-lo com cara de fato completo.
		if (item.unitCost !== null && item.unitCost !== undefined) {
			row.cost += item.unitCost * item.qty;
			row.costKnown = true;
		} else row.partial = true;
```

- [ ] **Step 6: Atualizar os literais de `src/components/field/PanelView.test.tsx`**

Sem mudar asserção nenhuma — só para o `tsc -b` aceitar o campo novo obrigatório:
- no teste `'marca a linha por contato como parcial quando SampleContactRow.partial é true'`, o literal vira `{ key: 'client:c1', name: 'Popeye Seafood', qty: 5, cost: 10, partial: true, costKnown: true }`;
- no teste `'marca o total de "Recebido por fornecedor" como parcial quando SupplierReceivedRow.partial é true'`, o literal vira `{ supplierId: 's1', name: 'Noronha Pescados', qty: 140, cost: 200, partial: true, costKnown: true }`.

- [ ] **Step 7: Rodar suíte e typecheck**

Run: `npm test && npx tsc -b`
Expected: todos verdes (314 + 3 novos = 317); `tsc -b` sem saída. O `PanelView` ainda não lê `costKnown` — isso é a Task 3.

- [ ] **Step 8: Commit**

```bash
git add src/utils/sampleCost.ts src/utils/sampleCost.test.ts src/utils/receivedVsSold.ts src/utils/receivedVsSold.test.ts src/components/field/PanelView.test.tsx
git commit -m "feat(painel): costKnown distingue custo desconhecido de custo zero (BUG-21 / WAR-14)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: BUG-21 (tela) — uma regra de exibição para os três blocos com US$

**Files:**
- Modify: `src/components/field/PanelView.tsx` (KPI "Amostras entregues", linhas de "Amostras entregues" por contato, linhas de "Recebido por fornecedor")
- Modify: `src/components/field/PanelView.test.tsx`
- Modify: `docs/bugs.md` (entrada BUG-21)

**Interfaces:**
- Consumes (Task 2): `SampleContactRow.costKnown: boolean`, `SupplierReceivedRow.costKnown: boolean`; `SampleSummary.skusTotal`, `SampleSummary.skusWithoutCost` (já existiam).

Tabela-alvo (da spec):

| Bloco | Nada conhecido | Parcial | Tudo conhecido |
|---|---|---|---|
| KPI | `22 un` + `custo desconhecido` | `~US$ X (est., parcial)` | `~US$ X (est.)` |
| Por contato | `6 un` | `6 un · US$ X (parcial)` | `6 un · US$ X` |
| Por fornecedor | `40 un` | `40 un · US$ X (parcial)` | `40 un · US$ X` |

KPI com `totalQty === 0`: nenhuma linha de valor (nem `custo desconhecido`).

- [ ] **Step 1: Testes que falham em `src/components/field/PanelView.test.tsx`**

(a) Substituir o teste `'marca o valor estimado do KPI de amostras como parcial quando há SKU sem custo'` inteiro por:

```tsx
	it('marca o valor estimado do KPI de amostras como parcial quando a cobertura é parcial', () => {
		// mata: omitir o valor sempre que `skusWithoutCost > 0` — com algum custo
		// conhecido, o valor existe e deve aparecer, marcado como parcial
		render(<PanelView {...base} samples={{ totalQty: 5, cost: 10, skusTotal: 2, skusWithoutCost: 1, byContact: [] }} />);
		expect(screen.getByText(/\(est\., parcial\)/i)).toBeInTheDocument();
	});
```

(b) Adicionar ao final do describe:

```tsx
	it('diz "custo desconhecido" no KPI quando nenhum SKU de amostra tem custo', () => {
		// mata: o comportamento do BUG-21 — "~US$ 0,00 (est., parcial)" dava a um
		// desconhecido a aparência de um fato medido
		render(<PanelView {...base} samples={{ totalQty: 22, cost: 0, skusTotal: 4, skusWithoutCost: 4, byContact: [] }} />);
		expect(screen.getByText('custo desconhecido')).toBeInTheDocument();
		expect(screen.queryAllByText(/US\$/)).toHaveLength(0);
	});

	it('mostra só a quantidade na linha de contato sem custo conhecido', () => {
		// mata: mostrar o valor sempre que a linha existe ("6 un · US$ 0,00 (parcial)")
		render(
			<PanelView
				{...base}
				samples={{
					totalQty: 6,
					cost: 0,
					skusTotal: 1,
					skusWithoutCost: 1,
					byContact: [{ key: 'client:c1', name: 'Popeye Seafood', qty: 6, cost: 0, partial: true, costKnown: false }],
				}}
			/>,
		);
		const line = screen.getByText('Popeye Seafood').closest('div');
		expect(line).toHaveTextContent('6 un');
		expect(line).not.toHaveTextContent(/US\$/);
	});

	it('mostra US$ 0,00 no fornecedor quando o custo conhecido é zero', () => {
		// mata: manter o critério antigo da tela, `cost !== 0`, que escondia um
		// custo zero registrado como se fosse desconhecido
		render(
			<PanelView
				{...base}
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 10, cost: 0, partial: false, costKnown: true }]}
			/>,
		);
		expect(screen.getByText('Noronha Pescados').closest('div')).toHaveTextContent(/US\$\s0,00/);
	});

	it('mostra só a quantidade no fornecedor sem custo conhecido', () => {
		// mata: exibir "US$ 0,00" para fornecedor cujas linhas não têm custo
		render(
			<PanelView
				{...base}
				bySupplier={[{ supplierId: 's1', name: 'Noronha Pescados', qty: 40, cost: 0, partial: true, costKnown: false }]}
			/>,
		);
		const line = screen.getByText('Noronha Pescados').closest('div');
		expect(line).toHaveTextContent('40 un');
		expect(line).not.toHaveTextContent(/US\$/);
	});
```

(c) No teste `'não mostra valor estimado de amostras quando não houve amostra nenhuma'`, acrescentar depois do `expect` existente:

```tsx
		// mata também: mostrar "custo desconhecido" quando não há amostra (vazio
		// não é desconhecido — não há custo nenhum a estimar)
		expect(screen.queryByText('custo desconhecido')).not.toBeInTheDocument();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/field/PanelView.test.tsx`
Expected: FAIL em `'diz "custo desconhecido"…'`, `'mostra só a quantidade na linha de contato…'` e `'mostra US$ 0,00 no fornecedor…'`. O teste `'mostra só a quantidade no fornecedor sem custo conhecido'` **passa já** (o `cost !== 0` antigo acerta esse caso por acidente — é o par positivo do teste de custo zero).

- [ ] **Step 3: Implementar no KPI de `src/components/field/PanelView.tsx`**

Substituir o comentário e o bloco `{samples.totalQty > 0 && (...)}` do card "Amostras entregues" por:

```tsx
				{/* Vazio não é zero: sem nenhuma amostra no período, não há valor a
				    estimar. Com amostra e NENHUM SKU com custo, o valor é
				    desconhecido — nunca "US$ 0,00" (BUG-21). Com cobertura parcial,
				    o valor aparece marcado como parcial. */}
				{samples.totalQty > 0 && (
					<p className="mt-1 text-xs text-muted-foreground">
						{samples.skusWithoutCost === samples.skusTotal
							? 'custo desconhecido'
							: `~${money.format(samples.cost)} (est.${samples.skusWithoutCost > 0 ? ', parcial' : ''})`}
					</p>
				)}
```

- [ ] **Step 4: Implementar nas linhas por contato**

No bloco "Amostras entregues", substituir o `<span className="text-sm text-muted-foreground">…</span>` de cada linha por:

```tsx
						<span className="text-sm text-muted-foreground">
							{row.qty} un
							{row.costKnown ? ` · ${money.format(row.cost)}${row.partial ? ' (parcial)' : ''}` : ''}
						</span>
```

- [ ] **Step 5: Implementar nas linhas por fornecedor**

No bloco "Recebido por fornecedor", substituir o `<span className="text-sm text-muted-foreground">…</span>` de cada linha por:

```tsx
						<span className="text-sm text-muted-foreground">
							{row.qty} un
							{row.costKnown ? ` · ${money.format(row.cost)}${row.partial ? ' (parcial)' : ''}` : ''}
						</span>
```

- [ ] **Step 6: Rodar suíte e typecheck**

Run: `npm test && npx tsc -b`
Expected: todos verdes (317 + 4 novos = 321); `tsc -b` sem saída.

- [ ] **Step 7: Marcar o BUG-21 como resolvido em `docs/bugs.md`**

Trocar o título:

```
## 2026-09-09 — BUG-21: cobertura de custo zero vira "US$ 0,00 (parcial)"
```

por:

```
## 2026-09-09 — BUG-21: cobertura de custo zero vira "US$ 0,00 (parcial)" (RESOLVIDO — PR #66)

> **Resolvido** em PR #66 com uma regra só para os três blocos que mostram US$ (KPI de
> amostras, amostras por contato, recebido por fornecedor): o valor só aparece se ao
> menos uma linha do agregado tem custo conhecido. O KPI sem custo conhecido diz "custo
> desconhecido"; as linhas mostram só a quantidade. Diferente do que esta entrada
> previa, não bastou apresentação: `SampleContactRow` e `SupplierReceivedRow` ganharam
> `costKnown`, porque `cost === 0 && partial` não distinguia "nada conhecido" de "custo
> conhecido que soma zero". O fornecedor, que escondia o valor por `cost !== 0`, agora
> mostra um custo zero registrado.
```

- [ ] **Step 8: Commit**

```bash
git add src/components/field/PanelView.tsx src/components/field/PanelView.test.tsx docs/bugs.md
git commit -m "fix(painel): custo desconhecido nunca aparece como US\$ 0,00 (BUG-21 / WAR-14)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: BUG-9 — texto neutro no set-password

**Files:**
- Modify: `src/components/SetPassword.tsx:56-57`
- Create: `src/components/SetPassword.test.tsx`
- Modify: `docs/bugs.md` (entrada BUG-9)

**Interfaces:** nenhuma com as outras tasks.

- [ ] **Step 1: Escrever o teste que falha em `src/components/SetPassword.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({
	supabase: { auth: { updateUser: vi.fn() } },
}));

const { default: SetPassword } = await import('./SetPassword');

describe('SetPassword', () => {
	it.each([
		['convite', '/set-password?invite_token=abc'],
		['recuperação', '/set-password'],
	])('usa texto neutro no fluxo de %s', (_flow, url) => {
		// mata: o texto antigo, "concluir a recuperação", que o convidado lia
		// numa conta que nunca teve senha (BUG-9). O convite sem invite_token
		// chega em /set-password igual à recuperação, então o texto tem de
		// servir aos dois.
		render(
			<MemoryRouter initialEntries={[url]}>
				<SetPassword />
			</MemoryRouter>,
		);
		expect(screen.getByRole('heading', { name: 'Definir senha' })).toBeInTheDocument();
		expect(screen.getByText('Defina sua senha para acessar sua conta.')).toBeInTheDocument();
		expect(screen.queryByText(/recuperação/i)).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/SetPassword.test.tsx`
Expected: FAIL nos dois casos (heading `Definir senha` não encontrado).

- [ ] **Step 3: Trocar o texto em `src/components/SetPassword.tsx`**

```tsx
					<h1 className="text-xl font-semibold tracking-tight">Definir senha</h1>
					<p className="text-sm text-muted-foreground">Defina sua senha para acessar sua conta.</p>
```

Os rótulos "Nova senha", "Confirmar nova senha" e o botão "Salvar nova senha" ficam como estão.

- [ ] **Step 4: Rodar suíte e typecheck**

Run: `npm test && npx tsc -b`
Expected: todos verdes (321 + 2 = 323); `tsc -b` sem saída.

- [ ] **Step 5: Marcar o BUG-9 como resolvido em `docs/bugs.md`**

Trocar o título:

```
### BUG-9 — Copy do set-password fala em "recuperação" também no fluxo de convite
```

por:

```
### BUG-9 — Copy do set-password fala em "recuperação" também no fluxo de convite (RESOLVIDO — PR #66)

> **Resolvido** em PR #66 com texto neutro: título "Definir senha" e "Defina sua senha
> para acessar sua conta.". Não condicional por fluxo: o convite sem `invite_token` chega
> em `/set-password` igual à recuperação (`buildSetPasswordTarget` no `App.tsx`), e
> distinguir exigiria um sinal novo na rota para trocar uma frase.
```

- [ ] **Step 6: Commit**

```bash
git add src/components/SetPassword.tsx src/components/SetPassword.test.tsx docs/bugs.md
git commit -m "fix(auth): texto neutro no set-password, serve a convite e recuperação (BUG-9 / WAR-18)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
