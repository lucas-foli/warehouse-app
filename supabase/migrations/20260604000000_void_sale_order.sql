-- Slice 4: void a registered sale order. Restores stock + total_sold for every
-- line whose product still exists, marks the order 'voided', all in one tx.
-- Idempotent: re-voiding raises order_already_voided (never double-restores).

create or replace function public.void_sale_order(
	p_tenant_id uuid,
	p_order_id uuid
)
returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
	v_order public.sales_orders%rowtype;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	select * into v_order
	from public.sales_orders
	where id = p_order_id and tenant_id = p_tenant_id
	for update;

	if not found then
		raise exception using message = 'order_not_found';
	end if;

	if v_order.status = 'voided' then
		raise exception using message = 'order_already_voided';
	end if;

	-- Restore stock for each line whose product still exists (deleted products
	-- have product_id = null on the item and are simply skipped).
	update public.products p
	set qty = p.qty + si.qty,
		total_sold = greatest(coalesce(p.total_sold, 0) - si.qty, 0),
		updated_at = now()
	from public.sales_items si
	where si.order_id = p_order_id
		and si.tenant_id = p_tenant_id
		and si.product_id = p.id;

	update public.sales_orders
	set status = 'voided', updated_at = now()
	where id = p_order_id and tenant_id = p_tenant_id
	returning * into v_order;

	return v_order;
end;
$$;

revoke all on function public.void_sale_order(uuid, uuid) from public;
grant execute on function public.void_sale_order(uuid, uuid) to authenticated;
