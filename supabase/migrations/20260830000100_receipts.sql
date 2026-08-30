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
