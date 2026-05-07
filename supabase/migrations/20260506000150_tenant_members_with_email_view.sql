-- Members-with-email read-only view (security_invoker, so RLS on tenant_members applies).
create or replace view public.tenant_members_with_email
with (security_invoker = true)
as
select
  tm.tenant_id,
  tm.user_id,
  tm.role,
  tm.created_at,
  u.email
from public.tenant_members tm
left join auth.users u on u.id = tm.user_id;

grant select on public.tenant_members_with_email to authenticated;
