-- Slice 1: single-product sale entry.
-- Atomically creates a one-line sales order and moves stock, so a registered
-- sale can never half-apply (order without stock move, or vice-versa).
--
-- Order numbers are auto-generated per tenant as 'V-NNNN' (V = venda manual),
-- kept distinct from imported order numbers and serialized with a per-tenant
-- advisory lock so concurrent admins don't collide on the unique index.

create or replace function public.register_sale(
	p_tenant_id uuid,
	p_sku text,
	p_qty integer,
	p_unit_price numeric default null,
	p_sold_at timestamptz default now(),
	p_client_id uuid default null,
	p_seller_id uuid default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
	v_next bigint;
	v_order_number text;
	v_order_id uuid;
	v_total numeric;
	v_product public.products%rowtype;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if p_qty is null or p_qty <= 0 then
		raise exception using message = 'sale_qty_invalid', detail = 'Quantity must be greater than zero.';
	end if;

	v_total := case when p_unit_price is null then null else round(p_unit_price * p_qty, 2) end;

	-- Serialize order-number generation for this tenant.
	perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

	select coalesce(max(nullif(regexp_replace(order_number, '\D', '', 'g'), '')::bigint), 0) + 1
	into v_next
	from public.sales_orders
	where tenant_id = p_tenant_id
		and order_number like 'V-%';

	v_order_number := 'V-' || lpad(v_next::text, 4, '0');

	insert into public.sales_orders (tenant_id, order_number, client_id, seller_id, sold_at, total_amount, status)
	values (p_tenant_id, v_order_number, p_client_id, p_seller_id, coalesce(p_sold_at, now()), v_total, 'manual')
	returning id into v_order_id;

	-- The sales_items_validate_product_trg trigger validates the SKU (exists +
	-- active) and fills product_id; an invalid SKU aborts the whole transaction.
	insert into public.sales_items (tenant_id, order_id, order_number, sku, qty, unit_price, total_price)
	values (p_tenant_id, v_order_id, v_order_number, p_sku, p_qty, p_unit_price, v_total);

	update public.products
	set qty = qty - p_qty,
		total_sold = coalesce(total_sold, 0) + p_qty,
		updated_at = now()
	where tenant_id = p_tenant_id
		and upper(sku) = upper(trim(p_sku))
		and coalesce(is_active, true) = true
	returning * into v_product;

	return v_product;
end;
$$;

revoke all on function public.register_sale(uuid, text, integer, numeric, timestamptz, uuid, uuid) from public;
grant execute on function public.register_sale(uuid, text, integer, numeric, timestamptz, uuid, uuid) to authenticated;
