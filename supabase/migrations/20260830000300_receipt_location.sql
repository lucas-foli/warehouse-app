-- Emenda 1 da spec do recebimento: substitui 20260830000200_register_receipt.sql
-- inteiro. A decisão original ("produto novo nasce com location = ''") não
-- sobrevive ao app — dashboardService.ts e ProductsPage.tsx desfazem o vazio
-- com fallback 'Loja principal' na leitura e o materializam no banco na
-- primeira edição, plantando o produto numa loja que ninguém escolheu. A
-- correção é resolver na origem: o lote de recebimento carrega um local de
-- destino (7º parâmetro, p_location), obrigatório só quando o lote cria pelo
-- menos um SKU novo. Produto já existente nunca tem seu local alterado pela
-- entrada. Dropa a assinatura de 6 parâmetros antes do create or replace —
-- caso contrário as duas convivem como sobrecarga e o PostgREST erra a
-- resolução da chamada.

drop function if exists public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text);

create or replace function public.register_receipt(
	p_tenant_id uuid,
	p_supplier_id uuid,
	p_items jsonb,                          -- [{ "sku": "...", "qty": 10, "unit_cost": 4.5, "name": "..." }, ...]
	p_received_at timestamptz default now(),
	p_document text default null,
	p_note text default null,
	p_location text default null
)
returns public.receipts
language plpgsql
security definer
set search_path = public
as $$
declare
	v_next bigint;
	v_receipt_number text;
	v_receipt_id uuid;
	v_total numeric := 0;
	v_has_cost boolean := true;
	v_receipt public.receipts%rowtype;
	v_item record;
	v_product_id uuid;
	v_line_total numeric;
begin
	if auth.uid() is null then
		raise exception using message = 'not_authenticated';
	end if;

	if not public.is_tenant_admin(p_tenant_id) then
		raise exception using message = 'not_authorized';
	end if;

	if p_supplier_id is null or not exists (
		select 1 from public.suppliers s
		where s.id = p_supplier_id and s.tenant_id = p_tenant_id
	) then
		raise exception using message = 'receipt_supplier_required';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
		raise exception using message = 'receipt_items_required';
	end if;

	-- Valida cada elemento ANTES da agregação, sem cast (NULL-seguro): qty
	-- ausente/não-numérica/decimal/zero/negativa/overflow vira exceção nomeada,
	-- e o sum não mascara item inválido em SKU duplicado. Mesmo padrão do
	-- register_interaction da fatia 1.
	if exists (
		select 1 from jsonb_array_elements(p_items) as elem
		where jsonb_typeof(elem) <> 'object'
			or not (elem ? 'qty')
			or jsonb_typeof(elem->'qty') <> 'number'
			or (elem->>'qty') !~ '^[0-9]+$'
			or length(elem->>'qty') > 9
			or (elem->>'qty') = '0'
	) then
		raise exception using message = 'receipt_qty_invalid';
	end if;

	-- unit_cost é OPCIONAL (ausente ou JSON null = linha sem custo, válido).
	-- Quando presente e não-null, tem que ser jsonb 'number' e >= 0; qualquer
	-- outra coisa (string, bool, objeto, número negativo) vira exceção nomeada.
	-- Mesmo padrão NULL-seguro do gate de qty: o cast só roda depois que o
	-- typeof já garantiu 'number', então nunca estoura SQLSTATE 22P02.
	if exists (
		select 1 from jsonb_array_elements(p_items) as elem
		where (elem ? 'unit_cost')
			and jsonb_typeof(elem->'unit_cost') <> 'null'
			and (
				jsonb_typeof(elem->'unit_cost') <> 'number'
				or (elem->>'unit_cost')::numeric < 0
			)
	) then
		raise exception using message = 'receipt_cost_invalid';
	end if;

	-- Serializa a numeração para este tenant (mesma mecânica do register_sale_order).
	perform pg_advisory_xact_lock(hashtext(p_tenant_id::text));

	select coalesce(max(nullif(regexp_replace(receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1
	into v_next
	from public.receipts
	where tenant_id = p_tenant_id and receipt_number like 'R-%';

	v_receipt_number := 'R-' || lpad(v_next::text, 4, '0');

	insert into public.receipts (
		tenant_id, receipt_number, supplier_id, received_at, document, note, total_cost, created_by
	)
	values (
		p_tenant_id, v_receipt_number, p_supplier_id, coalesce(p_received_at, now()),
		nullif(trim(p_document), ''), nullif(trim(p_note), ''), null, auth.uid()
	)
	returning id into v_receipt_id;

	-- Merge de SKUs duplicados: soma qty; último unit_cost não-nulo vence;
	-- primeiro name não-vazio vence. Igual ao merge da venda, para o índice
	-- único (tenant_id, receipt_id, sku) não trincar.
	for v_item in
		with raw as (
			select
				upper(trim(elem->>'sku')) as sku,
				(elem->>'qty')::int as qty,
				nullif(elem->>'unit_cost', '')::numeric as unit_cost,
				nullif(trim(elem->>'name'), '') as name,
				ord
			from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
		),
		merged as (
			select
				r.sku,
				sum(r.qty) as qty,
				(select r2.unit_cost from raw r2
				 where r2.sku = r.sku and r2.unit_cost is not null
				 order by r2.ord desc limit 1) as unit_cost,
				(select r3.name from raw r3
				 where r3.sku = r.sku and r3.name is not null
				 order by r3.ord asc limit 1) as name
			from raw r
			group by r.sku
		)
		select * from merged
	loop
		if v_item.sku is null or v_item.sku = '' then
			raise exception using message = 'receipt_sku_required';
		end if;

		select p.id into v_product_id
		from public.products p
		where p.tenant_id = p_tenant_id and upper(trim(p.sku)) = v_item.sku
		limit 1;

		if v_product_id is null then
			-- Produto novo: o recebimento é porta de cadastro. price fica NULL
			-- (o fornecedor não define preço de venda). location vem do lote
			-- (p_location) — obrigatório aqui porque o produto tem que nascer
			-- numa loja escolhida, nunca no default da tabela nem vazio.
			if v_item.name is null then
				raise exception using message = 'receipt_product_name_required';
			end if;

			if nullif(trim(coalesce(p_location, '')), '') is null then
				raise exception using message = 'receipt_location_required';
			end if;

			insert into public.products (tenant_id, sku, name, qty, price, location, is_active)
			values (p_tenant_id, v_item.sku, v_item.name, v_item.qty, null, trim(p_location), true)
			returning id into v_product_id;
		else
			-- Produto existente: soma o saldo e reativa se estiver desativado.
			-- O local do lote NUNCA move um produto existente entre lojas.
			update public.products
			set qty = qty + v_item.qty,
				is_active = true,
				updated_at = now()
			where id = v_product_id;
		end if;

		v_line_total := case when v_item.unit_cost is null
			then null else round(v_item.unit_cost * v_item.qty, 2) end;

		insert into public.receipt_items (
			tenant_id, receipt_id, receipt_number, product_id, sku, qty, unit_cost, total_cost
		)
		values (
			p_tenant_id, v_receipt_id, v_receipt_number, v_product_id,
			v_item.sku, v_item.qty, v_item.unit_cost, v_line_total
		);

		if v_item.unit_cost is null then
			v_has_cost := false;
		else
			v_total := v_total + v_line_total;
		end if;
	end loop;

	update public.receipts
	set total_cost = case when v_has_cost then v_total else null end,
		updated_at = now()
	where id = v_receipt_id
	returning * into v_receipt;

	return v_receipt;
end;
$$;

revoke all on function public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text, text) from public;
grant execute on function public.register_receipt(uuid, uuid, jsonb, timestamptz, text, text, text) to authenticated;
