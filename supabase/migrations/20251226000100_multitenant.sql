-- Multi-tenant foundation for warehouse-app (subdomain-based)

create extension if not exists pgcrypto;

-- Tenants (one row per company/subdomain)
create table if not exists public.tenants (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique,
	company_name text not null,
	logo_url text,
	primary_color text not null default '#394e6b',
	secondary_color text not null default '#46b280',
	ui_preset text not null default 'clean',
	theme_tokens jsonb not null default '{}'::jsonb,
	is_onboarded boolean not null default false,
	allow_self_signup boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.tenants add column if not exists ui_preset text not null default 'clean';
alter table public.tenants add column if not exists theme_tokens jsonb not null default '{}'::jsonb;

-- Basic member mapping (auth.users -> tenant)
create table if not exists public.tenant_members (
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null default 'member' check (role in ('admin', 'member')),
	created_at timestamptz not null default now(),
	primary key (tenant_id, user_id)
);

-- Helper to avoid RLS recursion when checking admin membership.
-- NOTE: created as SECURITY DEFINER so it can be used safely inside RLS policies.
create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.tenant_members tm
		where tm.tenant_id = target_tenant_id
			and tm.user_id = auth.uid()
			and tm.role = 'admin'
	);
$$;

-- Seed a default tenant for localhost / fallback flows.
insert into public.tenants (slug, company_name, logo_url, primary_color, secondary_color, is_onboarded)
values (
	'default',
	'Stanley',
	'/Stanley Brandmark Horizontal.avif',
	'#394e6b',
	'#46b280',
	false
)
on conflict (slug) do nothing;

-- Products (minimal schema used by the app)
create table if not exists public.products (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid references public.tenants (id) on delete cascade,
	sku text not null,
	name text not null,
	barcode text,
	status text not null default 'ESTOQUE',
	location text not null default 'Brasília Shopping',
	qty integer not null default 0,
	min integer,
	price numeric,
	total_sold integer,
	image text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Attach products to a tenant (if the products table exists).
do $$
declare
	default_tenant_id uuid;
begin
	select id into default_tenant_id from public.tenants where slug = 'default';

	if exists (
		select 1
		from information_schema.tables
		where table_schema = 'public' and table_name = 'products'
	) then
		alter table public.products add column if not exists tenant_id uuid references public.tenants (id);
		create index if not exists products_tenant_id_idx on public.products (tenant_id);
		create unique index if not exists products_tenant_id_sku_uidx on public.products (tenant_id, sku);

		-- Best-effort backfill: assign existing rows to the default tenant.
		update public.products set tenant_id = default_tenant_id where tenant_id is null;
	end if;
end $$;

-- RLS
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

do $$
begin
	if exists (
		select 1
		from information_schema.tables
		where table_schema = 'public' and table_name = 'products'
	) then
		alter table public.products enable row level security;
	end if;
end $$;

-- Tenants: branding is readable to everyone (including anon) so the login page can be themed.
drop policy if exists "Tenants are readable" on public.tenants;
create policy "Tenants are readable"
on public.tenants
for select
using (true);

-- Tenants: only admins can update.
drop policy if exists "Tenant admins can update" on public.tenants;
create policy "Tenant admins can update"
on public.tenants
for update
using (
	public.is_tenant_admin(tenants.id)
)
with check (
	public.is_tenant_admin(tenants.id)
);

-- Tenant members: users can read their own memberships; admins can list members for their tenant.
drop policy if exists "Members can read own membership" on public.tenant_members;
create policy "Members can read own membership"
on public.tenant_members
for select
using (user_id = auth.uid());

drop policy if exists "Tenant admins can list members" on public.tenant_members;
create policy "Tenant admins can list members"
on public.tenant_members
for select
using (
	public.is_tenant_admin(tenant_members.tenant_id)
);

-- Tenant members: admins can add/remove members; optional self-signup if the tenant allows it.
drop policy if exists "Tenant admins can add members" on public.tenant_members;
create policy "Tenant admins can add members"
on public.tenant_members
for insert
with check (
	public.is_tenant_admin(tenant_members.tenant_id)
);

drop policy if exists "Members can self-join when allowed" on public.tenant_members;
create policy "Members can self-join when allowed"
on public.tenant_members
for insert
with check (
	user_id = auth.uid()
	and exists (
		select 1
		from public.tenants t
		where t.id = tenant_members.tenant_id
			and t.allow_self_signup = true
	)
);

drop policy if exists "Tenant admins can remove members" on public.tenant_members;
create policy "Tenant admins can remove members"
on public.tenant_members
for delete
using (
	public.is_tenant_admin(tenant_members.tenant_id)
);

-- Products: members can read; admins can write.
do $$
begin
	if exists (
		select 1
		from information_schema.tables
		where table_schema = 'public' and table_name = 'products'
	) then
		drop policy if exists "Tenant members can read products" on public.products;
		create policy "Tenant members can read products"
		on public.products
		for select
		using (
			exists (
				select 1
				from public.tenant_members tm
				where tm.tenant_id = products.tenant_id
					and tm.user_id = auth.uid()
			)
		);

		drop policy if exists "Tenant admins can write products" on public.products;
		create policy "Tenant admins can write products"
		on public.products
		for all
		using (
			exists (
				select 1
				from public.tenant_members tm
				where tm.tenant_id = products.tenant_id
					and tm.user_id = auth.uid()
					and tm.role = 'admin'
			)
		)
		with check (
			exists (
				select 1
				from public.tenant_members tm
				where tm.tenant_id = products.tenant_id
					and tm.user_id = auth.uid()
					and tm.role = 'admin'
			)
		);
	end if;
end $$;
