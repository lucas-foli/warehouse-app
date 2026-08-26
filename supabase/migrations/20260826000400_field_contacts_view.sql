-- Campo fatia 1 (4/4): visão unificada de contatos com FATOS CRUS para a
-- derivação de estágio em TS (deriveStage — fonte única; emenda da spec).
-- security_invoker: a RLS das tabelas base vale (lição do
-- fix_tenant_branding_definer_view).
-- has_transaction de supplier é FALSE até a fatia 2 (recebimentos).

drop view if exists public.field_contacts;
create view public.field_contacts
with (security_invoker = true)
as
select
	'client'::text as contact_type,
	c.id,
	c.tenant_id,
	c.name,
	c.city,
	c.phone,
	c.email,
	c.stage as manual_stage,
	c.stage_overridden_at,
	c.last_interaction_at,
	exists (
		select 1 from public.sales_orders so
		where so.client_id = c.id and so.tenant_id = c.tenant_id
			and so.status is distinct from 'voided'
	) as has_transaction,
	(
		select i.outcome from public.interactions i
		where i.client_id = c.id and i.tenant_id = c.tenant_id and i.outcome is not null
		order by i.occurred_at desc, i.created_at desc, i.id desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples s on s.interaction_id = i.id
		where i.client_id = c.id and i.tenant_id = c.tenant_id
	) as has_samples,
	exists (
		select 1 from public.interactions i
		where i.client_id = c.id and i.tenant_id = c.tenant_id
	) as has_interaction,
	greatest(
		c.last_interaction_at,
		(select max(so.sold_at) from public.sales_orders so
			where so.client_id = c.id and so.tenant_id = c.tenant_id
				and so.status is distinct from 'voided')
	) as last_fact_at
from public.clients c
union all
select
	'supplier'::text as contact_type,
	s.id,
	s.tenant_id,
	s.name,
	s.city,
	s.phone,
	s.email,
	s.stage as manual_stage,
	s.stage_overridden_at,
	s.last_interaction_at,
	false as has_transaction,
	(
		select i.outcome from public.interactions i
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id and i.outcome is not null
		order by i.occurred_at desc, i.created_at desc, i.id desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples sm on sm.interaction_id = i.id
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id
	) as has_samples,
	exists (
		select 1 from public.interactions i
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id
	) as has_interaction,
	s.last_interaction_at as last_fact_at
from public.suppliers s;

grant select on public.field_contacts to authenticated;

-- Índices de apoio da view: o max(sold_at) e o last_outcome são subqueries
-- correlacionadas que o planner não hasheia — sem estes índices a view faz
-- seq scan por contato (mesmo formato do incidente documentado em
-- 20260602000100_fix_read_policies_use_is_tenant_member.sql).
create index if not exists sales_orders_client_sold_idx on public.sales_orders (client_id, sold_at);
create index if not exists interactions_client_occurred_idx on public.interactions (tenant_id, client_id, occurred_at desc, created_at desc, id desc);
create index if not exists interactions_supplier_occurred_idx on public.interactions (tenant_id, supplier_id, occurred_at desc, created_at desc, id desc);
