-- Bug K: tenant_members_with_email returned 403 for authenticated tenant members.
-- The previous view (20260506000150) used security_invoker = true, so the join
-- against auth.users ran under the caller's JWT — which has no SELECT privilege
-- on auth.users — and Postgres rejected the read.
--
-- Fix: re-create the view as a security-definer view (security_invoker = false,
-- the Postgres default) so the join runs as the view owner and can read
-- auth.users.email. Because security-definer views bypass RLS on the base
-- tables, we add an explicit WHERE clause that mirrors the SELECT policies on
-- public.tenant_members:
--   * Members can read their own membership (user_id = auth.uid()).
--   * Tenant admins can list members for their tenant (is_tenant_admin).
-- This prevents cross-tenant email leaks while restoring email visibility for
-- legitimate callers.

drop view if exists public.tenant_members_with_email;

create view public.tenant_members_with_email
with (security_invoker = false)
as
select
  tm.tenant_id,
  tm.user_id,
  tm.role,
  tm.created_at,
  u.email
from public.tenant_members tm
left join auth.users u on u.id = tm.user_id
where
  tm.user_id = auth.uid()
  or public.is_tenant_admin(tm.tenant_id);

revoke all on public.tenant_members_with_email from public;
revoke all on public.tenant_members_with_email from anon;
grant select on public.tenant_members_with_email to authenticated;
