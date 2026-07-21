-- Phase 6: attribute each sale to a store so revenue can be filtered by location.
-- Pre-existing orders keep location = null (unattributed; show only under "Todos os locais").

alter table public.sales_orders add column if not exists location text;

create index if not exists sales_orders_tenant_location_idx
  on public.sales_orders (tenant_id, location);

-- Re-create register_sale_order with a new p_location parameter. The old 5-arg
-- signature must be dropped first (adding a defaulted param would otherwise create
-- an ambiguous overload).
drop function if exists public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid);

create or replace function public.register_sale_order(
	p_tenant_id uuid,
	p_items jsonb,
	p_sold_at timestamptz default now(),
	p_client_id uuid default null,
	p_seller_id uuid default null,
	p_location text default null
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
	v_next bigint;
	v_order_number text;
	v_order_id uuid;
	v_total numeric := 0;
	v_has_price boolean := true;
	v_order public.sales_orders%rowtype;
	v_item record;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
		raise exception using message = 'sale_items_required';
	end if;

	perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

	select coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')::bigint), 0) + 1
	into v_next
	from public.sales_orders
	where tenant_id = p_tenant_id and order_number like 'V-%';

	v_order_number := 'V-' || lpad(v_next::text, 4, '0');

	insert into public.sales_orders (tenant_id, order_number, client_id, seller_id, sold_at, total_amount, status, location)
	values (p_tenant_id, v_order_number, p_client_id, p_seller_id, coalesce(p_sold_at, now()), null, 'manual', nullif(btrim(coalesce(p_location, '')), ''))
	returning id into v_order_id;

	for v_item in
		with raw as (
			select
				upper(trim(elem->>'sku')) as sku,
				(elem->>'qty')::int as qty,
				nullif(elem->>'unit_price', '')::numeric as unit_price,
				ord
			from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
		),
		merged as (
			select
				r.sku,
				sum(r.qty) as qty,
				(select r2.unit_price from raw r2
				 where r2.sku = r.sku and r2.unit_price is not null
				 order by r2.ord desc limit 1) as unit_price
			from raw r
			group by r.sku
		)
		select * from merged
	loop
		if v_item.sku = '' or v_item.sku is null then
			raise exception using message = 'sales_item_sku_required';
		end if;
		if v_item.qty is null or v_item.qty <= 0 then
			raise exception using message = 'sale_qty_invalid';
		end if;

		insert into public.sales_items (tenant_id, order_id, order_number, sku, qty, unit_price, total_price)
		values (
			p_tenant_id, v_order_id, v_order_number, v_item.sku, v_item.qty, v_item.unit_price,
			case when v_item.unit_price is null then null else round(v_item.unit_price * v_item.qty, 2) end
		);

		update public.products
		set qty = qty - v_item.qty,
			total_sold = coalesce(total_sold, 0) + v_item.qty,
			updated_at = now()
		where tenant_id = p_tenant_id
			and upper(sku) = v_item.sku
			and coalesce(is_active, true) = true;

		if v_item.unit_price is null then
			v_has_price := false;
		else
			v_total := v_total + round(v_item.unit_price * v_item.qty, 2);
		end if;
	end loop;

	update public.sales_orders
	set total_amount = case when v_has_price then v_total else null end,
		updated_at = now()
	where id = v_order_id
	returning * into v_order;

	return v_order;
end;
$$;

revoke all on function public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid, text) from public;
grant execute on function public.register_sale_order(uuid, jsonb, timestamptz, uuid, uuid, text) to authenticated;
