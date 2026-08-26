-- Campo fatia 1 (3/4): registro transacional de interação + amostras + débito
-- de estoque. Padrão de register_sale_order (advisory lock desnecessário aqui:
-- não há numeração sequencial). Amostra é saída real sem receita; estoque pode
-- ficar NEGATIVO por decisão de spec — a UI avisa (negative_skus), não bloqueia.
-- Gate: is_tenant_member (registro de campo não é operação administrativa).

create or replace function public.register_interaction(
	p_tenant_id uuid,
	p_client_id uuid default null,
	p_supplier_id uuid default null,
	p_kind text default 'visit',
	p_outcome text default null,
	p_note text default null,
	p_occurred_at timestamptz default now(),
	p_next_step text default null,
	p_next_step_due_at timestamptz default null,
	p_samples jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	v_interaction_id uuid;
	v_item record;
	v_qty_after integer;
	v_product_id uuid;
	v_negative text[] := '{}';
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_member(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if num_nonnulls(p_client_id, p_supplier_id) <> 1 then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_client_id is not null and not exists (
		select 1 from public.clients c where c.id = p_client_id and c.tenant_id = p_tenant_id
	) then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_supplier_id is not null and not exists (
		select 1 from public.suppliers s where s.id = p_supplier_id and s.tenant_id = p_tenant_id
	) then
		raise exception using message = 'interaction_contact_invalid';
	end if;

	if p_kind is null or p_kind not in ('visit','call','whatsapp','email') then
		raise exception using message = 'interaction_kind_invalid';
	end if;

	if p_outcome is not null and p_outcome not in
		('interested','proposal_requested','undecided','not_interested','buyer_absent') then
		raise exception using message = 'interaction_outcome_invalid';
	end if;

	if p_samples is null or jsonb_typeof(p_samples) <> 'array' then
		raise exception using message = 'interaction_sample_qty_invalid';
	end if;

	insert into public.interactions (
		tenant_id, client_id, supplier_id, kind, outcome, note,
		occurred_at, recorded_by, next_step, next_step_due_at
	)
	values (
		p_tenant_id, p_client_id, p_supplier_id, p_kind, p_outcome, nullif(trim(p_note), ''),
		coalesce(p_occurred_at, now()), auth.uid(), nullif(trim(p_next_step), ''), p_next_step_due_at
	)
	returning id into v_interaction_id;

	-- Merge de SKUs duplicados (soma qty), como register_sale_order.
	for v_item in
		select upper(trim(r.sku)) as sku, sum(r.qty) as qty
		from (
			select elem->>'sku' as sku, (elem->>'qty')::int as qty
			from jsonb_array_elements(p_samples) as elem
		) r
		group by upper(trim(r.sku))
	loop
		if v_item.sku is null or v_item.sku = '' or v_item.qty is null or v_item.qty <= 0 then
			raise exception using message = 'interaction_sample_qty_invalid';
		end if;

		select p.id into v_product_id
		from public.products p
		where p.tenant_id = p_tenant_id and upper(trim(p.sku)) = v_item.sku
		limit 1;

		if v_product_id is null then
			raise exception using message = 'interaction_sample_sku_unknown';
		end if;

		insert into public.interaction_samples (tenant_id, interaction_id, product_id, sku, qty)
		values (p_tenant_id, v_interaction_id, v_product_id, v_item.sku, v_item.qty);

		update public.products
		set qty = qty - v_item.qty
		where id = v_product_id
		returning qty into v_qty_after;

		if v_qty_after < 0 then
			v_negative := array_append(v_negative, v_item.sku);
		end if;
	end loop;

	if p_client_id is not null then
		update public.clients
		set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'::timestamptz), coalesce(p_occurred_at, now())),
			updated_at = now()
		where id = p_client_id;
	else
		update public.suppliers
		set last_interaction_at = greatest(coalesce(last_interaction_at, '-infinity'::timestamptz), coalesce(p_occurred_at, now())),
			updated_at = now()
		where id = p_supplier_id;
	end if;

	return jsonb_build_object(
		'interaction_id', v_interaction_id,
		'negative_skus', to_jsonb(v_negative)
	);
end;
$$;

revoke all on function public.register_interaction(uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz, jsonb) from public;
grant execute on function public.register_interaction(uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz, jsonb) to authenticated;
