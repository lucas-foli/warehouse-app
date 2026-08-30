# Campo fatia 2 — entrada de mercadoria: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `products.qty` subir por um evento registrado — o recebimento de um lote do fornecedor — e fechar a edição direta do saldo.

**Architecture:** Duas migrations (tabelas `receipts` + `receipt_items` com RLS; RPC `register_receipt` transacional), lógica pura de carrinho em `utils/receiptCart.ts` (testável sem banco), `services/receiptService.ts` falando com o Supabase, modal `ReceiptModal` espelhando o `SaleOrderModal`, `qty` só-leitura na edição de produto, e `Produtos` entrando na barra de tabs no lugar de `Dashboard`.

**Tech Stack:** React 19 + TS, Tailwind com tokens `hsl(var(--*))`, Supabase (Postgres + RLS + RPC plpgsql), vitest, react-router-dom.

**Spec:** `docs/superpowers/specs/2026-08-30-campo-fatia2-design.md`
**Mockup:** `docs/superpowers/specs/2026-08-30-campo-fatia2-preview.html`

## Global Constraints

- **Gate de typecheck: `npx tsc -b`** — nunca `tsc --noEmit` (o tsconfig raiz tem `files: []` e não checa nada).
- **Rodar testes com `npx vitest run --dir src --exclude '**/.claude/**'`** — `npm test` puro varre as worktrees vivas e reprova por branch alheia (BUG-19, `docs/bugs.md:279`).
- **Moeda: USD.** Todo custo é digitado e guardado em US$. Não existe conversão, taxa de câmbio nem outra moeda nesta fatia.
- **`unit_cost` nullable, ausente ≠ zero.** Linha sem custo ⇒ total do lote `null`, nunca `0`.
- **Nenhuma coluna de custo em `products`, nenhuma margem calculada ou exibida.** O método de custeio segue em aberto de propósito.
- **Gate da RPC: `is_tenant_admin`** (como `register_sale_order`), não `is_tenant_member`.
- **Produto criado pelo recebimento: `location = ''` explícito** — nunca deixar o default `'Brasília Shopping'` da tabela agir. `status` é omitido (herda `'ESTOQUE'`, que está correto).
- **Tipos TS vão em `src/types/index.ts`**, à mão. `src/types/database.ts` é um arquivo gerado desatualizado — a fatia 1 não o tocou e esta também não toca.
- **Exceções nomeadas na RPC**, traduzidas para pt-BR na camada de serviço (padrão de `salesService.ts` e `fieldService.ts`).
- Commits pequenos, um por task, mensagem em pt-BR, com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Migration — tabelas `receipts` e `receipt_items`

**Files:**
- Create: `supabase/migrations/20260830000100_receipts.sql`
- Modify: `src/types/index.ts` (append no fim)

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `public.receipts` e `public.receipt_items`; tipos TS `Receipt` e `ReceiptItem` em `src/types/index.ts`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260830000100_receipts.sql`:

```sql
-- Campo fatia 2 (1/2): recebimento de mercadoria. Espelha a forma de
-- sales_orders / sales_items — cabeçalho + N linhas — porque a entrada é um
-- lote do fornecedor, não um item avulso.
-- unit_cost é NULLABLE de propósito: ausente ≠ zero (mesmo padrão de price).
-- Nenhuma coluna de custo entra em products: o método de custeio (média /
-- último / FIFO) fica em aberto e é reconstruível a partir destas linhas.

create table if not exists public.receipts (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	receipt_number text not null,
	supplier_id uuid not null references public.suppliers (id),
	received_at timestamptz not null default now(),
	document text,
	note text,
	total_cost numeric,
	created_by uuid,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists receipts_tenant_number_uidx
	on public.receipts (tenant_id, receipt_number);
create index if not exists receipts_tenant_idx on public.receipts (tenant_id);
create index if not exists receipts_tenant_supplier_idx
	on public.receipts (tenant_id, supplier_id);

create table if not exists public.receipt_items (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	receipt_id uuid not null references public.receipts (id) on delete cascade,
	receipt_number text not null,
	product_id uuid references public.products (id),
	sku text not null,
	qty integer not null check (qty > 0),
	unit_cost numeric,
	total_cost numeric,
	created_at timestamptz not null default now()
);

create unique index if not exists receipt_items_receipt_sku_uidx
	on public.receipt_items (tenant_id, receipt_id, sku);
create index if not exists receipt_items_tenant_receipt_idx
	on public.receipt_items (tenant_id, receipt_id);
create index if not exists receipt_items_tenant_sku_idx
	on public.receipt_items (tenant_id, sku);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

-- Leitura para qualquer membro; escrita SÓ pela RPC security definer
-- (nenhuma policy de insert/update/delete direto, de propósito).
drop policy if exists "Tenant members can read receipts" on public.receipts;
create policy "Tenant members can read receipts"
on public.receipts
for select
using (public.is_tenant_member(receipts.tenant_id));

drop policy if exists "Tenant members can read receipt items" on public.receipt_items;
create policy "Tenant members can read receipt items"
on public.receipt_items
for select
using (public.is_tenant_member(receipt_items.tenant_id));
```

- [ ] **Step 2: Adicionar os tipos TS**

No fim de `src/types/index.ts`, acrescentar:

```ts
export interface Receipt {
	id: string;
	tenant_id: string;
	receipt_number: string;
	supplier_id: string;
	received_at: string;
	document: string | null;
	note: string | null;
	total_cost: number | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface ReceiptItem {
	id: string;
	tenant_id: string;
	receipt_id: string;
	receipt_number: string;
	product_id: string | null;
	sku: string;
	qty: number;
	unit_cost: number | null;
	total_cost: number | null;
	created_at: string;
}
```

- [ ] **Step 3: Verificar que o typecheck passa**

Run: `npx tsc -b`
Expected: sem erro (tipos novos ainda não são usados; isso é esperado).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830000100_receipts.sql src/types/index.ts
git commit -m "feat(campo): tabelas receipts e receipt_items"
```

---

### Task 2: Migration — RPC `register_receipt`

**Files:**
- Create: `supabase/migrations/20260830000200_register_receipt.sql`

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces: `public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text) returns public.receipts`. Exceções nomeadas exatas, que a Task 4 traduz: `not_authenticated`, `not_authorized`, `receipt_supplier_required`, `receipt_items_required`, `receipt_qty_invalid`, `receipt_cost_invalid`, `receipt_sku_required`, `receipt_product_name_required`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260830000200_register_receipt.sql`:

```sql
-- Campo fatia 2 (2/2): recebimento transacional. Um receipts + N receipt_items
-- e o crédito de estoque por linha, tudo ou nada. Espelha o gate admin e a
-- numeração do register_sale_order (V-NNNN aqui vira R-NNNN).
-- SKU desconhecido CRIA o produto (decisão de spec: o recebimento é também
-- porta de cadastro); SKU desativado é REATIVADO.

create or replace function public.register_receipt(
	p_tenant_id uuid,
	p_supplier_id uuid,
	p_items jsonb,                          -- [{ "sku": "...", "qty": 10, "unit_cost": 4.5, "name": "..." }, ...]
	p_received_at timestamptz default now(),
	p_document text default null,
	p_note text default null
)
returns public.receipts
language plpgsql
security definer
set search_path = public
as $$
declare
	v_next bigint;
	v_receipt_number text;
	v_receipt_id uuid;
	v_total numeric := 0;
	v_has_cost boolean := true;
	v_receipt public.receipts%rowtype;
	v_item record;
	v_product_id uuid;
	v_line_total numeric;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if p_supplier_id is null or not exists (
		select 1 from public.suppliers s
		where s.id = p_supplier_id and s.tenant_id = p_tenant_id
	) then
		raise exception using message = 'receipt_supplier_required';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
		raise exception using message = 'receipt_items_required';
	end if;

	-- Valida cada elemento ANTES da agregação, sem cast (NULL-seguro): qty
	-- ausente/não-numérica/decimal/zero/negativa/overflow vira exceção nomeada,
	-- e o sum não mascara item inválido em SKU duplicado. Mesmo padrão do
	-- register_interaction da fatia 1.
	if exists (
		select 1 from jsonb_array_elements(p_items) as elem
		where jsonb_typeof(elem) <> 'object'
			or not (elem ? 'qty')
			or jsonb_typeof(elem->'qty') <> 'number'
			or (elem->>'qty') !~ '^[0-9]+$'
			or length(elem->>'qty') > 9
			or (elem->>'qty') = '0'
	) then
		raise exception using message = 'receipt_qty_invalid';
	end if;

	if exists (
		select 1 from jsonb_array_elements(p_items) as elem
		where (elem ? 'unit_cost')
			and jsonb_typeof(elem->'unit_cost') = 'number'
			and (elem->>'unit_cost')::numeric < 0
	) then
		raise exception using message = 'receipt_cost_invalid';
	end if;

	-- Serializa a numeração para este tenant (mesma mecânica do register_sale_order).
	perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

	select coalesce(max(nullif(regexp_replace(receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1
	into v_next
	from public.receipts
	where tenant_id = p_tenant_id and receipt_number like 'R-%';

	v_receipt_number := 'R-' || lpad(v_next::text, 4, '0');

	insert into public.receipts (
		tenant_id, receipt_number, supplier_id, received_at, document, note, total_cost, created_by
	)
	values (
		p_tenant_id, v_receipt_number, p_supplier_id, coalesce(p_received_at, now()),
		nullif(trim(p_document), ''), nullif(trim(p_note), ''), null, auth.uid()
	)
	returning id into v_receipt_id;

	-- Merge de SKUs duplicados: soma qty; último unit_cost não-nulo vence;
	-- primeiro name não-vazio vence. Igual ao merge da venda, para o índice
	-- único (tenant_id, receipt_id, sku) não trincar.
	for v_item in
		with raw as (
			select
				upper(trim(elem->>'sku')) as sku,
				(elem->>'qty')::int as qty,
				nullif(elem->>'unit_cost', '')::numeric as unit_cost,
				nullif(trim(elem->>'name'), '') as name,
				ord
			from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
		),
		merged as (
			select
				r.sku,
				sum(r.qty) as qty,
				(select r2.unit_cost from raw r2
				 where r2.sku = r.sku and r2.unit_cost is not null
				 order by r2.ord desc limit 1) as unit_cost,
				(select r3.name from raw r3
				 where r3.sku = r.sku and r3.name is not null
				 order by r3.ord asc limit 1) as name
			from raw r
			group by r.sku
		)
		select * from merged
	loop
		if v_item.sku is null or v_item.sku = '' then
			raise exception using message = 'receipt_sku_required';
		end if;

		select p.id into v_product_id
		from public.products p
		where p.tenant_id = p_tenant_id and upper(trim(p.sku)) = v_item.sku
		limit 1;

		if v_product_id is null then
			-- Produto novo: o recebimento é porta de cadastro. price fica NULL
			-- (o fornecedor não define preço de venda) e location vai VAZIO de
			-- propósito — o default da tabela é 'Brasília Shopping' e plantaria
			-- uma loja que ninguém escolheu.
			if v_item.name is null then
				raise exception using message = 'receipt_product_name_required';
			end if;

			insert into public.products (tenant_id, sku, name, qty, price, location, is_active)
			values (p_tenant_id, v_item.sku, v_item.name, v_item.qty, null, '', true)
			returning id into v_product_id;
		else
			-- Produto existente: soma o saldo e reativa se estiver desativado.
			update public.products
			set qty = qty + v_item.qty,
				is_active = true,
				updated_at = now()
			where id = v_product_id;
		end if;

		v_line_total := case when v_item.unit_cost is null
			then null else round(v_item.unit_cost * v_item.qty, 2) end;

		insert into public.receipt_items (
			tenant_id, receipt_id, receipt_number, product_id, sku, qty, unit_cost, total_cost
		)
		values (
			p_tenant_id, v_receipt_id, v_receipt_number, v_product_id,
			v_item.sku, v_item.qty, v_item.unit_cost, v_line_total
		);

		if v_item.unit_cost is null then
			v_has_cost := false;
		else
			v_total := v_total + v_line_total;
		end if;
	end loop;

	update public.receipts
	set total_cost = case when v_has_cost then v_total else null end,
		updated_at = now()
	where id = v_receipt_id
	returning * into v_receipt;

	return v_receipt;
end;
$$;

revoke all on function public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text) from public;
grant execute on function public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text) to authenticated;
```

- [ ] **Step 2: Conferir a paridade com a venda**

Reler `supabase/migrations/20260603000000_register_sale_order.sql` lado a lado e confirmar, item a item: gate admin, advisory lock, numeração com `lpad(...,4,'0')`, merge por `with ordinality`, e o total nulo quando falta custo. Qualquer divergência que não esteja justificada por comentário na migration nova é bug.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260830000200_register_receipt.sql
git commit -m "feat(campo): RPC register_receipt (lote + crédito de estoque)"
```

---

### Task 3: Lógica pura do carrinho de recebimento

**Files:**
- Create: `src/utils/receiptCart.ts`
- Test: `src/utils/receiptCart.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem Supabase).
- Produces: `type ReceiptLine = { sku: string; qty: number; unitCost: number | null; name: string }`; `mergeReceiptLines(lines: ReceiptLine[]): ReceiptLine[]`; `receiptTotal(lines: ReceiptLine[]): number | null`; `linesNeedingName(lines: ReceiptLine[], knownSkus: Set<string>): string[]`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/utils/receiptCart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { linesNeedingName, mergeReceiptLines, receiptTotal, type ReceiptLine } from './receiptCart';

const line = (over: Partial<ReceiptLine> = {}): ReceiptLine => ({
	sku: 'POP-401', qty: 1, unitCost: null, name: '', ...over,
});

describe('mergeReceiptLines', () => {
	it('soma a qty de SKUs repetidos e normaliza o código', () => {
		// mata: trocar a soma por max/primeiro, ou parar de normalizar (trim+upper)
		expect(mergeReceiptLines([
			line({ sku: 'pop-401', qty: 10 }),
			line({ sku: ' POP-401 ', qty: 5 }),
		])).toEqual([line({ sku: 'POP-401', qty: 15 })]);
	});

	it('preserva o ÚLTIMO custo não-nulo do SKU', () => {
		// mata: pegar o primeiro custo, ou deixar o null sobrescrever o valor
		const [merged] = mergeReceiptLines([
			line({ qty: 1, unitCost: 4 }),
			line({ qty: 1, unitCost: 5 }),
			line({ qty: 1, unitCost: null }),
		]);
		expect(merged.unitCost).toBe(5);
	});

	it('preserva o PRIMEIRO nome não-vazio do SKU', () => {
		// mata: último nome vencer (o usuário digitou o nome na 1a ocorrência)
		const [merged] = mergeReceiptLines([
			line({ qty: 1, name: 'Camarão rosa 500g' }),
			line({ qty: 1, name: '' }),
		]);
		expect(merged.name).toBe('Camarão rosa 500g');
	});

	it('mantém a ordem da primeira aparição de cada SKU', () => {
		// mata: ordenar alfabeticamente ou usar a ordem do Map de saída
		expect(mergeReceiptLines([
			line({ sku: 'B', qty: 1 }), line({ sku: 'A', qty: 1 }), line({ sku: 'B', qty: 1 }),
		]).map((l) => l.sku)).toEqual(['B', 'A']);
	});

	it('descarta linha sem SKU ou com qty inválida', () => {
		// mata: remover a validação e deixar lixo chegar na RPC
		expect(mergeReceiptLines([
			line({ sku: '   ', qty: 5 }),
			line({ qty: 0 }),
			line({ qty: -3 }),
			line({ qty: 1.5 }),
		])).toEqual([]);
	});
});

describe('receiptTotal', () => {
	it('soma qty x custo de cada linha', () => {
		// mata: somar só o custo unitário, ignorando a quantidade
		expect(receiptTotal([
			line({ sku: 'A', qty: 100, unitCost: 4.5 }),
			line({ sku: 'B', qty: 40, unitCost: 7.2 }),
		])).toBe(738);
	});

	it('devolve null (não 0) se qualquer linha estiver sem custo', () => {
		// mata: coalesce(custo, 0) — ausente vira zero e o total mente
		expect(receiptTotal([
			line({ sku: 'A', qty: 10, unitCost: 4.5 }),
			line({ sku: 'B', qty: 10, unitCost: null }),
		])).toBeNull();
	});

	it('trata custo 0 como custo real, não como ausente', () => {
		// mata: testar falsy (!custo) em vez de === null — brinde tem custo 0
		expect(receiptTotal([line({ qty: 10, unitCost: 0 })])).toBe(0);
	});

	it('devolve null para carrinho vazio', () => {
		// mata: devolver 0 e exibir "US$ 0,00" num lote sem itens
		expect(receiptTotal([])).toBeNull();
	});
});

describe('linesNeedingName', () => {
	it('aponta o SKU desconhecido que ainda está sem nome', () => {
		// mata: parar de exigir nome — a RPC responderia receipt_product_name_required
		expect(linesNeedingName(
			[line({ sku: 'POP-922', qty: 40, name: '' })],
			new Set(['POP-401']),
		)).toEqual(['POP-922']);
	});

	it('não cobra nome de SKU que já existe no catálogo', () => {
		// mata: exigir nome de todo mundo, travando o lote normal
		expect(linesNeedingName(
			[line({ sku: 'POP-401', qty: 10, name: '' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});

	it('não cobra nome de SKU novo que já foi nomeado', () => {
		// mata: ignorar o nome preenchido e bloquear o salvamento para sempre
		expect(linesNeedingName(
			[line({ sku: 'POP-922', qty: 40, name: 'Camarão rosa 500g' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});

	it('compara SKU normalizado contra o catálogo', () => {
		// mata: comparar cru — 'pop-401' seria tratado como produto novo
		expect(linesNeedingName(
			[line({ sku: ' pop-401 ', qty: 10, name: '' })],
			new Set(['POP-401']),
		)).toEqual([]);
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/utils/receiptCart.test.ts`
Expected: FAIL — `Failed to resolve import "./receiptCart"`.

- [ ] **Step 3: Implementar**

Criar `src/utils/receiptCart.ts`:

```ts
export type ReceiptLine = { sku: string; qty: number; unitCost: number | null; name: string };

const normalizeSku = (sku: string) => sku.trim().toUpperCase();

/**
 * Junta as linhas do lote para que cada SKU apareça uma vez, somando as
 * quantidades. Normaliza o SKU (trim + upper) para casar com o índice único
 * (tenant_id, receipt_id, sku) que a RPC impõe. O último custo não-nulo do SKU
 * vence (o usuário corrigiu o valor); o primeiro nome não-vazio vence (foi onde
 * ele digitou). SKUs distintos mantêm a ordem da primeira aparição.
 */
export const mergeReceiptLines = (lines: ReceiptLine[]): ReceiptLine[] => {
	const order: string[] = [];
	const byKey = new Map<string, ReceiptLine>();
	for (const l of lines) {
		const sku = normalizeSku(l.sku);
		if (!sku) continue;
		if (!Number.isInteger(l.qty) || l.qty <= 0) continue;
		const existing = byKey.get(sku);
		if (existing) {
			existing.qty += l.qty;
			if (l.unitCost !== null) existing.unitCost = l.unitCost;
			if (!existing.name && l.name.trim()) existing.name = l.name.trim();
		} else {
			order.push(sku);
			byKey.set(sku, { sku, qty: l.qty, unitCost: l.unitCost, name: l.name.trim() });
		}
	}
	return order.map((k) => byKey.get(k)!);
};

/**
 * Custo total do lote, ou `null` quando qualquer linha veio sem custo — ausente
 * não é zero (mesmo contrato de `price`). Um custo 0 explícito é custo real
 * (brinde) e entra na soma normalmente.
 */
export const receiptTotal = (lines: ReceiptLine[]): number | null => {
	if (lines.length === 0) return null;
	if (lines.some((l) => l.unitCost === null)) return null;
	return Number(lines.reduce((acc, l) => acc + l.unitCost! * l.qty, 0).toFixed(2));
};

/**
 * SKUs que a RPC vai CRIAR como produto novo e ainda estão sem nome. A UI usa
 * isso para exigir o nome na própria linha, em vez de deixar a RPC responder
 * `receipt_product_name_required` depois do envio.
 */
export const linesNeedingName = (lines: ReceiptLine[], knownSkus: Set<string>): string[] =>
	mergeReceiptLines(lines)
		.filter((l) => !knownSkus.has(l.sku) && !l.name)
		.map((l) => l.sku);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/utils/receiptCart.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/receiptCart.ts src/utils/receiptCart.test.ts
git commit -m "feat(campo): lógica pura do carrinho de recebimento"
```

---

### Task 4: `receiptService` — chamada da RPC e tradução de erros

**Files:**
- Create: `src/services/receiptService.ts`
- Test: `src/services/receiptService.test.ts`

**Interfaces:**
- Consumes: `ReceiptLine`, `mergeReceiptLines` da Task 3; a RPC da Task 2; o tipo `Receipt` da Task 1.
- Produces: `registerReceipt(input: RegisterReceiptInput): Promise<Receipt>` com `RegisterReceiptInput = { tenantId: string; supplierId: string; items: ReceiptLine[]; receivedAt?: string; document?: string | null; note?: string | null }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/services/receiptService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { registerReceipt } = await import('./receiptService');

const baseInput = {
	tenantId: 't1',
	supplierId: 's1',
	items: [{ sku: 'pop-401', qty: 10, unitCost: 4.5, name: '' }],
};

describe('registerReceipt', () => {
	beforeEach(() => {
		rpc.mockReset();
		rpc.mockResolvedValue({ data: { id: 'r1', receipt_number: 'R-0001' }, error: null });
	});

	it('envia o payload com os nomes de parâmetro da RPC', async () => {
		// mata: renomear p_* — a RPC rejeitaria a chamada inteira
		await registerReceipt({ ...baseInput, document: 'NF 4471', note: null });
		const [fn, params] = rpc.mock.calls[0];
		expect(fn).toBe('register_receipt');
		expect(params).toMatchObject({
			p_tenant_id: 't1',
			p_supplier_id: 's1',
			p_document: 'NF 4471',
			p_note: null,
		});
	});

	it('normaliza e faz merge dos itens antes de enviar', async () => {
		// mata: mandar as linhas cruas e trincar o índice único (tenant, receipt, sku)
		await registerReceipt({
			...baseInput,
			items: [
				{ sku: 'pop-401', qty: 10, unitCost: 4.5, name: '' },
				{ sku: 'POP-401', qty: 5, unitCost: null, name: '' },
			],
		});
		expect(rpc.mock.calls[0][1].p_items).toEqual([
			{ sku: 'POP-401', qty: 15, unit_cost: 4.5, name: null },
		]);
	});

	it('manda name null quando o nome está vazio', async () => {
		// mata: enviar string vazia — a RPC trata '' e null de formas diferentes
		await registerReceipt(baseInput);
		expect(rpc.mock.calls[0][1].p_items[0].name).toBeNull();
	});

	it('traduz not_authorized para mensagem de permissão', async () => {
		// mata: vazar o erro cru do Postgres na tela do usuário
		rpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(
			'Apenas administradores podem registrar recebimentos.',
		);
	});

	it('traduz receipt_product_name_required', async () => {
		// mata: deixar o código bruto aparecer quando falta o nome do produto novo
		rpc.mockResolvedValue({ data: null, error: { message: 'receipt_product_name_required' } });
		await expect(registerReceipt(baseInput)).rejects.toThrow(
			'Informe o nome do produto novo antes de registrar a entrada.',
		);
	});

	it('devolve a linha criada quando dá certo', async () => {
		// mata: engolir o retorno da RPC (a UI precisa do número do lote)
		await expect(registerReceipt(baseInput)).resolves.toMatchObject({ receipt_number: 'R-0001' });
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/services/receiptService.test.ts`
Expected: FAIL — `Failed to resolve import "./receiptService"`.

- [ ] **Step 3: Implementar**

Criar `src/services/receiptService.ts`:

```ts
import { supabase } from '../lib/supabaseClient';
import type { Receipt } from '../types';
import { mergeReceiptLines, type ReceiptLine } from '../utils/receiptCart';

export type RegisterReceiptInput = {
	tenantId: string;
	supplierId: string;
	items: ReceiptLine[];
	receivedAt?: string;
	document?: string | null;
	note?: string | null;
};

// Espelha as exceções nomeadas de register_receipt
// (20260830000200_register_receipt.sql) em mensagens pt-BR.
const RECEIPT_ERROR_MESSAGES: Record<string, string> = {
	not_authenticated: 'Sua sessão expirou. Entre novamente para registrar a entrada.',
	not_authorized: 'Apenas administradores podem registrar recebimentos.',
	receipt_supplier_required: 'Escolha o fornecedor deste recebimento.',
	receipt_items_required: 'Adicione ao menos um item ao recebimento.',
	receipt_qty_invalid: 'A quantidade recebida deve ser um número inteiro maior que zero.',
	receipt_cost_invalid: 'O custo unitário não pode ser negativo.',
	receipt_sku_required: 'Informe o SKU do produto.',
	receipt_product_name_required: 'Informe o nome do produto novo antes de registrar a entrada.',
};

const friendlyReceiptError = (rawMessage: string): string => {
	for (const [code, message] of Object.entries(RECEIPT_ERROR_MESSAGES)) {
		if (rawMessage.includes(code)) return message;
	}
	return rawMessage || 'Não foi possível registrar a entrada.';
};

/**
 * Registra um recebimento atomicamente (um receipts + N receipt_items + N
 * créditos de estoque) via register_receipt. O merge client-side repete o que a
 * RPC faz server-side: aqui ele existe para o payload já sair sem SKU repetido.
 * Devolve a linha de receipts criada; quem chama recarrega os produtos afetados
 * por conta própria (a RPC devolve o lote, não os produtos).
 */
export async function registerReceipt(input: RegisterReceiptInput): Promise<Receipt> {
	const items = mergeReceiptLines(input.items).map((l) => ({
		sku: l.sku,
		qty: l.qty,
		unit_cost: l.unitCost,
		name: l.name || null,
	}));

	const { data, error } = await supabase.rpc('register_receipt', {
		p_tenant_id: input.tenantId,
		p_supplier_id: input.supplierId,
		p_items: items,
		p_received_at: input.receivedAt ?? new Date().toISOString(),
		p_document: input.document ?? null,
		p_note: input.note ?? null,
	});

	if (error) throw new Error(friendlyReceiptError(error.message));
	if (!data) throw new Error('Não foi possível registrar a entrada.');

	return data as Receipt;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/services/receiptService.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/services/receiptService.ts src/services/receiptService.test.ts
git commit -m "feat(campo): receiptService com tradução das exceções da RPC"
```

---

### Task 5: `ReceiptModal` e o botão na tela de produtos

**Files:**
- Create: `src/components/products/ReceiptModal.tsx`
- Modify: `src/components/ProductsPage.tsx` (import, estado, botão, render do modal)

**Interfaces:**
- Consumes: `registerReceipt` (Task 4); `mergeReceiptLines`, `receiptTotal`, `linesNeedingName`, `ReceiptLine` (Task 3); `Modal` de `../ui/Modal`; `formatCurrency` de `../../utils/currency`; `supabase` para listar `suppliers`.
- Produces: `<ReceiptModal open products tenantId onClose onRegistered />`, onde `onRegistered: (affectedSkus: string[]) => void`.

**Referência obrigatória:** ler `src/components/products/SaleOrderModal.tsx` inteiro antes de escrever. Este modal é o espelho dele — mesma estrutura de estado (lista de linhas + campos de "adicionar item"), mesmas classes Tailwind, mesmo tratamento de erro. Divergir do padrão sem motivo é bug de review.

**Mockup:** telas 2 e 3 de `docs/superpowers/specs/2026-08-30-campo-fatia2-preview.html`.

- [ ] **Step 1: Escrever o modal**

Requisitos exatos (o layout segue o `SaleOrderModal`; o que muda é o conteúdo):

- Cabeçalho: `<select>` de fornecedor (obrigatório, carregado de `suppliers` por `tenant_id`, ordenado por nome com `localeCompare(..., 'pt-BR')`), data (`<input type="date">`, default hoje), documento (texto, opcional), observação (texto, opcional).
- Bloco "adicionar item": campo de SKU, campo de qty (`type="number"`, default `1`), campo de custo unitário (`type="number"`, `step="0.01"`, opcional), e — **só quando o SKU digitado não existe no catálogo** — campo "Nome do produto".
- Lista de linhas: para cada linha, SKU, nome do produto do catálogo, `saldo N` do produto atual, o delta `+qty`, custo unitário, e botão de remover.
- **Aviso de SKU novo** (caixa `bg-emerald-50 border-emerald-200 text-emerald-800`, espelhando o `okbox` do mockup): `POP-922 não existe no cadastro. Vai ser criado agora, com saldo N e sem preço de venda. Confira o código antes de salvar.`
- **Aviso de SKU desativado** (caixa `bg-amber-50 border-amber-200 text-amber-700`): `POP-208 está desativado. Registrar esta entrada reativa o produto e ele volta a aparecer na lista.`
- Rodapé: `Custo do lote` com `formatCurrency(receiptTotal(lines))` — **oculto quando `receiptTotal` devolve `null`**, nunca exibindo `US$ 0,00` para lote sem custo. Botão "Registrar entrada".
- Botão desabilitado quando: sem fornecedor, sem linhas, `linesNeedingName(lines, knownSkus).length > 0`, ou `submitting`.
- No sucesso: chamar `onRegistered(lines.map((l) => l.sku))` e fechar; no erro, exibir a mensagem do serviço no mesmo lugar que o `SaleOrderModal` exibe.

- [ ] **Step 2: Ligar na `ProductsPage`**

Em `src/components/ProductsPage.tsx`, seguindo exatamente o padrão do `SaleOrderModal` (linhas 15, 63, 464, 779-787):

1. `import { ReceiptModal } from './products/ReceiptModal';`
2. `const [receiptModalOpen, setReceiptModalOpen] = useState(false);`
3. Botão "Registrar recebimento" ao lado do que abre o `SaleOrderModal`, com `onClick={() => setReceiptModalOpen(true)}`
4. Render do `<ReceiptModal ... onRegistered={handleOrderRegistered} />` — reusar o handler que já recarrega os SKUs afetados.

- [ ] **Step 3: Verificar typecheck e suíte**

Run: `npx tsc -b && npx vitest run --dir src --exclude '**/.claude/**'`
Expected: typecheck limpo; 221 testes passando (202 do baseline + 13 da Task 3 + 6 da Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/components/products/ReceiptModal.tsx src/components/ProductsPage.tsx
git commit -m "feat(campo): modal de recebimento na tela de produtos"
```

---

### Task 6: Saldo só-leitura na edição de produto

**Files:**
- Modify: `src/components/products/ProductFormModal.tsx:154-165`

**Interfaces:**
- Consumes: a prop `mode: 'create' | 'edit'` que o componente **já recebe** (linha 6).
- Produces: nada novo; o contrato do componente não muda.

- [ ] **Step 1: Trocar o campo de quantidade**

Em `src/components/products/ProductFormModal.tsx`, substituir o bloco do campo "Qtd" (o `<div>` que hoje envolve o `<input type="number" value={draft.qty}>`) por:

```tsx
<div>
	<label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
		Qtd
	</label>
	{mode === 'create' ? (
		<input
			type="number"
			value={draft.qty}
			onChange={(event) => onChange({ qty: event.target.value })}
			className="mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25"
		/>
	) : (
		<>
			<div className="mt-2 flex items-center justify-between rounded-xl border border-input bg-muted px-3 py-2">
				<span className="text-sm font-semibold text-foreground">{draft.qty}</span>
				<span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
					só-leitura
				</span>
			</div>
			<p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
				O saldo muda por recebimento, venda e amostra — não pela edição do cadastro.
			</p>
		</>
	)}
</div>
```

- [ ] **Step 2: Verificar o teste existente do modal**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/components/products/ProductFormModal.test.tsx`
Expected: PASS. Se algum teste existente edita `qty` no modo `edit`, ele estava exercitando o comportamento que esta fatia remove — **mudar esse teste para o modo `create`** e acrescentar:

```tsx
it('não deixa editar o saldo na edição de produto', () => {
	// mata: manter o input editável no modo edit (a porta dos fundos do estoque)
	render(<ProductFormModal {...baseProps} mode="edit" />);
	expect(screen.getByText('só-leitura')).toBeInTheDocument();
});
```

- [ ] **Step 3: Rodar a suíte completa**

Run: `npx tsc -b && npx vitest run --dir src --exclude '**/.claude/**'`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/products/ProductFormModal.tsx src/components/products/ProductFormModal.test.tsx
git commit -m "feat(campo): saldo vira só-leitura na edição de produto"
```

---

### Task 7: `Produtos` na barra de tabs, `Dashboard` na logo

**Files:**
- Modify: `src/components/Dashboard.tsx:351-355` (lista de tabs) e o bloco da logo no `<header>`
- Test: `src/utils/dashboardView.test.ts` (acrescentar caso)

**Interfaces:**
- Consumes: `resolveDashboardView(pathname)` de `src/utils/dashboardView.ts`, que já devolve `{ page, surface }` e **não muda** nesta task.
- Produces: nada novo.

**Cuidado — a armadilha desta task:** `/` e `/products` compartilham `page: 'overview'`; só o `surface` os separa. O destaque da aba hoje é `page === tab.key`, que marcaria "Produtos" como ativa também no Dashboard. O ativo tem que olhar o `surface`.

- [ ] **Step 1: Escrever o teste de proteção**

Acrescentar em `src/utils/dashboardView.test.ts`:

```ts
it('mantém "/" e "/products" na mesma page, separados só pelo surface', () => {
	// mata: unificar as duas rotas (a aba Produtos ficaria ativa no Dashboard também)
	const home = resolveDashboardView('/');
	const products = resolveDashboardView('/products');
	expect(home.page).toBe(products.page);
	expect(home.surface).not.toBe(products.surface);
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npx vitest run --dir src --exclude '**/.claude/**' src/utils/dashboardView.test.ts`
Expected: PASS. Este caso documenta a invariante de que a task depende; se ele falhar depois, o resolver foi alterado e a barra passa a destacar a aba errada.

- [ ] **Step 3: Trocar a lista de tabs**

Em `src/components/Dashboard.tsx`, substituir o array de tabs (hoje começando em `{ key: 'overview', label: 'Dashboard', path: '/' }`) por:

```tsx
[
	{ key: 'produtos', label: 'Produtos', path: '/products' },
	{ key: 'campo', label: 'Campo', path: '/field' },
	{ key: 'clientes', label: 'Clientes', path: '/clients' },
	{ key: 'vendedores', label: 'Vendedores', path: '/sellers' },
	{ key: 'vendas', label: 'Vendas', path: '/sales' },
] as const
```

E, logo antes do `.map` das tabs, calcular a chave ativa:

```tsx
const activeKey = page === 'overview' && surface === 'products' ? 'produtos' : page;
```

usando `activeKey === tab.key` no `className` no lugar de `page === tab.key`. Com isso o Dashboard (`/`, surface `dashboard`) não acende nenhuma aba — correto, ele saiu da barra.

- [ ] **Step 4: Tornar a logo o caminho para o Dashboard**

No `<header>`, envolver a marca/logo num `<button type="button" onClick={() => navigate('/')}>` com `aria-label="Ir para o dashboard"`, preservando o visual atual (nenhuma mudança de estilo além do cursor).

- [ ] **Step 5: Verificar no navegador**

Run: `npm run dev`, abrir `/`, `/products` e `/field`.
Expected: em `/products` a aba "Produtos" está acesa; em `/` nenhuma aba está acesa e o título "Como está a operação hoje?" aparece; clicar na logo de qualquer tela leva para `/`; voltar/avançar do navegador continuam funcionando.

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard.tsx src/utils/dashboardView.test.ts
git commit -m "feat(nav): Produtos na barra de tabs, Dashboard pela logo"
```

---

### Task 8: Runbook de e2e manual e registro do que ficou de fora

**Files:**
- Create: `docs/superpowers/runbooks/2026-08-30-campo-fatia2-e2e.md`
- Modify: `docs/backlog.md` (append)

**Interfaces:**
- Consumes: tudo das tasks 1-7.
- Produces: roteiro de verificação manual que é **gate de merge** desta fatia.

- [ ] **Step 1: Escrever o runbook**

Criar `docs/superpowers/runbooks/2026-08-30-campo-fatia2-e2e.md`. Pré-requisito no topo: **aplicar as duas migrations no Supabase do app** antes de qualquer caso (RPC não aplicada = falha em runtime). Cada caso vira uma seção com passos e resultado esperado, e existe para matar uma mutação específica da RPC — o runbook é a única cobertura que o SQL tem nesta fatia:

1. **Lote de 2 SKUs conhecidos.** Saldo dos dois sobe pelo valor exato; o lote recebe `R-0001`. — mata: `+` virar `-`; só a primeira linha ser atualizada.
2. **Lote com 2ª linha inválida** (SKU novo sem nome). Erro na tela, **nada gravado**: saldo da 1ª linha intacto, nenhuma linha nova em `receipts`. — mata: remover a transação / commitar por linha.
3. **SKU novo com nome.** Produto criado; conferir no cadastro que **preço está vazio** e **local está vazio** (não "Brasília Shopping"). — mata: `price` = 0 ou = custo; deixar o default de `location` agir.
4. **SKU desativado.** Produto volta a aparecer na lista com o saldo somado. — mata: update sem `is_active = true`.
5. **Usuário membro não-admin.** Mensagem "Apenas administradores podem registrar recebimentos."; nada gravado. — mata: gate trocado por `is_tenant_member`.
6. **Dois recebimentos seguidos.** Numeração `R-0001` e depois `R-0002`. — mata: numeração global em vez de por tenant.
7. **Lote com uma linha sem custo.** O rodapé "Custo do lote" **não aparece**; `receipts.total_cost` fica `null` no banco. — mata: `coalesce(custo, 0)`.
8. **Edição de produto.** Campo de quantidade aparece como "só-leitura" e não aceita digitação; criar produto novo continua aceitando quantidade inicial. — mata: manter a porta dos fundos aberta.
9. **Navegação.** Aba "Produtos" acesa em `/products`; nenhuma acesa em `/`; logo leva ao Dashboard; voltar/avançar do navegador funcionam.

- [ ] **Step 2: Registrar as lacunas conhecidas no backlog**

Acrescentar em `docs/backlog.md`:

```markdown
## 2026-08-30 — Infra de teste de banco (RPC sem cobertura automatizada)

**Origem:** fatia 2 do Campo. O repo não tem runner de teste SQL (sem `test:db`,
sem pgTAP), então `register_sale_order`, `register_interaction` e agora
`register_receipt` — as três funções que mexem em saldo de estoque — só são
verificadas por e2e manual. Cada obra reescreve o mesmo roteiro à mão e a
regressão de uma RPC só aparece quando alguém repete o roteiro.

**O que implementar:** runner de teste contra um Postgres efêmero (Supabase local
ou container) que aplique as migrations e exercite as RPCs, com gate de `where`
superuser (sob superuser a RLS não é rede e o teste passa sem provar nada).

**Escopo:** infra de teste. Fatia própria, com spec quando priorizada.

## 2026-08-30 — Estorno e ajuste de recebimento

**Origem:** fatia 2 do Campo. A venda tem `void_sale_order`; o recebimento
nasceu sem equivalente. Lote registrado errado fica registrado, e com o saldo
só-leitura na edição de produto não há caminho no app para corrigir a
divergência entre o físico e o número.

**O que implementar:** estorno de lote (espelho do void) e/ou ajuste de contagem
registrado como movimento, com autor e motivo. Decidir qual dos dois resolve o
caso real antes de especificar.

**Escopo:** feature própria, com brainstorming/spec quando priorizada.

## 2026-08-30 — Tipos de recebimento em snake_case (resolver na fatia 3)

**Origem:** revisão da Task 1 da fatia 2. `Receipt` e `ReceiptItem`
(`src/types/index.ts`) são row shapes do banco exportados como tipo de domínio,
em snake_case, enquanto os tipos do módulo Campo (`FieldContact`, `Interaction`)
são camelCase e o `fieldService` mantém o row snake_case como tipo local privado,
mapeando na fronteira.

**Por que ficou assim:** na fatia 2 o único consumidor é `data as Receipt` no
`receiptService` — nenhum componente lê os campos, porque a tela de listagem de
recebimentos foi cortada. Um mapeamento agora não teria o que mapear.

**Quando resolver:** na **fatia 3** (relatório de campo), junto com o primeiro
consumidor de tela desses tipos — converter para camelCase e mapear na fronteira
do serviço, como o `fieldService` faz. Anotado também no WAR-4.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/runbooks/2026-08-30-campo-fatia2-e2e.md docs/backlog.md
git commit -m "docs(campo): runbook de e2e da fatia 2 + lacunas no backlog"
```

- [ ] **Step 4: Fechar o PR #70 (não mergear)**

O PR #70 (`docs/backlog-tabs-nav`) só registra, no backlog, a avaliação
"Produtos na barra de tabs" — sem decisão e sem código. A Task 7 implementa
justamente essa decisão, então mergear o #70 acrescentaria ao backlog uma
entrada "a avaliar" para algo já feito.

```bash
gh pr close 70 --comment "Decidido e implementado na fatia 2 do Campo (PR #74, Task 7): Produtos entrou na barra de tabs e o Dashboard passou a ser alcançado pela logo. A entrada de backlog registrava a avaliação, que agora tem spec e código — fechando sem merge."
```

---

## Ordem e dependências

Tasks 1 → 2 → 3 → 4 → 5 são uma corrente (cada uma consome a anterior). Tasks 6, 7 e 8 são independentes entre si e podem vir em qualquer ordem depois da 5 — a 7 (navegação) não depende de nada do recebimento e poderia até vir primeiro, mas fica no fim para o PR contar a história na ordem em que ela foi decidida.

## Definition of done da fatia

- `npx tsc -b` limpo.
- `npx vitest run --dir src --exclude '**/.claude/**'` verde, com **221+ testes** (202 do baseline + 19 novos).
- Runbook da Task 8 executado inteiro, com as duas migrations aplicadas no Supabase do app, e o resultado colado no PR.
- PR #74 sai de draft só depois disso.
