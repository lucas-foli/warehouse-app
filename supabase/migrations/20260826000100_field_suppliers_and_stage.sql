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
