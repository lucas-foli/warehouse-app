-- PERFORMANCE FIX: tenant-scoped read policies must not re-enter tenant_members RLS.
--
-- Root cause
-- ----------
-- The SELECT policies on products / clients / sellers / sales_orders / sales_items all
-- gate reads with a correlated subquery:
--
--     EXISTS (SELECT 1 FROM public.tenant_members tm
--             WHERE tm.tenant_id = <table>.tenant_id AND tm.user_id = auth.uid())
--
-- That inner SELECT is itself subject to tenant_members' OWN row-level security. Until
-- migration 20260529000200 there was a cheap, index-friendly self-row policy on
-- tenant_members ("Members can read own membership" => user_id = auth.uid()), so the
-- subquery resolved trivially. 20260529000200 dropped that policy, leaving tenant_members
-- readable only through SECURITY DEFINER function policies (is_platform_admin(),
-- is_tenant_admin(tenant_id), is_tenant_member(tenant_id)). The planner now evaluates
-- those functions while resolving the EXISTS — effectively per row of the outer scan —
-- which turned ~50ms dashboard reads into ~1-2s.
--
-- Fix
-- ---
-- Call public.is_tenant_member(tenant_id) directly in each read policy instead of the
-- inline EXISTS. is_tenant_member is SECURITY DEFINER, so it bypasses tenant_members RLS
-- entirely (no recursion, no per-row function fan-out), and it is STABLE with a single
-- argument that is constant for the matched partition, so the planner can evaluate it
-- once per distinct tenant_id rather than once per row. It reads auth.uid() internally,
-- so it still only ever reports membership for the calling user — identical security
-- semantics to the previous EXISTS, just without the RLS-within-RLS penalty.
--
-- The products policy additionally keeps its tenant_has_active_access(tenant_id) gate.
--
-- Idempotent: drop policy if exists + create. Safe to re-run.

-- products (preserve the active-access gate)
drop policy if exists "Tenant members can read products" on public.products;
create policy "Tenant members can read products"
on public.products
for select
using (
  public.tenant_has_active_access(tenant_id)
  and public.is_tenant_member(tenant_id)
);

-- clients
drop policy if exists "Tenant members can read clients" on public.clients;
create policy "Tenant members can read clients"
on public.clients
for select
using (public.is_tenant_member(tenant_id));

-- sellers
drop policy if exists "Tenant members can read sellers" on public.sellers;
create policy "Tenant members can read sellers"
on public.sellers
for select
using (public.is_tenant_member(tenant_id));

-- sales_orders
drop policy if exists "Tenant members can read sales orders" on public.sales_orders;
create policy "Tenant members can read sales orders"
on public.sales_orders
for select
using (public.is_tenant_member(tenant_id));

-- sales_items
drop policy if exists "Tenant members can read sales items" on public.sales_items;
create policy "Tenant members can read sales items"
on public.sales_items
for select
using (public.is_tenant_member(tenant_id));
