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
