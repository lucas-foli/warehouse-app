-- Per-tenant managed lists for product fields:
--   kind 'onde'  -> physical placement (ESTOQUE / GAVETA / VITRINE ...)
--   kind 'local' -> store / location (Loja principal / Brasília Shopping ...)
-- Admins manage the values in Settings; everyone reads them to populate the
-- product "Onde"/"Local" dropdowns and the store filter.

create table if not exists public.tenant_product_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('onde', 'local')),
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Case-sensitive uniqueness; the service uppercases/trims before insert so
-- "Estoque" and "ESTOQUE" can't both be created.
create unique index if not exists tenant_product_options_unique
  on public.tenant_product_options (tenant_id, kind, value);

create index if not exists tenant_product_options_lookup
  on public.tenant_product_options (tenant_id, kind, sort_order, value);

alter table public.tenant_product_options enable row level security;

-- Members read their tenant's lists (needed for product edit dropdowns).
drop policy if exists "Members read product options" on public.tenant_product_options;
create policy "Members read product options"
  on public.tenant_product_options for select
  using (public.is_tenant_member(tenant_id));

-- Admins manage the lists.
drop policy if exists "Admins insert product options" on public.tenant_product_options;
create policy "Admins insert product options"
  on public.tenant_product_options for insert
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "Admins update product options" on public.tenant_product_options;
create policy "Admins update product options"
  on public.tenant_product_options for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "Admins delete product options" on public.tenant_product_options;
create policy "Admins delete product options"
  on public.tenant_product_options for delete
  using (public.is_tenant_admin(tenant_id));

-- Platform admin read escape hatch (parity with other tenant tables).
drop policy if exists "Platform admins read product options" on public.tenant_product_options;
create policy "Platform admins read product options"
  on public.tenant_product_options for select
  using (public.is_platform_admin());

-- Backfill from values already present on products so nothing breaks for
-- existing tenants. Distinct, non-empty values become the starting list.
-- Values are upper(btrim(...)) to match the service's normalizeOptionValue, so
-- a backfilled "Estoque" and a UI-added "ESTOQUE" can't become two entries.
insert into public.tenant_product_options (tenant_id, kind, value)
select distinct tenant_id, 'onde', upper(btrim(status))
from public.products
where tenant_id is not null and status is not null and btrim(status) <> ''
on conflict (tenant_id, kind, value) do nothing;

insert into public.tenant_product_options (tenant_id, kind, value)
select distinct tenant_id, 'local', upper(btrim(location))
from public.products
where tenant_id is not null and location is not null and btrim(location) <> ''
on conflict (tenant_id, kind, value) do nothing;
