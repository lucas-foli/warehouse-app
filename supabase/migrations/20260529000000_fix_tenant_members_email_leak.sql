-- SECURITY FIX (CRITICAL): cross-tenant PII leak via public.tenant_members_with_email.
--
-- The view joined public.tenant_members -> auth.users to expose member emails.
-- Because `authenticated` has no SELECT on auth.users, the view ended up running as
-- SECURITY DEFINER on the live DB, which BYPASSES the RLS on tenant_members. The
-- frontend queried it with a client-supplied tenant_id (services/invitations.ts),
-- so any authenticated user could pass an arbitrary tenant_id and read user_id +
-- role + email for EVERY member of EVERY tenant (IDOR / LGPD-reportable PII leak).
--
-- Fix: drop the view and replace it with a SECURITY DEFINER function that enforces
-- tenant membership BEFORE returning any row. This also resolves both linter
-- findings for this entity (no SECURITY DEFINER view; no auth.users-exposing view).
--
-- NOTE: the authorization gate is INLINED rather than delegating to a helper such as
-- public.is_tenant_member(uuid). The only definition of that helper lives in
-- 20260507000000_fix_tenant_members_member_read_rls.sql.sql, whose malformed ".sql.sql"
-- filename is not a valid Supabase migration name, so the migration runner skips it and
-- is_tenant_member(uuid) is never created on the DB (this is what caused the original
-- 42883 "function ... does not exist" failure). Inlining keeps this migration
-- self-contained and applies cleanly regardless of that file. The inline EXISTS check
-- reads auth.uid(), so the SECURITY DEFINER context cannot be abused to read other
-- tenants' members.

drop view if exists public.tenant_members_with_email;

create or replace function public.get_tenant_members_with_email(target_tenant_id uuid)
returns table (
  tenant_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select tm.tenant_id, tm.user_id, tm.role, tm.created_at, u.email
  from public.tenant_members tm
  left join auth.users u on u.id = tm.user_id
  where tm.tenant_id = target_tenant_id
    -- authz gate: the caller must themselves be a member of the tenant.
    -- This EXISTS reads auth.uid(), so the SECURITY DEFINER context can't be
    -- abused to read other tenants' members.
    and exists (
      select 1
      from public.tenant_members tm2
      where tm2.tenant_id = target_tenant_id
        and tm2.user_id = auth.uid()
    );
$$;

-- Lock down execution: anon must never reach member emails.
revoke all on function public.get_tenant_members_with_email(uuid) from public;
revoke all on function public.get_tenant_members_with_email(uuid) from anon;
grant execute on function public.get_tenant_members_with_email(uuid) to authenticated;
