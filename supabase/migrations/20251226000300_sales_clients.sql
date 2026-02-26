-- Clients/Sales schema (multi-tenant)

create table if not exists public.clients (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	external_id text not null,
	name text not null,
	email text,
	phone text,
	city text,
	last_purchase_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists clients_tenant_external_uidx on public.clients (tenant_id, external_id);
create index if not exists clients_tenant_id_idx on public.clients (tenant_id);

create table if not exists public.sellers (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	external_id text not null,
	name text not null,
	email text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists sellers_tenant_external_uidx on public.sellers (tenant_id, external_id);
create index if not exists sellers_tenant_id_idx on public.sellers (tenant_id);

create table if not exists public.sales_orders (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	order_number text not null,
	client_id uuid references public.clients (id) on delete set null,
	client_external_id text,
	seller_id uuid references public.sellers (id) on delete set null,
	seller_external_id text,
	status text,
	total_amount numeric,
	sold_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists sales_orders_tenant_number_uidx on public.sales_orders (tenant_id, order_number);
create index if not exists sales_orders_tenant_id_idx on public.sales_orders (tenant_id);

create table if not exists public.sales_items (
	id uuid primary key default gen_random_uuid(),
	tenant_id uuid not null references public.tenants (id) on delete cascade,
	order_id uuid references public.sales_orders (id) on delete cascade,
	order_number text not null,
	product_id uuid references public.products (id) on delete set null,
	sku text,
	qty integer not null default 1,
	unit_price numeric,
	total_price numeric,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists sales_items_tenant_id_idx on public.sales_items (tenant_id);
create index if not exists sales_items_tenant_sku_idx on public.sales_items (tenant_id, sku);
create unique index if not exists sales_items_tenant_order_sku_uidx on public.sales_items (tenant_id, order_number, sku);

alter table public.clients enable row level security;
alter table public.sellers enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_items enable row level security;

drop policy if exists "Tenant members can read clients" on public.clients;
create policy "Tenant members can read clients"
on public.clients
for select
using (
	exists (
		select 1
		from public.tenant_members tm
		where tm.tenant_id = clients.tenant_id
			and tm.user_id = auth.uid()
	)
);

drop policy if exists "Tenant admins can write clients" on public.clients;
create policy "Tenant admins can write clients"
on public.clients
for all
using (public.is_tenant_admin(clients.tenant_id))
with check (public.is_tenant_admin(clients.tenant_id));

drop policy if exists "Tenant members can read sellers" on public.sellers;
create policy "Tenant members can read sellers"
on public.sellers
for select
using (
	exists (
		select 1
		from public.tenant_members tm
		where tm.tenant_id = sellers.tenant_id
			and tm.user_id = auth.uid()
	)
);

drop policy if exists "Tenant admins can write sellers" on public.sellers;
create policy "Tenant admins can write sellers"
on public.sellers
for all
using (public.is_tenant_admin(sellers.tenant_id))
with check (public.is_tenant_admin(sellers.tenant_id));

drop policy if exists "Tenant members can read sales orders" on public.sales_orders;
create policy "Tenant members can read sales orders"
on public.sales_orders
for select
using (
	exists (
		select 1
		from public.tenant_members tm
		where tm.tenant_id = sales_orders.tenant_id
			and tm.user_id = auth.uid()
	)
);

drop policy if exists "Tenant admins can write sales orders" on public.sales_orders;
create policy "Tenant admins can write sales orders"
on public.sales_orders
for all
using (public.is_tenant_admin(sales_orders.tenant_id))
with check (public.is_tenant_admin(sales_orders.tenant_id));

drop policy if exists "Tenant members can read sales items" on public.sales_items;
create policy "Tenant members can read sales items"
on public.sales_items
for select
using (
	exists (
		select 1
		from public.tenant_members tm
		where tm.tenant_id = sales_items.tenant_id
			and tm.user_id = auth.uid()
	)
);

drop policy if exists "Tenant admins can write sales items" on public.sales_items;
create policy "Tenant admins can write sales items"
on public.sales_items
for all
using (public.is_tenant_admin(sales_items.tenant_id))
with check (public.is_tenant_admin(sales_items.tenant_id));
