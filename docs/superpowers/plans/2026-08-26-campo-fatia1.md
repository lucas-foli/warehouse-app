# Campo fatia 1 — Contatos, interações e agenda: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRM de campo na aba nova "Campo": fornecedores + prospects, registro de interação em 30s (com amostras baixando estoque), agenda por próximo passo, funil por estágio derivado e ficha do contato com timeline.

**Architecture:** 4 migrations (suppliers + colunas de estágio, interactions + samples, RPC `register_interaction`, view `field_contacts` de fatos crus); derivação de estágio em TS (`deriveStage`, fonte única); `fieldService` fala com o Supabase; UI mobile-first na aba Campo seguindo o mockup aprovado (`docs/superpowers/specs/2026-08-26-campo-fatia1-preview.html`).

**Tech Stack:** React 18 + TS, Tailwind com tokens `hsl(var(--*))`, Supabase (Postgres + RLS + RPC plpgsql), vitest, react-router-dom.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-campo-fatia1-design.md` (com emendas de 2026-08-26).
- Typecheck gate: `npx tsc -b` (NUNCA `tsc --noEmit`).
- Testes: `npm test` (vitest). Baseline: 157 passando — nenhum pode quebrar.
- Indentação: TAB em TS e SQL (padrão de todo o src/ e das migrations).
- Strings de UI em pt-BR; valores de banco/enum em EN (`'visit'`, `'new'`, …).
- Migrations aditivas — nada de drop/alter destrutivo em tabelas existentes.
- RLS: read = `public.is_tenant_member(tenant_id)`; write direto = `public.is_tenant_admin(tenant_id)` (espelha clients); exceções via RPC security definer anotadas na task.
- Todo teste novo anota `// mata:` dizendo qual mutação detecta (regra da casa).
- **Gate de mutação adversarial antes do dispatch da task 1:** revisar os testes das tasks 5–7 e confirmar que nenhuma suíte passa sob a mutação "função retorna constante"; se alguma passar, adicionar o caso que mata antes de despachar.
- Commits pequenos por task, mensagem pt-BR estilo da casa (`feat:`, `test:`, `docs:`).

---

### Task 1: Migration — suppliers + colunas de estágio

**Files:**
- Create: `supabase/migrations/20260826000100_field_suppliers_and_stage.sql`

**Interfaces:**
- Produces: tabela `public.suppliers` (mesma forma de `clients`) e colunas `stage`, `stage_overridden_at`, `stage_overridden_by`, `last_interaction_at` em `clients` E `suppliers`. Tasks 2–4 e o service dependem desses nomes exatos.

- [ ] **Step 1: Escrever a migration**

```sql
-- Campo fatia 1 (1/4): fornecedores + colunas de estágio.
-- suppliers espelha a forma de clients (PR #67); prospects passam a viver em
-- clients, então as colunas de estágio existem NAS DUAS tabelas.
-- stage é SÓ o override manual; null = derivar dos fatos (deriveStage em TS).

create table if not exists public.suppliers (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	external_id text not null,
	name text not null,
	email text,
	phone text,
	city text,
	stage text check (stage in ('new','contacted','sample_delivered','negotiating','active','lost')),
	stage_overridden_at timestamptz,
	stage_overridden_by uuid,
	last_interaction_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_tenant_external_uidx on public.suppliers (tenant_id, external_id);
create index if not exists suppliers_tenant_id_idx on public.suppliers (tenant_id);

alter table public.suppliers enable row level security;

drop policy if exists "Tenant members can read suppliers" on public.suppliers;
create policy "Tenant members can read suppliers"
on public.suppliers
for select
using (public.is_tenant_member(suppliers.tenant_id));

drop policy if exists "Tenant admins manage suppliers" on public.suppliers;
create policy "Tenant admins manage suppliers"
on public.suppliers
for all
using (public.is_tenant_admin(suppliers.tenant_id))
with check (public.is_tenant_admin(suppliers.tenant_id));

alter table public.clients
	add column if not exists stage text check (stage in ('new','contacted','sample_delivered','negotiating','active','lost')),
	add column if not exists stage_overridden_at timestamptz,
	add column if not exists stage_overridden_by uuid,
	add column if not exists last_interaction_at timestamptz;
```

- [ ] **Step 2: Verificar sintaxe e higiene**

Run: `grep -c "create policy" supabase/migrations/20260826000100_field_suppliers_and_stage.sql` → esperado `2`.
Run: `python3 -c "b=open('supabase/migrations/20260826000100_field_suppliers_and_stage.sql','rb').read(); assert not [c for c in b if c<9 or 13<c<32], 'control chars'; print('clean')"` → `clean`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260826000100_field_suppliers_and_stage.sql
git commit -m "feat(campo): migration suppliers + colunas de estágio em clients/suppliers"
```

---

### Task 2: Migration — interactions + interaction_samples

**Files:**
- Create: `supabase/migrations/20260826000200_field_interactions.sql`

**Interfaces:**
- Consumes: `public.suppliers` (Task 1).
- Produces: `public.interactions` (arco exclusivo `client_id`/`supplier_id`, `kind`, `outcome`, `next_step`, `next_step_due_at`, `next_step_done_at`) e `public.interaction_samples` (`interaction_id`, `sku`, `qty`, `product_id`). Tasks 3, 4 e 7–8 usam esses nomes exatos.

- [ ] **Step 1: Escrever a migration**

```sql
-- Campo fatia 1 (2/4): interações (centro do módulo) + amostras.
-- Arco exclusivo: exatamente um de client_id/supplier_id preenchido.
-- Agenda = interactions com next_step_due_at preenchido e next_step_done_at
-- nulo (não existe tabela de agenda).

create table if not exists public.interactions (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	client_id uuid references public.clients (id) on delete cascade,
	supplier_id uuid references public.suppliers (id) on delete cascade,
	kind text not null check (kind in ('visit','call','whatsapp','email')),
	outcome text check (outcome in ('interested','proposal_requested','undecided','not_interested','buyer_absent')),
	note text,
	occurred_at timestamptz not null default now(),
	recorded_by uuid not null,
	next_step text,
	next_step_due_at timestamptz,
	next_step_done_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint interactions_contact_arc check (num_nonnulls(client_id, supplier_id) = 1)
);

create index if not exists interactions_tenant_id_idx on public.interactions (tenant_id);
create index if not exists interactions_tenant_client_idx on public.interactions (tenant_id, client_id);
create index if not exists interactions_tenant_supplier_idx on public.interactions (tenant_id, supplier_id);
create index if not exists interactions_agenda_idx
	on public.interactions (tenant_id, next_step_due_at)
	where next_step_due_at is not null and next_step_done_at is null;

create table if not exists public.interaction_samples (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	interaction_id uuid not null references public.interactions (id) on delete cascade,
	product_id uuid references public.products (id) on delete set null,
	sku text not null,
	qty integer not null check (qty > 0),
	created_at timestamptz not null default now()
);

create index if not exists interaction_samples_tenant_idx on public.interaction_samples (tenant_id);
create index if not exists interaction_samples_interaction_idx on public.interaction_samples (interaction_id);

alter table public.interactions enable row level security;
alter table public.interaction_samples enable row level security;

drop policy if exists "Tenant members can read interactions" on public.interactions;
create policy "Tenant members can read interactions"
on public.interactions
for select
using (public.is_tenant_member(interactions.tenant_id));

-- Marcar feito / reagendar são updates diretos de MEMBROS (registro de campo
-- não é operação administrativa; o insert passa pela RPC security definer).
drop policy if exists "Tenant members can update interactions" on public.interactions;
create policy "Tenant members can update interactions"
on public.interactions
for update
using (public.is_tenant_member(interactions.tenant_id))
with check (public.is_tenant_member(interactions.tenant_id));

drop policy if exists "Tenant members can read interaction samples" on public.interaction_samples;
create policy "Tenant members can read interaction samples"
on public.interaction_samples
for select
using (public.is_tenant_member(interaction_samples.tenant_id));
```

- [ ] **Step 2: Verificar**

Run: `grep -c "create policy" supabase/migrations/20260826000200_field_interactions.sql` → `3`.
Run: `python3 -c "b=open('supabase/migrations/20260826000200_field_interactions.sql','rb').read(); assert not [c for c in b if c<9 or 13<c<32], 'control chars'; print('clean')"` → `clean`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260826000200_field_interactions.sql
git commit -m "feat(campo): migration interactions + interaction_samples (arco exclusivo, índice de agenda)"
```

---

### Task 3: Migration — RPC register_interaction

**Files:**
- Create: `supabase/migrations/20260826000300_register_interaction.sql`

**Interfaces:**
- Consumes: `interactions`, `interaction_samples` (Task 2), `products.qty`.
- Produces: `public.register_interaction(p_tenant_id uuid, p_client_id uuid, p_supplier_id uuid, p_kind text, p_outcome text, p_note text, p_occurred_at timestamptz, p_next_step text, p_next_step_due_at timestamptz, p_samples jsonb) returns jsonb` — retorno `{"interaction_id": "<uuid>", "negative_skus": ["SKU", ...]}`. Exceções nomeadas: `not_authenticated`, `not_authorized`, `interaction_contact_invalid`, `interaction_kind_invalid`, `interaction_outcome_invalid`, `interaction_sample_qty_invalid`, `interaction_sample_sku_unknown`. Task 7 mapeia exatamente esses códigos.

- [ ] **Step 1: Escrever a migration**

```sql
-- Campo fatia 1 (3/4): registro transacional de interação + amostras + débito
-- de estoque. Padrão de register_sale_order (advisory lock desnecessário aqui:
-- não há numeração sequencial). Amostra é saída real sem receita; estoque pode
-- ficar NEGATIVO por decisão de spec — a UI avisa (negative_skus), não bloqueia.
-- Gate: is_tenant_member (registro de campo não é operação administrativa).

create or replace function public.register_interaction(
	p_tenant_id uuid,
	p_client_id uuid default null,
	p_supplier_id uuid default null,
	p_kind text default 'visit',
	p_outcome text default null,
	p_note text default null,
	p_occurred_at timestamptz default now(),
	p_next_step text default null,
	p_next_step_due_at timestamptz default null,
	p_samples jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_interaction_id uuid;
	v_item record;
	v_qty_after integer;
	v_product_id uuid;
	v_negative text[] := '{}';
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_member(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if num_nonnulls(p_client_id, p_supplier_id) <> 1 then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_client_id is not null and not exists (
		select 1 from public.clients c where c.id = p_client_id and c.tenant_id = p_tenant_id
	) then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_supplier_id is not null and not exists (
		select 1 from public.suppliers s where s.id = p_supplier_id and s.tenant_id = p_tenant_id
	) then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_kind is null or p_kind not in ('visit','call','whatsapp','email') then
		raise exception using message = 'interaction_kind_invalid';
	end if;

	if p_outcome is not null and p_outcome not in
		('interested','proposal_requested','undecided','not_interested','buyer_absent') then
		raise exception using message = 'interaction_outcome_invalid';
	end if;

	if p_samples is null or jsonb_typeof(p_samples) <> 'array' then
		raise exception using message = 'interaction_sample_qty_invalid';
	end if;

	-- Valida cada elemento ANTES da agregação, sem cast (NULL-seguro): qty
	-- ausente/não-numérico/decimal/zero/overflow vira exceção nomeada, e o
	-- sum não mascara item inválido em SKU duplicado.
	if exists (
		select 1 from jsonb_array_elements(p_samples) as elem
		where jsonb_typeof(elem) <> 'object'
			or not (elem ? 'qty')
			or jsonb_typeof(elem->'qty') <> 'number'
			or (elem->>'qty') !~ '^[0-9]+$'
			or length(elem->>'qty') > 9
			or (elem->>'qty') = '0'
	) then
		raise exception using message = 'interaction_sample_qty_invalid';
	end if;

	insert into public.interactions (
		tenant_id, client_id, supplier_id, kind, outcome, note,
		occurred_at, recorded_by, next_step, next_step_due_at
	)
	values (
		p_tenant_id, p_client_id, p_supplier_id, p_kind, p_outcome, nullif(trim(p_note), ''),
		coalesce(p_occurred_at, now()), auth.uid(), nullif(trim(p_next_step), ''), p_next_step_due_at
	)
	returning id into v_interaction_id;

	-- Merge de SKUs duplicados (soma qty), como register_sale_order.
	for v_item in
		select upper(trim(r.sku)) as sku, sum(r.qty) as qty
		from (
			select elem->>'sku' as sku, (elem->>'qty')::int as qty
			from jsonb_array_elements(p_samples) as elem
		) r
		group by upper(trim(r.sku))
	loop
		if v_item.sku is null or v_item.sku = '' or v_item.qty is null or v_item.qty <= 0 then
			raise exception using message = 'interaction_sample_qty_invalid';
		end if;

		select p.id into v_product_id
		from public.products p
		where p.tenant_id = p_tenant_id and upper(trim(p.sku)) = v_item.sku
		limit 1;

		if v_product_id is null then
			raise exception using message = 'interaction_sample_sku_unknown';
		end if;

		insert into public.interaction_samples (tenant_id, interaction_id, product_id, sku, qty)
		values (p_tenant_id, v_interaction_id, v_product_id, v_item.sku, v_item.qty);

		update public.products
		set qty = qty - v_item.qty
		where id = v_product_id
		returning qty into v_qty_after;

		if v_qty_after < 0 then
			v_negative := array_append(v_negative, v_item.sku);
		end if;
	end loop;

	if p_client_id is not null then
		update public.clients
		set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'::timestamptz), coalesce(p_occurred_at, now())),
			updated_at = now()
		where id = p_client_id;
	else
		update public.suppliers
		set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'::timestamptz), coalesce(p_occurred_at, now())),
			updated_at = now()
		where id = p_supplier_id;
	end if;

	return jsonb_build_object(
		'interaction_id', v_interaction_id,
		'negative_skus', to_jsonb(v_negative)
	);
end;
$$;

revoke all on function public.register_interaction(uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz, jsonb) from public;
grant execute on function public.register_interaction(uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz, jsonb) to authenticated;
```

- [ ] **Step 2: Verificar**

Run: `grep -c "raise exception" supabase/migrations/20260826000300_register_interaction.sql` → `11` (7 códigos; contact_invalid 3x, sample_qty_invalid 3x).
Run: checagem python de control chars (mesma da Task 1, trocando o caminho) → `clean`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260826000300_register_interaction.sql
git commit -m "feat(campo): RPC register_interaction (interação + amostras + débito de estoque)"
```

---

### Task 4: Migration — view field_contacts (fatos crus)

**Files:**
- Create: `supabase/migrations/20260826000400_field_contacts_view.sql`

**Interfaces:**
- Consumes: `clients`, `suppliers`, `interactions`, `interaction_samples`, `sales_orders`.
- Produces: view `public.field_contacts` com colunas exatas: `contact_type` (`'client'`/`'supplier'`), `id`, `tenant_id`, `name`, `city`, `phone`, `email`, `manual_stage`, `stage_overridden_at`, `last_interaction_at`, `has_transaction`, `last_outcome`, `has_samples`, `has_interaction`, `last_fact_at`. A derivação de estágio acontece em TS (Task 5) sobre esses fatos — a view NÃO deriva estágio.

- [ ] **Step 1: Escrever a migration**

```sql
-- Campo fatia 1 (4/4): visão unificada de contatos com FATOS CRUS para a
-- derivação de estágio em TS (deriveStage — fonte única; emenda da spec).
-- security_invoker: a RLS das tabelas base vale (lição do
-- fix_tenant_branding_definer_view).
-- has_transaction de supplier é FALSE até a fatia 2 (recebimentos).

drop view if exists public.field_contacts;
create view public.field_contacts
with (security_invoker = true)
as
select
	'client'::text as contact_type,
	c.id,
	c.tenant_id,
	c.name,
	c.city,
	c.phone,
	c.email,
	c.stage as manual_stage,
	c.stage_overridden_at,
	c.last_interaction_at,
	exists (
		select 1 from public.sales_orders so
		where so.client_id = c.id and so.status is distinct from 'voided'
	) as has_transaction,
	(
		select i.outcome from public.interactions i
		where i.client_id = c.id and i.outcome is not null
		order by i.occurred_at desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples s on s.interaction_id = i.id
		where i.client_id = c.id
	) as has_samples,
	exists (select 1 from public.interactions i where i.client_id = c.id) as has_interaction,
	greatest(
		c.last_interaction_at,
		(select max(so.sold_at) from public.sales_orders so
			where so.client_id = c.id and so.status is distinct from 'voided')
	) as last_fact_at
from public.clients c
union all
select
	'supplier'::text as contact_type,
	s.id,
	s.tenant_id,
	s.name,
	s.city,
	s.phone,
	s.email,
	s.stage as manual_stage,
	s.stage_overridden_at,
	s.last_interaction_at,
	false as has_transaction,
	(
		select i.outcome from public.interactions i
		where i.supplier_id = s.id and i.outcome is not null
		order by i.occurred_at desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples sm on sm.interaction_id = i.id
		where i.supplier_id = s.id
	) as has_samples,
	exists (select 1 from public.interactions i where i.supplier_id = s.id) as has_interaction,
	s.last_interaction_at as last_fact_at
from public.suppliers s;

grant select on public.field_contacts to authenticated;
```

- [ ] **Step 2: Verificar**

Run: `grep -c "security_invoker = true" supabase/migrations/20260826000400_field_contacts_view.sql` → `1`.
Run: checagem python de control chars → `clean`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260826000400_field_contacts_view.sql
git commit -m "feat(campo): view field_contacts (fatos crus p/ derivação de estágio em TS)"
```

---

### Task 5: Tipos de domínio + deriveStage (fonte única) com testes

**Files:**
- Modify: `src/types/index.ts` (append no fim do arquivo)
- Create: `src/utils/stageDerivation.ts`
- Test: `src/utils/stageDerivation.test.ts`

**Interfaces:**
- Produces (em `src/types/index.ts`):

```ts
export type ContactType = 'client' | 'supplier';
export type InteractionKind = 'visit' | 'call' | 'whatsapp' | 'email';
export type InteractionOutcome =
	| 'interested'
	| 'proposal_requested'
	| 'undecided'
	| 'not_interested'
	| 'buyer_absent';
export type ContactStage = 'new' | 'contacted' | 'sample_delivered' | 'negotiating' | 'active' | 'lost';

export interface FieldContact {
	contactType: ContactType;
	id: string;
	tenantId: string;
	name: string;
	city?: string;
	phone?: string;
	email?: string;
	manualStage: ContactStage | null;
	stageOverriddenAt: string | null;
	lastInteractionAt: string | null;
	hasTransaction: boolean;
	lastOutcome: InteractionOutcome | null;
	hasSamples: boolean;
	hasInteraction: boolean;
	lastFactAt: string | null;
}

export interface Interaction {
	id: string;
	tenantId: string;
	clientId: string | null;
	supplierId: string | null;
	kind: InteractionKind;
	outcome: InteractionOutcome | null;
	note: string | null;
	occurredAt: string;
	nextStep: string | null;
	nextStepDueAt: string | null;
	nextStepDoneAt: string | null;
	samples: { sku: string; qty: number }[];
}
```

- Produces (em `src/utils/stageDerivation.ts`): `deriveStage(c)`, `STAGE_LABELS`, `STAGE_ORDER` — exatamente como abaixo. O funil (Task 11), a ficha (Task 13) e as fatias 3/5 importam daqui.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/utils/stageDerivation.test.ts
import { describe, expect, it } from 'vitest';
import type { FieldContact } from '../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from './stageDerivation';

const base: FieldContact = {
	contactType: 'client',
	id: 'c1',
	tenantId: 't1',
	name: 'Ocean Fresh',
	manualStage: null,
	stageOverriddenAt: null,
	lastInteractionAt: null,
	hasTransaction: false,
	lastOutcome: null,
	hasSamples: false,
	hasInteraction: false,
	lastFactAt: null,
};

describe('deriveStage — 7 regras da spec, em ordem de precedência', () => {
	it('regra 7: nada registrado → new', () => {
		// mata: mutação que devolve constante != 'new' ou ignora o caso vazio
		expect(deriveStage(base)).toEqual({ stage: 'new', overridden: false });
	});

	it('regra 6: tem interação → contacted', () => {
		// mata: mutação que ignora hasInteraction
		expect(deriveStage({ ...base, hasInteraction: true, lastFactAt: '2026-08-20T10:00:00Z' }).stage).toBe('contacted');
	});

	it('regra 5: amostra entregue vence interação simples', () => {
		// mata: inversão de precedência entre hasSamples e hasInteraction
		expect(
			deriveStage({ ...base, hasInteraction: true, hasSamples: true, lastFactAt: '2026-08-20T10:00:00Z' }).stage,
		).toBe('sample_delivered');
	});

	it('regra 4: último resultado proposal_requested → negotiating (vence amostra)', () => {
		// mata: mutação que só olha hasSamples
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				hasSamples: true,
				lastOutcome: 'proposal_requested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}).stage,
		).toBe('negotiating');
	});

	it('regra 3: último resultado not_interested → lost (vence negociação)', () => {
		// mata: inversão de precedência entre lost e negotiating
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				hasSamples: true,
				lastOutcome: 'not_interested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}).stage,
		).toBe('lost');
	});

	it('regra 2: transação vence tudo que não é override → active', () => {
		// mata: mutação que deixa lastOutcome vencer hasTransaction
		expect(
			deriveStage({
				...base,
				hasTransaction: true,
				hasInteraction: true,
				lastOutcome: 'not_interested',
				lastFactAt: '2026-08-20T10:00:00Z',
			}).stage,
		).toBe('active');
	});

	it('regra 1: override manual mais novo que o último fato vale', () => {
		// mata: mutação que ignora manualStage ou compara datas ao contrário
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				lastFactAt: '2026-08-20T10:00:00Z',
				manualStage: 'lost',
				stageOverriddenAt: '2026-08-21T10:00:00Z',
			}),
		).toEqual({ stage: 'lost', overridden: true });
	});

	it('regra 1 (expiração): fato novo depois do override volta a derivar', () => {
		// mata: mutação que trata override como permanente
		expect(
			deriveStage({
				...base,
				hasInteraction: true,
				lastFactAt: '2026-08-22T10:00:00Z',
				manualStage: 'lost',
				stageOverriddenAt: '2026-08-21T10:00:00Z',
			}),
		).toEqual({ stage: 'contacted', overridden: false });
	});

	it('regra 1 (sem fato): override com lastFactAt null vale', () => {
		// mata: mutação que exige lastFactAt não-nulo para honrar o override
		expect(deriveStage({ ...base, manualStage: 'negotiating', stageOverriddenAt: '2026-08-21T10:00:00Z' })).toEqual({
			stage: 'negotiating',
			overridden: true,
		});
	});
});

describe('labels e ordem do funil', () => {
	it('todo estágio tem label pt-BR e posição no funil', () => {
		// mata: estágio adicionado sem label/ordem (quebra o agrupamento do funil)
		for (const stage of STAGE_ORDER) {
			expect(STAGE_LABELS[stage]).toBeTruthy();
		}
		expect(STAGE_ORDER).toHaveLength(6);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/stageDerivation.test.ts`
Expected: FAIL — `Cannot find module './stageDerivation'`.

- [ ] **Step 3: Adicionar os tipos em `src/types/index.ts`**

Append no fim do arquivo o bloco de tipos do cabeçalho **Interfaces** desta task, verbatim.

- [ ] **Step 4: Implementar `src/utils/stageDerivation.ts`**

```ts
import type { ContactStage, FieldContact } from '../types';

// Fonte única da derivação de estágio (emenda da spec: TS, não SQL — aqui as
// 7 regras têm suíte de unidade; a view field_contacts entrega só fatos crus).
// Precedência, avaliada de cima para baixo:
// 1. override manual, se mais novo que o último fato (senão expira)
// 2. tem transação (venda; recebimento entra na fatia 2)   → active
// 3. último resultado not_interested                        → lost
// 4. último resultado proposal_requested                    → negotiating
// 5. tem amostra entregue                                   → sample_delivered
// 6. tem ao menos uma interação                             → contacted
// 7. nada                                                   → new
export const deriveStage = (c: FieldContact): { stage: ContactStage; overridden: boolean } => {
	if (c.manualStage && c.stageOverriddenAt) {
		const overrideWins = !c.lastFactAt || c.stageOverriddenAt > c.lastFactAt;
		if (overrideWins) return { stage: c.manualStage, overridden: true };
	}
	if (c.hasTransaction) return { stage: 'active', overridden: false };
	if (c.lastOutcome === 'not_interested') return { stage: 'lost', overridden: false };
	if (c.lastOutcome === 'proposal_requested') return { stage: 'negotiating', overridden: false };
	if (c.hasSamples) return { stage: 'sample_delivered', overridden: false };
	if (c.hasInteraction) return { stage: 'contacted', overridden: false };
	return { stage: 'new', overridden: false };
};

// Ordem de exibição do funil (mais quente primeiro) e labels pt-BR.
export const STAGE_ORDER: ContactStage[] = [
	'negotiating',
	'sample_delivered',
	'active',
	'contacted',
	'new',
	'lost',
];

export const STAGE_LABELS: Record<ContactStage, string> = {
	new: 'Novo',
	contacted: 'Contatado',
	sample_delivered: 'Amostra entregue',
	negotiating: 'Negociando',
	active: 'Ativo',
	lost: 'Perdido',
};
```

Nota: a comparação `stageOverriddenAt > c.lastFactAt` é lexicográfica sobre ISO-8601 UTC — os timestamps vêm do Postgres como ISO UTC; comparação de string equivale a comparação temporal.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/utils/stageDerivation.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 6: Typecheck + suíte inteira**

Run: `npx tsc -b && npm test`
Expected: 0 erros TS; 167 testes passando (157 + 10).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/stageDerivation.ts src/utils/stageDerivation.test.ts
git commit -m "feat(campo): tipos de domínio + deriveStage com as 7 regras testadas"
```

---

### Task 6: agendaGrouping com testes (timezone do navegador)

**Files:**
- Create: `src/utils/agendaGrouping.ts`
- Test: `src/utils/agendaGrouping.test.ts`

**Interfaces:**
- Produces: `groupAgenda<T extends { nextStepDueAt: string | null }>(items: T[], now: Date): AgendaGroups<T>` com `AgendaGroups<T> = { overdue: T[]; today: T[]; week: T[]; later: T[] }`. AgendaView (Task 10) consome exatamente isso.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/utils/agendaGrouping.test.ts
import { describe, expect, it } from 'vitest';
import { groupAgenda } from './agendaGrouping';

// "now" fixo: qua 2026-08-26 15:00 no fuso LOCAL do runner — o agrupamento é
// por dia local (o Elcy pensa em "hoje", não em UTC).
const now = new Date(2026, 7, 26, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

const item = (dueAt: string | null) => ({ nextStepDueAt: dueAt });

describe('groupAgenda', () => {
	it('ontem → overdue; hoje (mesmo mais tarde) → today', () => {
		// mata: comparação por timestamp bruto em vez de dia local
		const groups = groupAgenda([item(at(2026, 7, 25)), item(at(2026, 7, 26, 23))], now);
		expect(groups.overdue).toHaveLength(1);
		expect(groups.today).toHaveLength(1);
	});

	it('amanhã até +7 dias → week; além → later', () => {
		// mata: off-by-one no limite de 7 dias
		const groups = groupAgenda([item(at(2026, 8, 2)), item(at(2026, 8, 3))], now);
		expect(groups.week).toHaveLength(1);
		expect(groups.later).toHaveLength(1);
	});

	it('hoje de manhã (antes de now) ainda é today, não overdue', () => {
		// mata: comparação due < now em vez de due < startOfToday
		const groups = groupAgenda([item(at(2026, 7, 26, 8))], now);
		expect(groups.today).toHaveLength(1);
		expect(groups.overdue).toHaveLength(0);
	});

	it('sem data → fora de todos os grupos', () => {
		// mata: null cair em overdue por coerção
		const groups = groupAgenda([item(null)], now);
		expect(groups.overdue.length + groups.today.length + groups.week.length + groups.later.length).toBe(0);
	});

	it('ordena cada grupo por vencimento ascendente', () => {
		// mata: mutação que remove o sort
		const groups = groupAgenda([item(at(2026, 7, 24)), item(at(2026, 7, 23))], now);
		expect(groups.overdue.map((i) => i.nextStepDueAt)).toEqual([at(2026, 7, 23), at(2026, 7, 24)]);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/agendaGrouping.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/utils/agendaGrouping.ts
// Agrupa follow-ups por DIA LOCAL do navegador (spec: "timezone do navegador").
// Atrasados / Hoje / Esta semana (próximos 7 dias) / Mais tarde.

export type AgendaGroups<T> = {
	overdue: T[];
	today: T[];
	week: T[];
	later: T[];
};

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

export const groupAgenda = <T extends { nextStepDueAt: string | null }>(
	items: T[],
	now: Date,
): AgendaGroups<T> => {
	const todayStart = startOfDay(now);
	const tomorrowStart = todayStart + DAY_MS;
	const weekEnd = todayStart + 8 * DAY_MS; // amanhã + 7 dias corridos (exclusivo)

	const groups: AgendaGroups<T> = { overdue: [], today: [], week: [], later: [] };
	for (const item of items) {
		if (!item.nextStepDueAt) continue;
		const due = startOfDay(new Date(item.nextStepDueAt));
		if (due < todayStart) groups.overdue.push(item);
		else if (due < tomorrowStart) groups.today.push(item);
		else if (due < weekEnd) groups.week.push(item);
		else groups.later.push(item);
	}
	const byDue = (a: T, b: T) => (a.nextStepDueAt ?? '').localeCompare(b.nextStepDueAt ?? '');
	groups.overdue.sort(byDue);
	groups.today.sort(byDue);
	groups.week.sort(byDue);
	groups.later.sort(byDue);
	return groups;
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/utils/agendaGrouping.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/utils/agendaGrouping.ts src/utils/agendaGrouping.test.ts
git commit -m "feat(campo): groupAgenda por dia local (atrasados/hoje/semana/mais tarde)"
```

---

### Task 7: fieldService — registerInteraction (merge de amostras + erros amigáveis)

**Files:**
- Create: `src/services/fieldService.ts`
- Test: `src/services/fieldService.test.ts`

**Interfaces:**
- Consumes: RPC `register_interaction` (Task 3), tipos da Task 5.
- Produces (usado pelas Tasks 8, 10, 11 e 13):

```ts
export type SampleInput = { sku: string; qty: number };
export type RegisterInteractionInput = {
	tenantId: string;
	clientId?: string | null;
	supplierId?: string | null;
	kind: InteractionKind;
	outcome?: InteractionOutcome | null;
	note?: string | null;
	occurredAt?: string;
	nextStep?: string | null;
	nextStepDueAt?: string | null;
	samples?: SampleInput[];
};
export function mergeSamples(samples: SampleInput[]): SampleInput[];
export async function registerInteraction(input: RegisterInteractionInput): Promise<{ interactionId: string; negativeSkus: string[] }>;
```

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/services/fieldService.test.ts
import { describe, expect, it } from 'vitest';
import { mergeSamples } from './fieldService';

describe('mergeSamples', () => {
	it('soma quantidades de SKUs duplicados (case/espaço-insensível)', () => {
		// mata: mutação que não agrega ou não normaliza o SKU
		expect(
			mergeSamples([
				{ sku: 'pop-401', qty: 2 },
				{ sku: ' POP-401 ', qty: 1 },
				{ sku: 'POP-114', qty: 1 },
			]),
		).toEqual([
			{ sku: 'POP-401', qty: 3 },
			{ sku: 'POP-114', qty: 1 },
		]);
	});

	it('descarta linhas sem SKU ou com qty <= 0', () => {
		// mata: mutação que deixa lixo passar para a RPC
		expect(
			mergeSamples([
				{ sku: '  ', qty: 2 },
				{ sku: 'POP-401', qty: 0 },
				{ sku: 'POP-401', qty: -1 },
			]),
		).toEqual([]);
	});

	it('preserva a ordem da primeira ocorrência', () => {
		// mata: mutação que reordena (a UI mostra a lista na ordem digitada)
		expect(
			mergeSamples([
				{ sku: 'B', qty: 1 },
				{ sku: 'A', qty: 1 },
				{ sku: 'B', qty: 1 },
			]).map((s) => s.sku),
		).toEqual(['B', 'A']);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/services/fieldService.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar o início de `src/services/fieldService.ts`**

```ts
import { supabase } from '../lib/supabaseClient';
import type { InteractionKind, InteractionOutcome } from '../types';

export type SampleInput = { sku: string; qty: number };

export type RegisterInteractionInput = {
	tenantId: string;
	clientId?: string | null;
	supplierId?: string | null;
	kind: InteractionKind;
	outcome?: InteractionOutcome | null;
	note?: string | null;
	occurredAt?: string;
	nextStep?: string | null;
	nextStepDueAt?: string | null;
	samples?: SampleInput[];
};

// Espelha as exceções nomeadas de register_interaction
// (20260826000300_register_interaction.sql) em mensagens pt-BR.
const INTERACTION_ERROR_MESSAGES: Record<string, string> = {
	not_authenticated: 'Sua sessão expirou. Entre novamente para registrar.',
	not_authorized: 'Você não tem acesso a este workspace.',
	interaction_contact_invalid: 'Escolha um contato (cliente ou fornecedor) válido.',
	interaction_kind_invalid: 'Tipo de interação inválido.',
	interaction_outcome_invalid: 'Resultado inválido.',
	interaction_sample_qty_invalid: 'A quantidade de cada amostra deve ser maior que zero.',
	interaction_sample_sku_unknown: 'SKU de amostra não encontrado neste catálogo.',
};

const friendlyInteractionError = (rawMessage: string): string => {
	for (const [code, message] of Object.entries(INTERACTION_ERROR_MESSAGES)) {
		if (rawMessage.includes(code)) return message;
	}
	return rawMessage || 'Não foi possível registrar a interação.';
};

// Merge client-side dos SKUs duplicados: normaliza (trim + upper), soma qty,
// descarta linhas inválidas, preserva a ordem da primeira ocorrência. A RPC
// repete o merge server-side — este aqui existe para a UI mostrar o total real
// antes de salvar.
export const mergeSamples = (samples: SampleInput[]): SampleInput[] => {
	const merged = new Map<string, number>();
	for (const s of samples) {
		const sku = s.sku.trim().toUpperCase();
		if (!sku || !Number.isFinite(s.qty) || s.qty <= 0) continue;
		merged.set(sku, (merged.get(sku) ?? 0) + s.qty);
	}
	return Array.from(merged, ([sku, qty]) => ({ sku, qty }));
};

/**
 * Registra interação + amostras + débito de estoque atomicamente via
 * register_interaction. Estoque pode ficar negativo por decisão de spec —
 * negativeSkus volta para a UI avisar sem bloquear.
 */
export async function registerInteraction(
	input: RegisterInteractionInput,
): Promise<{ interactionId: string; negativeSkus: string[] }> {
	const { data, error } = await supabase.rpc('register_interaction', {
		p_tenant_id: input.tenantId,
		p_client_id: input.clientId ?? null,
		p_supplier_id: input.supplierId ?? null,
		p_kind: input.kind,
		p_outcome: input.outcome ?? null,
		p_note: input.note ?? null,
		p_occurred_at: input.occurredAt ?? new Date().toISOString(),
		p_next_step: input.nextStep ?? null,
		p_next_step_due_at: input.nextStepDueAt ?? null,
		p_samples: mergeSamples(input.samples ?? []),
	});

	if (error) throw new Error(friendlyInteractionError(error.message));
	if (!data) throw new Error('Não foi possível registrar a interação.');

	const payload = data as { interaction_id: string; negative_skus: string[] };
	return { interactionId: payload.interaction_id, negativeSkus: payload.negative_skus ?? [] };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/services/fieldService.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc -b` → 0 erros.

```bash
git add src/services/fieldService.ts src/services/fieldService.test.ts
git commit -m "feat(campo): fieldService.registerInteraction com merge de amostras testado"
```

---

### Task 8: fieldService — fetches, agenda ops, quick-create e override

**Files:**
- Modify: `src/services/fieldService.ts` (append após registerInteraction)

**Interfaces:**
- Consumes: view `field_contacts` (Task 4), tabelas `interactions`/`interaction_samples` (Task 2), `clients`/`suppliers` (Task 1), `clientExternalId` de `src/utils/clientSellerForms.ts`.
- Produces (usado pelas Tasks 9–13):

```ts
export async function fetchFieldContacts(tenantId: string): Promise<FieldContact[]>;
export async function fetchOpenAgenda(tenantId: string): Promise<Interaction[]>;
export async function fetchContactInteractions(tenantId: string, contactType: ContactType, contactId: string): Promise<Interaction[]>;
export async function markNextStepDone(interactionId: string): Promise<void>;
export async function rescheduleNextStep(interactionId: string, dueAt: string): Promise<void>;
export async function setManualStage(contactType: ContactType, contactId: string, stage: ContactStage | null): Promise<void>;
export async function quickCreateContact(tenantId: string, contactType: ContactType, nome: string, cidade: string): Promise<{ id: string }>;
```

- [ ] **Step 1: Append em `src/services/fieldService.ts`**

Adicionar aos imports existentes: `ContactStage`, `ContactType`, `FieldContact`, `Interaction` de `'../types'` e `clientExternalId` de `'../utils/clientSellerForms'` (usar `import type` para os tipos). Depois append:

```ts
type FieldContactRow = {
	contact_type: ContactType;
	id: string;
	tenant_id: string;
	name: string;
	city: string | null;
	phone: string | null;
	email: string | null;
	manual_stage: ContactStage | null;
	stage_overridden_at: string | null;
	last_interaction_at: string | null;
	has_transaction: boolean;
	last_outcome: FieldContact['lastOutcome'];
	has_samples: boolean;
	has_interaction: boolean;
	last_fact_at: string | null;
};

const rowToFieldContact = (r: FieldContactRow): FieldContact => ({
	contactType: r.contact_type,
	id: r.id,
	tenantId: r.tenant_id,
	name: r.name,
	city: r.city ?? undefined,
	phone: r.phone ?? undefined,
	email: r.email ?? undefined,
	manualStage: r.manual_stage,
	stageOverriddenAt: r.stage_overridden_at,
	lastInteractionAt: r.last_interaction_at,
	hasTransaction: r.has_transaction,
	lastOutcome: r.last_outcome,
	hasSamples: r.has_samples,
	hasInteraction: r.has_interaction,
	lastFactAt: r.last_fact_at,
});

type InteractionRow = {
	id: string;
	tenant_id: string;
	client_id: string | null;
	supplier_id: string | null;
	kind: Interaction['kind'];
	outcome: Interaction['outcome'];
	note: string | null;
	occurred_at: string;
	next_step: string | null;
	next_step_due_at: string | null;
	next_step_done_at: string | null;
	interaction_samples?: { sku: string; qty: number }[];
};

const rowToInteraction = (r: InteractionRow): Interaction => ({
	id: r.id,
	tenantId: r.tenant_id,
	clientId: r.client_id,
	supplierId: r.supplier_id,
	kind: r.kind,
	outcome: r.outcome,
	note: r.note,
	occurredAt: r.occurred_at,
	nextStep: r.next_step,
	nextStepDueAt: r.next_step_due_at,
	nextStepDoneAt: r.next_step_done_at,
	samples: r.interaction_samples ?? [],
});

export async function fetchFieldContacts(tenantId: string): Promise<FieldContact[]> {
	const { data, error } = await supabase
		.from('field_contacts')
		.select('*')
		.eq('tenant_id', tenantId)
		.order('last_interaction_at', { ascending: false, nullsFirst: false });
	if (error) throw error;
	return ((data ?? []) as FieldContactRow[]).map(rowToFieldContact);
}

// Agenda = interações com próximo passo em aberto (não existe tabela própria).
export async function fetchOpenAgenda(tenantId: string): Promise<Interaction[]> {
	const { data, error } = await supabase
		.from('interactions')
		.select('*, interaction_samples(sku, qty)')
		.eq('tenant_id', tenantId)
		.not('next_step_due_at', 'is', null)
		.is('next_step_done_at', null)
		.order('next_step_due_at', { ascending: true });
	if (error) throw error;
	return ((data ?? []) as InteractionRow[]).map(rowToInteraction);
}

export async function fetchContactInteractions(
	tenantId: string,
	contactType: ContactType,
	contactId: string,
): Promise<Interaction[]> {
	const column = contactType === 'client' ? 'client_id' : 'supplier_id';
	const { data, error } = await supabase
		.from('interactions')
		.select('*, interaction_samples(sku, qty)')
		.eq('tenant_id', tenantId)
		.eq(column, contactId)
		.order('occurred_at', { ascending: false });
	if (error) throw error;
	return ((data ?? []) as InteractionRow[]).map(rowToInteraction);
}

export async function markNextStepDone(interactionId: string): Promise<void> {
	const { error } = await supabase
		.from('interactions')
		.update({ next_step_done_at: new Date().toISOString(), updated_at: new Date().toISOString() })
		.eq('id', interactionId);
	if (error) throw error;
}

export async function rescheduleNextStep(interactionId: string, dueAt: string): Promise<void> {
	const { error } = await supabase
		.from('interactions')
		.update({ next_step_due_at: dueAt, updated_at: new Date().toISOString() })
		.eq('id', interactionId);
	if (error) throw error;
}

// stage = null limpa o override (volta a derivar dos fatos).
export async function setManualStage(
	contactType: ContactType,
	contactId: string,
	stage: ContactStage | null,
): Promise<void> {
	const table = contactType === 'client' ? 'clients' : 'suppliers';
	const { data: userData } = await supabase.auth.getUser();
	const { error } = await supabase
		.from(table)
		.update({
			stage,
			stage_overridden_at: stage ? new Date().toISOString() : null,
			stage_overridden_by: stage ? (userData?.user?.id ?? null) : null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', contactId);
	if (error) throw error;
}

// Criação mínima na rua: só nome + cidade. external_id segue a regra do CRUD
// de clientes (clientSellerForms) para manter dedupe com importações futuras.
export async function quickCreateContact(
	tenantId: string,
	contactType: ContactType,
	nome: string,
	cidade: string,
): Promise<{ id: string }> {
	const table = contactType === 'client' ? 'clients' : 'suppliers';
	const external = clientExternalId({ nome, cidade, telefone: '', email: '' });
	const { data, error } = await supabase
		.from(table)
		.insert({
			tenant_id: tenantId,
			external_id: external,
			name: nome.trim(),
			city: cidade.trim() || undefined,
		})
		.select('id')
		.single();
	if (error) throw error;
	return { id: (data as { id: string }).id };
}
```

Nota: o client Supabase da casa é NÃO-tipado (`createClient` sem `<Database>` em `src/lib/supabaseClient.ts`), então `.from('suppliers')` / `.from('field_contacts')` compilam sem mudança no schema tipado; a tipagem vem dos casts de Row acima (mesmo padrão do `dashboardService`).

- [ ] **Step 2: Typecheck + suíte**

Run: `npx tsc -b && npm test`
Expected: 0 erros; 175 testes passando.

- [ ] **Step 3: Commit**

```bash
git add src/services/fieldService.ts
git commit -m "feat(campo): fieldService — fetches, agenda ops, quick-create e override de estágio"
```

---

### Task 9: Rota e aba Campo (shell com segmented control)

**Files:**
- Modify: `src/utils/dashboardView.ts`
- Modify: `src/utils/dashboardView.test.ts` (append)
- Modify: `src/App.tsx` (rota `/field`)
- Modify: `src/components/Dashboard.tsx` (tab + título + render)
- Create: `src/components/field/FieldPage.tsx`

**Interfaces:**
- Consumes: `fetchFieldContacts`, `fetchOpenAgenda` (Task 8), tipos da Task 5.
- Produces: `FieldPage` com props `{ tenantId?: string; products: Product[]; onReload: () => void }`; sub-visões trocadas por estado local `view: 'agenda' | 'funnel' | 'suppliers'`. As Tasks 10–13 preenchem as sub-visões — esta task entrega o shell com placeholders vazios honestos.

- [ ] **Step 1: Teste da rota (append em `src/utils/dashboardView.test.ts`)**

```ts
	it('mapeia /field para a aba campo', () => {
		// mata: rota nova sem case no resolver (cairia no default overview)
		expect(resolveDashboardView('/field')).toEqual({ page: 'campo', surface: 'dashboard' });
	});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/utils/dashboardView.test.ts`
Expected: FAIL — `'campo'` não é um `DashboardPage`.

- [ ] **Step 3: Implementar a rota**

Em `src/utils/dashboardView.ts`:
- `export type DashboardPage = 'overview' | 'clientes' | 'vendedores' | 'vendas' | 'campo';`
- Adicionar o case no switch, antes do default:

```ts
		case '/field':
			return { page: 'campo', surface: 'dashboard' };
```

Em `src/App.tsx`, junto às rotas do dashboard (após a linha `<Route path="/sales" element={dashboardElement} />`):

```tsx
			<Route path="/field" element={dashboardElement} />
```

- [ ] **Step 4: Criar o shell `src/components/field/FieldPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { FieldContact, Interaction, Product } from '../../types';
import { fetchFieldContacts, fetchOpenAgenda } from '../../services/fieldService';

type FieldView = 'agenda' | 'funnel' | 'suppliers';

type Props = {
	tenantId?: string;
	products: Product[];
	onReload: () => void;
};

const segClass = (active: boolean) =>
	`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
		active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
	}`;

const FieldPage = ({ tenantId, products, onReload }: Props) => {
	const [view, setView] = useState<FieldView>('agenda');
	const [contacts, setContacts] = useState<FieldContact[]>([]);
	const [agenda, setAgenda] = useState<Interaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const reloadField = useCallback(async () => {
		if (!tenantId) return;
		setLoading(true);
		setError('');
		try {
			const [nextContacts, nextAgenda] = await Promise.all([
				fetchFieldContacts(tenantId),
				fetchOpenAgenda(tenantId),
			]);
			setContacts(nextContacts);
			setAgenda(nextAgenda);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível carregar o Campo.');
		} finally {
			setLoading(false);
		}
	}, [tenantId]);

	useEffect(() => {
		void reloadField();
	}, [reloadField]);

	// products e onReload são consumidos pelas sub-visões das Tasks 10-13.
	void products;
	void onReload;

	return (
		<div className="space-y-6">
			<div className="flex rounded-2xl bg-muted p-1">
				<button type="button" className={segClass(view === 'agenda')} onClick={() => setView('agenda')}>
					Agenda
				</button>
				<button type="button" className={segClass(view === 'funnel')} onClick={() => setView('funnel')}>
					Funil
				</button>
				<button type="button" className={segClass(view === 'suppliers')} onClick={() => setView('suppliers')}>
					Fornecedores
				</button>
			</div>

			{error && (
				<p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
			)}
			{loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

			{!loading && view === 'agenda' && (
				<p className="text-sm text-muted-foreground">
					{agenda.length === 0 ? 'Nenhum follow-up marcado.' : `${agenda.length} follow-ups abertos.`}
				</p>
			)}
			{!loading && view === 'funnel' && (
				<p className="text-sm text-muted-foreground">
					{contacts.length === 0 ? 'Nenhum contato ainda.' : `${contacts.length} contatos.`}
				</p>
			)}
			{!loading && view === 'suppliers' && (
				<p className="text-sm text-muted-foreground">
					{contacts.filter((c) => c.contactType === 'supplier').length === 0
						? 'Nenhum fornecedor cadastrado.'
						: `${contacts.filter((c) => c.contactType === 'supplier').length} fornecedores.`}
				</p>
			)}
		</div>
	);
};

export default FieldPage;
```

- [ ] **Step 5: Ligar em `src/components/Dashboard.tsx`**

1. Import: `import FieldPage from './field/FieldPage';`
2. No array de tabs, depois de `{ key: 'overview', label: 'Dashboard', path: '/' },` inserir:

```tsx
											{ key: 'campo', label: 'Campo', path: '/field' },
```

3. No bloco de `<Title>`, junto às outras linhas de título:

```tsx
								{page === 'campo' && 'Campo'}
```

4. Junto aos renders condicionais das outras páginas:

```tsx
					{page === 'campo' && (
						<FieldPage tenantId={tenantId} products={visibleProducts} onReload={reload} />
					)}
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `npx vitest run src/utils/dashboardView.test.ts` → PASS.
Run: `npx tsc -b && npm test` → 0 erros; 176 testes.

- [ ] **Step 7: Commit**

```bash
git add src/utils/dashboardView.ts src/utils/dashboardView.test.ts src/App.tsx src/components/Dashboard.tsx src/components/field/FieldPage.tsx
git commit -m "feat(campo): aba Campo com rota /field e shell segmented (agenda/funil/fornecedores)"
```

---

### Task 10: AgendaView (marcar feito / reagendar)

**Files:**
- Create: `src/components/field/AgendaView.tsx`
- Modify: `src/components/field/FieldPage.tsx` (substituir o placeholder da agenda)

**Interfaces:**
- Consumes: `groupAgenda` (Task 6), `markNextStepDone`, `rescheduleNextStep` (Task 8), `deriveStage`/`STAGE_LABELS` não são usados aqui.
- Produces: `AgendaView` com props `{ agenda: Interaction[]; contacts: FieldContact[]; onChanged: () => void }`. `onChanged` = FieldPage.reloadField.

- [ ] **Step 1: Criar `src/components/field/AgendaView.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { FieldContact, Interaction } from '../../types';
import { groupAgenda } from '../../utils/agendaGrouping';
import { markNextStepDone, rescheduleNextStep } from '../../services/fieldService';

type Props = {
	agenda: Interaction[];
	contacts: FieldContact[];
	onChanged: () => void;
};

const GROUP_TITLES: { key: 'overdue' | 'today' | 'week' | 'later'; title: string; accent?: string }[] = [
	{ key: 'overdue', title: 'Atrasados', accent: 'text-red-600' },
	{ key: 'today', title: 'Hoje' },
	{ key: 'week', title: 'Esta semana' },
	{ key: 'later', title: 'Mais tarde' },
];

const dueLabel = (iso: string | null): string => {
	if (!iso) return '';
	return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
};

const AgendaView = ({ agenda, contacts, onChanged }: Props) => {
	const [busyId, setBusyId] = useState<string | null>(null);
	const [laterOpen, setLaterOpen] = useState(false);
	const [error, setError] = useState('');

	const contactById = useMemo(() => {
		const map = new Map<string, FieldContact>();
		for (const c of contacts) map.set(`${c.contactType}:${c.id}`, c);
		return map;
	}, [contacts]);

	const groups = useMemo(() => groupAgenda(agenda, new Date()), [agenda]);

	const contactOf = (i: Interaction): FieldContact | undefined =>
		i.clientId ? contactById.get(`client:${i.clientId}`) : contactById.get(`supplier:${i.supplierId}`);

	const handleDone = async (i: Interaction) => {
		setBusyId(i.id);
		setError('');
		try {
			await markNextStepDone(i.id);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível marcar como feito.');
		} finally {
			setBusyId(null);
		}
	};

	const handleReschedule = async (i: Interaction, days: number) => {
		setBusyId(i.id);
		setError('');
		try {
			const base = new Date();
			base.setDate(base.getDate() + days);
			base.setHours(12, 0, 0, 0);
			await rescheduleNextStep(i.id, base.toISOString());
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível reagendar.');
		} finally {
			setBusyId(null);
		}
	};

	const renderItem = (i: Interaction) => {
		const contact = contactOf(i);
		return (
			<div key={i.id} className="rounded-2xl border border-border bg-card p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold text-foreground">{contact?.name ?? 'Contato removido'}</p>
						{contact && (
							<span className="mt-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
								{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
							</span>
						)}
						<p className="mt-1 text-sm text-muted-foreground">{i.nextStep}</p>
						<p className="mt-1 text-xs text-muted-foreground">{dueLabel(i.nextStepDueAt)}</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-2">
						<button
							type="button"
							disabled={busyId === i.id}
							onClick={() => void handleDone(i)}
							className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
							Feito
						</button>
						<button
							type="button"
							disabled={busyId === i.id}
							onClick={() => void handleReschedule(i, 1)}
							className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-50">
							+1 dia
						</button>
					</div>
				</div>
			</div>
		);
	};

	const isEmpty = agenda.length === 0;

	return (
		<div className="space-y-5">
			{error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
			{isEmpty && <p className="text-sm text-muted-foreground">Nenhum follow-up marcado.</p>}
			{GROUP_TITLES.map(({ key, title, accent }) => {
				const items = groups[key];
				if (items.length === 0) return null;
				if (key === 'later' && !laterOpen) {
					return (
						<button
							key={key}
							type="button"
							onClick={() => setLaterOpen(true)}
							className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Mais tarde · {items.length} — mostrar
						</button>
					);
				}
				return (
					<section key={key} className="space-y-2">
						<h3 className={`text-xs font-semibold uppercase tracking-[0.2em] ${accent ?? 'text-muted-foreground'}`}>
							{title} · {items.length}
						</h3>
						{items.map(renderItem)}
					</section>
				);
			})}
		</div>
	);
};

export default AgendaView;
```

- [ ] **Step 2: Ligar no FieldPage**

Em `FieldPage.tsx`, substituir o placeholder `{!loading && view === 'agenda' && (<p …/>)}` por:

```tsx
			{!loading && view === 'agenda' && (
				<AgendaView agenda={agenda} contacts={contacts} onChanged={() => void reloadField()} />
			)}
```

com `import AgendaView from './AgendaView';` no topo. Remover o `void products; void onReload;` só quando o último placeholder sair (Task 13).

- [ ] **Step 3: Gate**

Run: `npx tsc -b && npm test` → 0 erros; suíte verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/field/AgendaView.tsx src/components/field/FieldPage.tsx
git commit -m "feat(campo): AgendaView com grupos por dia local, feito e reagendar"
```

---

### Task 11: QuickLogModal (registro em 30s) + botão fixo

**Files:**
- Create: `src/components/field/QuickLogModal.tsx`
- Modify: `src/components/field/FieldPage.tsx` (botão "+ Registrar visita" + modal)

**Interfaces:**
- Consumes: `registerInteraction`, `quickCreateContact` (Tasks 7–8), tipos da Task 5.
- Produces: `QuickLogModal` com props `{ open: boolean; tenantId?: string; contacts: FieldContact[]; products: Product[]; presetContact?: FieldContact | null; onClose: () => void; onSaved: () => void }`. A ficha (Task 13) reusa com `presetContact`.

- [ ] **Step 1: Criar `src/components/field/QuickLogModal.tsx`**

Fluxo em uma tela (mockup): busca/seleção de contato (com criação inline nome+cidade+papel), tipo (default `visit`), resultado opcional (1 toque), amostras (SKU + qtd com datalist dos produtos), próximo passo (texto + atalhos amanhã/3 dias/próx. semana/data), nota, salvar. Aviso de estoque insuficiente inline ANTES de salvar (comparando com `products.qty`) e aviso pós-salvar com `negativeSkus` — nunca bloquear.

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { ContactType, FieldContact, InteractionKind, InteractionOutcome, Product } from '../../types';
import { mergeSamples, quickCreateContact, registerInteraction, type SampleInput } from '../../services/fieldService';

type Props = {
	open: boolean;
	tenantId?: string;
	contacts: FieldContact[];
	products: Product[];
	presetContact?: FieldContact | null;
	onClose: () => void;
	onSaved: () => void;
};

const KINDS: { value: InteractionKind; label: string }[] = [
	{ value: 'visit', label: 'Visita' },
	{ value: 'call', label: 'Ligação' },
	{ value: 'whatsapp', label: 'WhatsApp' },
	{ value: 'email', label: 'E-mail' },
];

const OUTCOMES: { value: InteractionOutcome; label: string }[] = [
	{ value: 'interested', label: 'Interessado' },
	{ value: 'proposal_requested', label: 'Pediu proposta' },
	{ value: 'undecided', label: 'Indeciso' },
	{ value: 'not_interested', label: 'Sem interesse' },
	{ value: 'buyer_absent', label: 'Comprador ausente' },
];

const NEXT_STEP_PRESETS: { label: string; days: number }[] = [
	{ label: 'amanhã', days: 1 },
	{ label: 'em 3 dias', days: 3 },
	{ label: 'próx. semana', days: 7 },
];

const chipClass = (active: boolean) =>
	`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground';
const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

const inDays = (days: number): string => {
	const d = new Date();
	d.setDate(d.getDate() + days);
	d.setHours(12, 0, 0, 0);
	return d.toISOString();
};

export const QuickLogModal = ({ open, tenantId, contacts, products, presetContact, onClose, onSaved }: Props) => {
	const [contact, setContact] = useState<FieldContact | null>(null);
	const [search, setSearch] = useState('');
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState('');
	const [newCity, setNewCity] = useState('');
	const [newType, setNewType] = useState<ContactType>('client');
	const [kind, setKind] = useState<InteractionKind>('visit');
	const [outcome, setOutcome] = useState<InteractionOutcome | null>(null);
	const [samples, setSamples] = useState<SampleInput[]>([]);
	const [sampleSku, setSampleSku] = useState('');
	const [sampleQty, setSampleQty] = useState('1');
	const [nextStep, setNextStep] = useState('');
	const [dueAt, setDueAt] = useState<string | null>(null);
	const [dueDays, setDueDays] = useState<number | null>(null);
	const [note, setNote] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [warning, setWarning] = useState('');

	useEffect(() => {
		if (!open) return;
		setContact(presetContact ?? null);
		setSearch('');
		setCreating(false);
		setNewName('');
		setNewCity('');
		setNewType('client');
		setKind('visit');
		setOutcome(null);
		setSamples([]);
		setSampleSku('');
		setSampleQty('1');
		setNextStep('');
		setDueAt(null);
		setDueDays(null);
		setNote('');
		setSaving(false);
		setError('');
		setWarning('');
	}, [open, presetContact]);

	const stockBySku = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of products) map.set(p.sku.trim().toUpperCase(), p.qty);
		return map;
	}, [products]);

	const matches = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return [];
		return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
	}, [contacts, search]);

	const merged = useMemo(() => mergeSamples(samples), [samples]);
	const lowStock = merged.filter((s) => (stockBySku.get(s.sku) ?? 0) < s.qty).map((s) => s.sku);

	if (!open) return null;

	const addSample = () => {
		const qty = Number(sampleQty);
		if (!sampleSku.trim() || !Number.isFinite(qty) || qty <= 0) return;
		setSamples((current) => [...current, { sku: sampleSku, qty }]);
		setSampleSku('');
		setSampleQty('1');
	};

	const handleSave = async () => {
		if (!tenantId) return;
		setSaving(true);
		setError('');
		try {
			let target = contact;
			if (!target && creating) {
				if (!newName.trim()) throw new Error('Informe o nome do novo contato.');
				const created = await quickCreateContact(tenantId, newType, newName, newCity);
				target = {
					contactType: newType,
					id: created.id,
					tenantId,
					name: newName.trim(),
					manualStage: null,
					stageOverriddenAt: null,
					lastInteractionAt: null,
					hasTransaction: false,
					lastOutcome: null,
					hasSamples: false,
					hasInteraction: false,
					lastFactAt: null,
				};
			}
			if (!target) throw new Error('Escolha ou crie um contato.');

			const result = await registerInteraction({
				tenantId,
				clientId: target.contactType === 'client' ? target.id : null,
				supplierId: target.contactType === 'supplier' ? target.id : null,
				kind,
				outcome,
				note: note || null,
				nextStep: nextStep || null,
				nextStepDueAt: dueAt,
				samples,
			});
			if (result.negativeSkus.length > 0) {
				setWarning(`Estoque ficou negativo: ${result.negativeSkus.join(', ')} — confira no relatório.`);
			}
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível registrar.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
			<div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-lg font-bold text-foreground">Registrar visita</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-secondary px-3 py-1 text-sm">
						✕
					</button>
				</div>

				<div className="space-y-4">
					<div>
						<span className={labelClass}>Contato</span>
						{contact ? (
							<div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
								<span className="text-sm font-medium">{contact.name}</span>
								<button type="button" className="text-xs text-muted-foreground" onClick={() => setContact(null)}>
									trocar
								</button>
							</div>
						) : creating ? (
							<div className="mt-2 space-y-2">
								<input className={fieldClass} placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
								<input className={fieldClass} placeholder="Cidade" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
								<div className="flex gap-2">
									<button type="button" className={chipClass(newType === 'client')} onClick={() => setNewType('client')}>
										Cliente
									</button>
									<button type="button" className={chipClass(newType === 'supplier')} onClick={() => setNewType('supplier')}>
										Fornecedor
									</button>
									<button type="button" className="ml-auto text-xs text-muted-foreground" onClick={() => setCreating(false)}>
										cancelar
									</button>
								</div>
							</div>
						) : (
							<div className="mt-2">
								<input
									className={fieldClass}
									placeholder="Buscar por nome…"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
								/>
								{matches.map((m) => (
									<button
										key={`${m.contactType}:${m.id}`}
										type="button"
										onClick={() => setContact(m)}
										className="mt-1 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-left text-sm">
										<span>{m.name}</span>
										<span className="text-[11px] text-muted-foreground">
											{m.contactType === 'client' ? 'cliente' : 'fornecedor'}
										</span>
									</button>
								))}
								<button type="button" className="mt-2 text-xs font-semibold text-foreground" onClick={() => setCreating(true)}>
									+ novo contato
								</button>
							</div>
						)}
					</div>

					<div>
						<span className={labelClass}>Tipo</span>
						<div className="mt-2 flex flex-wrap gap-2">
							{KINDS.map((k) => (
								<button key={k.value} type="button" className={chipClass(kind === k.value)} onClick={() => setKind(k.value)}>
									{k.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className={labelClass}>Resultado</span>
						<div className="mt-2 flex flex-wrap gap-2">
							{OUTCOMES.map((o) => (
								<button
									key={o.value}
									type="button"
									className={chipClass(outcome === o.value)}
									onClick={() => setOutcome(outcome === o.value ? null : o.value)}>
									{o.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className={labelClass}>Amostras deixadas (baixa o estoque)</span>
						{merged.map((s) => (
							<div key={s.sku} className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
								<span>{s.sku}</span>
								<span className="font-semibold">{s.qty}</span>
							</div>
						))}
						{lowStock.length > 0 && (
							<p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
								Estoque insuficiente no app: {lowStock.join(', ')} — o registro segue mesmo assim.
							</p>
						)}
						<div className="mt-2 flex gap-2">
							<input
								className={`${fieldClass} mt-0 flex-1`}
								placeholder="SKU"
								list="field-skus"
								value={sampleSku}
								onChange={(e) => setSampleSku(e.target.value)}
							/>
							<datalist id="field-skus">
								{products.map((p) => (
									<option key={p.id} value={p.sku}>{p.name}</option>
								))}
							</datalist>
							<input
								className={`${fieldClass} mt-0 w-20`}
								type="number"
								min={1}
								value={sampleQty}
								onChange={(e) => setSampleQty(e.target.value)}
							/>
							<button type="button" onClick={addSample} className="rounded-xl border border-border px-3 text-sm">
								+
							</button>
						</div>
					</div>

					<div>
						<span className={labelClass}>Próximo passo (opcional)</span>
						<input
							className={fieldClass}
							placeholder="O que fazer em seguida…"
							value={nextStep}
							onChange={(e) => setNextStep(e.target.value)}
						/>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							{NEXT_STEP_PRESETS.map((p) => (
								<button
									key={p.days}
									type="button"
									className={chipClass(dueDays === p.days)}
									onClick={() => {
										setDueDays(p.days);
										setDueAt(inDays(p.days));
									}}>
									{p.label}
								</button>
							))}
							<input
								type="date"
								className={`${fieldClass} mt-0 w-auto`}
								onChange={(e) => {
									setDueDays(null);
									setDueAt(e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null);
								}}
							/>
						</div>
					</div>

					<div>
						<span className={labelClass}>Nota (opcional)</span>
						<textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
					</div>

					{error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
					{warning && (
						<p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{warning}</p>
					)}

					<button
						type="button"
						disabled={saving}
						onClick={() => void handleSave()}
						className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
						{saving ? 'Salvando…' : 'Salvar visita'}
					</button>
				</div>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Botão fixo + modal no FieldPage**

Em `FieldPage.tsx`: estado `const [logOpen, setLogOpen] = useState(false);`; antes do fechamento do `<div className="space-y-6">`:

```tsx
			<button
				type="button"
				onClick={() => setLogOpen(true)}
				className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-3rem)] max-w-md -translate-x-1/2 rounded-2xl bg-primary py-3.5 text-center text-sm font-bold text-primary-foreground shadow-[var(--shadow-card)] sm:static sm:translate-x-0 sm:w-auto sm:px-6">
				+ Registrar visita
			</button>
			<QuickLogModal
				open={logOpen}
				tenantId={tenantId}
				contacts={contacts}
				products={products}
				onClose={() => setLogOpen(false)}
				onSaved={() => {
					void reloadField();
					onReload();
				}}
			/>
```

(`onReload()` do Dashboard: o débito de estoque precisa refletir em Produtos.) Import: `import { QuickLogModal } from './QuickLogModal';`. Remover `void products; void onReload;`.

- [ ] **Step 3: Gate**

Run: `npx tsc -b && npm test` → 0 erros; suíte verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/field/QuickLogModal.tsx src/components/field/FieldPage.tsx
git commit -m "feat(campo): registro rápido em uma tela com amostras e próximo passo"
```

---

### Task 12: FunnelView (estágio derivado + filtro por papel)

**Files:**
- Create: `src/components/field/FunnelView.tsx`
- Modify: `src/components/field/FieldPage.tsx` (substituir o placeholder do funil)

**Interfaces:**
- Consumes: `deriveStage`, `STAGE_ORDER`, `STAGE_LABELS` (Task 5).
- Produces: `FunnelView` com props `{ contacts: FieldContact[]; onOpenContact: (c: FieldContact) => void }` — `onOpenContact` abre a ficha (Task 13; até lá, FieldPage passa um no-op).

- [ ] **Step 1: Criar `src/components/field/FunnelView.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { ContactStage, FieldContact } from '../../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from '../../utils/stageDerivation';

type Props = {
	contacts: FieldContact[];
	onOpenContact: (c: FieldContact) => void;
};

type RoleFilter = 'all' | 'client' | 'supplier';

const STALE_DAYS = 5; // ⚠ visual a partir de 5 dias sem contato (constante de UI, spec)

const daysSince = (iso: string | null): number | null => {
	if (!iso) return null;
	return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
};

const chipClass = (active: boolean) =>
	`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
		active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
	}`;

const FunnelView = ({ contacts, onOpenContact }: Props) => {
	const [role, setRole] = useState<RoleFilter>('all');

	const grouped = useMemo(() => {
		const groups = new Map<ContactStage, { contact: FieldContact; overridden: boolean }[]>();
		for (const stage of STAGE_ORDER) groups.set(stage, []);
		for (const contact of contacts) {
			if (role !== 'all' && contact.contactType !== role) continue;
			const { stage, overridden } = deriveStage(contact);
			groups.get(stage)?.push({ contact, overridden });
		}
		return groups;
	}, [contacts, role]);

	return (
		<div className="space-y-5">
			<div className="flex gap-2">
				<button type="button" className={chipClass(role === 'all')} onClick={() => setRole('all')}>
					Todos
				</button>
				<button type="button" className={chipClass(role === 'client')} onClick={() => setRole('client')}>
					Clientes
				</button>
				<button type="button" className={chipClass(role === 'supplier')} onClick={() => setRole('supplier')}>
					Fornecedores
				</button>
			</div>

			{STAGE_ORDER.map((stage) => {
				const items = grouped.get(stage) ?? [];
				if (items.length === 0) return null;
				return (
					<section key={stage} className="space-y-2">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage]}</h3>
							<span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold">{items.length}</span>
						</div>
						{items.map(({ contact, overridden }) => {
							const days = daysSince(contact.lastInteractionAt);
							return (
								<button
									key={`${contact.contactType}:${contact.id}`}
									type="button"
									onClick={() => onOpenContact(contact)}
									className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left">
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-foreground">{contact.name}</p>
										<p className="text-xs text-muted-foreground">
											{days === null
												? 'sem interação'
												: `há ${days} ${days === 1 ? 'dia' : 'dias'}${days >= STALE_DAYS ? ' ⚠' : ''}`}
											{overridden ? ' · marcado à mão' : ''}
										</p>
									</div>
									<span className="ml-3 shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold">
										{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
									</span>
								</button>
							);
						})}
					</section>
				);
			})}

			{contacts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato ainda.</p>}
		</div>
	);
};

export default FunnelView;
```

- [ ] **Step 2: Ligar no FieldPage**

Substituir o placeholder do funil por:

```tsx
			{!loading && view === 'funnel' && <FunnelView contacts={contacts} onOpenContact={() => {}} />}
```

Import: `import FunnelView from './FunnelView';`. (O no-op de `onOpenContact` é trocado pela ficha na Task 13.)

- [ ] **Step 3: Gate**

Run: `npx tsc -b && npm test` → 0 erros; suíte verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/field/FunnelView.tsx src/components/field/FieldPage.tsx
git commit -m "feat(campo): funil por estágio derivado com filtro de papel e alerta de contato parado"
```

---

### Task 13: ContactSheet (ficha com timeline) + SuppliersView + integração ClientsPage

**Files:**
- Create: `src/components/field/ContactSheet.tsx`
- Create: `src/components/field/SuppliersView.tsx`
- Modify: `src/components/field/FieldPage.tsx` (fornecedores + abrir ficha do funil)
- Modify: `src/components/ClientsPage.tsx` (tocar num cliente → ficha)

**Interfaces:**
- Consumes: `fetchContactInteractions`, `setManualStage` (Task 8), `QuickLogModal` (Task 11), `deriveStage`/`STAGE_LABELS`/`STAGE_ORDER` (Task 5), `quickCreateContact` (Task 8).
- Produces: `ContactSheet` com props `{ open: boolean; tenantId?: string; contact: FieldContact | null; products: Product[]; onClose: () => void; onChanged: () => void }`; `SuppliersView` com props `{ suppliers: FieldContact[]; tenantId?: string; onOpenContact: (c: FieldContact) => void; onCreated: () => void }`.

- [ ] **Step 1: Criar `src/components/field/ContactSheet.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ContactStage, FieldContact, Interaction, Product } from '../../types';
import { deriveStage, STAGE_LABELS, STAGE_ORDER } from '../../utils/stageDerivation';
import { fetchContactInteractions, setManualStage } from '../../services/fieldService';
import { QuickLogModal } from './QuickLogModal';

type Props = {
	open: boolean;
	tenantId?: string;
	contact: FieldContact | null;
	products: Product[];
	onClose: () => void;
	onChanged: () => void;
};

const KIND_LABELS: Record<Interaction['kind'], string> = {
	visit: 'Visita',
	call: 'Ligação',
	whatsapp: 'WhatsApp',
	email: 'E-mail',
};

const OUTCOME_LABELS: Record<NonNullable<Interaction['outcome']>, string> = {
	interested: 'interessado',
	proposal_requested: 'pediu proposta',
	undecided: 'indeciso',
	not_interested: 'sem interesse',
	buyer_absent: 'comprador ausente',
};

const dateLabel = (iso: string): string =>
	new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

const ContactSheet = ({ open, tenantId, contact, products, onClose, onChanged }: Props) => {
	const [timeline, setTimeline] = useState<Interaction[]>([]);
	const [loading, setLoading] = useState(false);
	const [stagePickerOpen, setStagePickerOpen] = useState(false);
	const [logOpen, setLogOpen] = useState(false);
	const [error, setError] = useState('');
	const navigate = useNavigate();

	useEffect(() => {
		if (!open || !contact || !tenantId) return;
		setLoading(true);
		setError('');
		fetchContactInteractions(tenantId, contact.contactType, contact.id)
			.then(setTimeline)
			.catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar a timeline.'))
			.finally(() => setLoading(false));
	}, [open, contact, tenantId]);

	if (!open || !contact) return null;

	const { stage, overridden } = deriveStage(contact);

	const handleStage = async (next: ContactStage | null) => {
		setError('');
		try {
			await setManualStage(contact.contactType, contact.id, next);
			setStagePickerOpen(false);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível mudar o estágio.');
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
			<div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl">
				<div className="mb-1 flex items-center justify-between">
					<h2 className="text-lg font-bold text-foreground">{contact.name}</h2>
					<button type="button" onClick={onClose} className="rounded-full bg-secondary px-3 py-1 text-sm">
						✕
					</button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold">
						{contact.contactType === 'client' ? 'cliente' : 'fornecedor'}
					</span>
					<button
						type="button"
						onClick={() => setStagePickerOpen((v) => !v)}
						className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
						{STAGE_LABELS[stage]}
						{overridden ? ' · à mão' : ''} ▾
					</button>
				</div>
				{stagePickerOpen && (
					<div className="mt-2 flex flex-wrap gap-2">
						{STAGE_ORDER.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => void handleStage(s)}
								className="rounded-full border border-border bg-card px-3 py-1 text-xs">
								{STAGE_LABELS[s]}
							</button>
						))}
						{overridden && (
							<button
								type="button"
								onClick={() => void handleStage(null)}
								className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
								voltar ao automático
							</button>
						)}
					</div>
				)}
				<p className="mt-2 text-xs text-muted-foreground">
					{[contact.city, contact.phone, contact.email].filter(Boolean).join(' · ') || 'sem dados de contato'}
				</p>

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={() => setLogOpen(true)}
						className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">
						+ Visita
					</button>
					{contact.contactType === 'client' && (
						<button
							type="button"
							onClick={() => navigate('/sales')}
							className="flex-1 rounded-2xl border border-border bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground">
							Novo pedido
						</button>
					)}
				</div>

				{error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

				<h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Timeline</h3>
				{loading && <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>}
				{!loading && timeline.length === 0 && (
					<p className="mt-2 text-sm text-muted-foreground">Nenhuma interação registrada.</p>
				)}
				<div className="mt-2 space-y-2 border-l-2 border-border pl-4">
					{timeline.map((i) => (
						<div key={i.id} className="rounded-2xl border border-border bg-card p-3">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold text-foreground">
									{KIND_LABELS[i.kind]}
									{i.outcome ? ` · ${OUTCOME_LABELS[i.outcome]}` : ''}
								</p>
								<span className="text-xs text-muted-foreground">{dateLabel(i.occurredAt)}</span>
							</div>
							{i.samples.length > 0 && (
								<p className="mt-1 text-xs text-muted-foreground">
									Amostras: {i.samples.map((s) => `${s.qty}× ${s.sku}`).join(', ')}
								</p>
							)}
							{i.nextStep && (
								<p className="mt-1 text-xs text-muted-foreground">
									Próximo passo: {i.nextStep}
									{i.nextStepDueAt ? ` (${dateLabel(i.nextStepDueAt)})` : ''}
									{i.nextStepDoneAt ? ' ✓' : ''}
								</p>
							)}
							{i.note && <p className="mt-1 text-xs text-muted-foreground">{i.note}</p>}
						</div>
					))}
				</div>
			</div>

			<QuickLogModal
				open={logOpen}
				tenantId={tenantId}
				contacts={[contact]}
				products={products}
				presetContact={contact}
				onClose={() => setLogOpen(false)}
				onSaved={onChanged}
			/>
		</div>
	);
};

export default ContactSheet;
```

- [ ] **Step 2: Criar `src/components/field/SuppliersView.tsx`**

```tsx
import { useState } from 'react';
import type { FieldContact } from '../../types';
import { quickCreateContact } from '../../services/fieldService';

type Props = {
	suppliers: FieldContact[];
	tenantId?: string;
	onOpenContact: (c: FieldContact) => void;
	onCreated: () => void;
};

const fieldClass =
	'mt-2 block w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring/60 focus:ring-2 focus:ring-ring/25';

const SuppliersView = ({ suppliers, tenantId, onOpenContact, onCreated }: Props) => {
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState('');
	const [city, setCity] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const handleCreate = async () => {
		if (!tenantId || !name.trim()) return;
		setSaving(true);
		setError('');
		try {
			await quickCreateContact(tenantId, 'supplier', name, city);
			setCreating(false);
			setName('');
			setCity('');
			onCreated();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Não foi possível criar o fornecedor.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-3">
			{suppliers.map((s) => (
				<button
					key={s.id}
					type="button"
					onClick={() => onOpenContact(s)}
					className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left">
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
						<p className="text-xs text-muted-foreground">{s.city || '—'}</p>
					</div>
				</button>
			))}
			{suppliers.length === 0 && !creating && (
				<p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
			)}

			{creating ? (
				<div className="rounded-2xl border border-border bg-card p-4">
					<input className={fieldClass} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
					<input className={fieldClass} placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
					{error && <p className="mt-2 text-sm text-red-700">{error}</p>}
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							disabled={saving}
							onClick={() => void handleCreate()}
							className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
							Salvar
						</button>
						<button
							type="button"
							onClick={() => setCreating(false)}
							className="rounded-xl border border-border px-4 text-sm text-muted-foreground">
							Cancelar
						</button>
					</div>
				</div>
			) : (
				<button type="button" onClick={() => setCreating(true)} className="text-sm font-semibold text-foreground">
					+ Novo fornecedor
				</button>
			)}
		</div>
	);
};

export default SuppliersView;
```

- [ ] **Step 3: Ligar tudo no FieldPage**

Em `FieldPage.tsx`:
- Estado: `const [sheetContact, setSheetContact] = useState<FieldContact | null>(null);`
- Funil: `onOpenContact={(c) => setSheetContact(c)}` (substitui o no-op).
- Fornecedores (substitui o placeholder):

```tsx
			{!loading && view === 'suppliers' && (
				<SuppliersView
					suppliers={contacts.filter((c) => c.contactType === 'supplier')}
					tenantId={tenantId}
					onOpenContact={(c) => setSheetContact(c)}
					onCreated={() => void reloadField()}
				/>
			)}
```

- Ficha, junto ao QuickLogModal:

```tsx
			<ContactSheet
				open={sheetContact !== null}
				tenantId={tenantId}
				contact={sheetContact}
				products={products}
				onClose={() => setSheetContact(null)}
				onChanged={() => {
					void reloadField();
					onReload();
				}}
			/>
```

Imports: `import SuppliersView from './SuppliersView';` e `import ContactSheet from './ContactSheet';`.

- [ ] **Step 4: Integração na ClientsPage**

Em `src/components/ClientsPage.tsx`: hoje tocar num cliente abre o `ClientFormModal` de edição. Passar a abrir a **ficha** com um botão explícito de editar dentro dela é mudança maior — nesta fatia, o toque no cliente continua abrindo a edição E ganha um caminho novo para a ficha: adicionar em cada linha/card de cliente um botão secundário "Ficha" que abre `ContactSheet`. Implementação:

1. Imports: `import ContactSheet from './field/ContactSheet';` e `import type { FieldContact } from '../types';`.
2. Estado: `const [sheetContact, setSheetContact] = useState<FieldContact | null>(null);`.
3. Helper local (Client → FieldContact mínimo; a ficha só usa identidade + timeline):

```tsx
	const toFieldContact = (c: Client): FieldContact => ({
		contactType: 'client',
		id: c.id,
		tenantId: tenantId ?? '',
		name: c.nome,
		city: c.cidade || undefined,
		phone: c.telefone,
		email: c.email,
		manualStage: null,
		stageOverriddenAt: null,
		lastInteractionAt: null,
		hasTransaction: !!c.ultimaCompra,
		lastOutcome: null,
		hasSamples: false,
		hasInteraction: false,
		lastFactAt: null,
	});
```

	Nota: o estágio mostrado na ficha aberta por AQUI fica aproximado (fatos ausentes no tipo `Client`); o caminho canônico é o funil. Registrar isso em comentário no código.
4. Botão "Ficha" (tanto no card mobile quanto na linha desktop, junto ao botão de editar existente): `onClick={() => setSheetContact(toFieldContact(cliente))}`.
5. Render do `ContactSheet` no fim, com `products={[]}` e `onChanged={onReload}`.

- [ ] **Step 5: Gate**

Run: `npx tsc -b && npm test` → 0 erros; suíte verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/field/ContactSheet.tsx src/components/field/SuppliersView.tsx src/components/field/FieldPage.tsx src/components/ClientsPage.tsx
git commit -m "feat(campo): ficha do contato com timeline, fornecedores e acesso pela ClientsPage"
```

---

### Task 14: Gate final — typecheck, suíte, build, roteiro e2e e PR

**Files:**
- Create: `docs/superpowers/runbooks/2026-08-26-campo-fatia1-e2e.md`
- Modify: descrição do PR #73 (via `gh`)

- [ ] **Step 1: Gates completos**

Run: `npx tsc -b && npm test && npm run build`
Expected: tudo verde (build inclui o typecheck; rodar mesmo assim os três).

- [ ] **Step 2: Escrever o roteiro e2e manual**

Criar `docs/superpowers/runbooks/2026-08-26-campo-fatia1-e2e.md`:

```markdown
# E2E manual — Campo fatia 1

Pré: aplicar as 4 migrations 20260826* no Supabase do app (SQL Editor, em ordem).
Dados: tenant de teste com 2+ produtos importados.

1. Aba Campo aparece na navegação; abre na Agenda vazia ("Nenhum follow-up marcado").
2. + Registrar visita → criar contato novo (cliente, nome+cidade) → resultado
   "Interessado" → 1 amostra de SKU existente (qty 2) → próximo passo "voltar"
   em 3 dias → salvar. Sem erro.
3. Produtos: qty do SKU caiu 2. (Débito de amostra.)
4. Agenda: item em "Esta semana" com o contato e o passo. "Feito" o remove.
5. Funil: contato em "Amostra entregue" (estágio derivado). Registrar nova
   interação com "Pediu proposta" → contato move para "Negociando".
6. Ficha (tocar no card do funil): timeline com as 2 interações e amostras.
7. Override: na ficha, mudar estágio para "Perdido" → funil mostra "marcado à
   mão". Registrar nova interação → volta ao derivado (override expira).
8. Fornecedores: criar "Noronha Pescados" → aparece na lista; registrar
   interação de ligação nela; funil (filtro Fornecedores) mostra "Contatado".
9. Amostra com qty maior que o estoque → aviso âmbar aparece e o registro salva
   mesmo assim (estoque fica negativo em Produtos).
10. ClientsPage: botão "Ficha" abre a timeline do cliente.
```

- [ ] **Step 3: Atualizar o PR**

```bash
git push
gh pr ready 73
gh pr edit 73 --body "$(cat <<'PRBODY'
## Campo fatia 1 — contatos, interações e agenda

Spec: docs/superpowers/specs/2026-08-26-campo-fatia1-design.md (obra de 5 fatias, epic WAR-1; esta é WAR-2).

### O que entra
- suppliers + prospects em clients (colunas de estágio nas duas)
- interactions (arco exclusivo) + interaction_samples; amostra debita estoque via RPC register_interaction (avisa sem bloquear)
- view field_contacts (fatos crus) + deriveStage em TS (7 regras testadas)
- Aba Campo: Agenda (atrasados/hoje/semana/mais tarde), registro rápido em 30s, Funil por estágio derivado c/ override visível, Fornecedores, Ficha com timeline

### Handoffs (antes do merge em prod)
- [ ] Aplicar as 4 migrations 20260826* no Supabase do app
- [ ] E2E manual: docs/superpowers/runbooks/2026-08-26-campo-fatia1-e2e.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
)"
```

- [ ] **Step 4: Commit do runbook**

```bash
git add docs/superpowers/runbooks/2026-08-26-campo-fatia1-e2e.md
git commit -m "docs(campo): roteiro e2e manual da fatia 1"
git push
```
