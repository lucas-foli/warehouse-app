-- Products: add explicit image URL and active flag.
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists is_active boolean not null default true;

-- Backfill image_url from legacy image column when needed.
update public.products
set image_url = nullif(image, '')
where coalesce(nullif(image_url, ''), '') = ''
	and coalesce(nullif(image, ''), '') <> '';

-- Preserve inactive semantics when status already indicates deactivation.
update public.products
set is_active = false
where lower(coalesce(status, '')) in ('inativo', 'inativa', 'inactive', 'desativado', 'desativada', 'arquivado', 'archived');

create index if not exists products_tenant_upper_sku_idx on public.products (tenant_id, upper(sku));

create or replace function public.validate_sales_item_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	normalized_sku text;
	matched_product_id uuid;
	sku_exists boolean;
begin
	normalized_sku := upper(trim(coalesce(new.sku, '')));
	if normalized_sku = '' then
		raise exception using message = 'sales_item_sku_required', detail = 'Each sales item requires a SKU.';
	end if;

	new.sku := normalized_sku;

	select p.id
	into matched_product_id
	from public.products p
	where p.tenant_id = new.tenant_id
		and upper(p.sku) = normalized_sku
		and coalesce(p.is_active, true) = true
	limit 1;

	if matched_product_id is null then
		select exists (
			select 1
			from public.products p
			where p.tenant_id = new.tenant_id
				and upper(p.sku) = normalized_sku
		)
		into sku_exists;

		if sku_exists then
			raise exception using message = 'sales_item_inactive_sku', detail = normalized_sku;
		else
			raise exception using message = 'sales_item_unknown_sku', detail = normalized_sku;
		end if;
	end if;

	new.product_id := matched_product_id;
	return new;
end;
$$;

drop trigger if exists sales_items_validate_product_trg on public.sales_items;
create trigger sales_items_validate_product_trg
before insert or update of tenant_id, sku
on public.sales_items
for each row
execute function public.validate_sales_item_product();
