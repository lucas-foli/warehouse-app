-- Campo fatia 1, emenda 2 (item 2): escopo do override manual em
-- field_contacts. Até aqui a view entregava fatos de TODA a história do
-- contato, e deriveStage decidia o override comparando
-- stage_overridden_at >= last_fact_at — um fato ANTIGO (anterior ao
-- override) conseguia "ressuscitar" um estágio automático mesmo depois de
-- um vendedor marcar manualmente Perdido (achado do roteiro e2e).
--
-- Esta migration recria a view (drop + create) escopando os fatos usados
-- nas colunas has_transaction, last_outcome, has_samples, has_interaction e
-- last_fact_at: quando há stage_overridden_at, só contam fatos OCORRIDOS
-- DEPOIS dele (occurred_at/sold_at > stage_overridden_at). Sem override
-- (stage_overridden_at is null), o comportamento é idêntico ao anterior —
-- nenhum fato é filtrado.
--
-- last_interaction_at (10ª coluna, usada pela UI para "há X dias") NÃO é
-- escopado: continua sendo o valor cru de clients/suppliers. Só last_fact_at
-- (o fato que a derivação de estágio usa para decidir se o override expirou)
-- passa a ser escopado.
--
-- deriveStage (src/utils/stageDerivation.ts) muda em conjunto: como os
-- fatos já chegam escopados, o override vale exatamente enquanto
-- last_fact_at for null — sem comparar datas em TS.

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
			and (c.stage_overridden_at is null or so.sold_at > c.stage_overridden_at)
	) as has_transaction,
	(
		select i.outcome from public.interactions i
		where i.client_id = c.id and i.tenant_id = c.tenant_id and i.outcome is not null
			and (c.stage_overridden_at is null or i.occurred_at > c.stage_overridden_at)
		order by i.occurred_at desc, i.created_at desc, i.id desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples s on s.interaction_id = i.id
		where i.client_id = c.id and i.tenant_id = c.tenant_id
			and (c.stage_overridden_at is null or i.occurred_at > c.stage_overridden_at)
	) as has_samples,
	exists (
		select 1 from public.interactions i
		where i.client_id = c.id and i.tenant_id = c.tenant_id
			and (c.stage_overridden_at is null or i.occurred_at > c.stage_overridden_at)
	) as has_interaction,
	greatest(
		(select max(i.occurred_at) from public.interactions i
			where i.client_id = c.id and i.tenant_id = c.tenant_id
				and (c.stage_overridden_at is null or i.occurred_at > c.stage_overridden_at)),
		(select max(so.sold_at) from public.sales_orders so
			where so.client_id = c.id and so.tenant_id = c.tenant_id
				and so.status is distinct from 'voided'
				and (c.stage_overridden_at is null or so.sold_at > c.stage_overridden_at))
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
			and (s.stage_overridden_at is null or i.occurred_at > s.stage_overridden_at)
		order by i.occurred_at desc, i.created_at desc, i.id desc
		limit 1
	) as last_outcome,
	exists (
		select 1 from public.interactions i
		join public.interaction_samples sm on sm.interaction_id = i.id
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id
			and (s.stage_overridden_at is null or i.occurred_at > s.stage_overridden_at)
	) as has_samples,
	exists (
		select 1 from public.interactions i
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id
			and (s.stage_overridden_at is null or i.occurred_at > s.stage_overridden_at)
	) as has_interaction,
	(select max(i.occurred_at) from public.interactions i
		where i.supplier_id = s.id and i.tenant_id = s.tenant_id
			and (s.stage_overridden_at is null or i.occurred_at > s.stage_overridden_at)
	) as last_fact_at
from public.suppliers s;

grant select on public.field_contacts to authenticated;

-- Índices já criados em 20260826000400_field_contacts_view.sql cobrem os
-- mesmos padrões de acesso (occurred_at/sold_at por contato) — não há
-- índice novo a criar aqui.
