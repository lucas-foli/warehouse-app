-- OPERATIONAL FIX: re-ship the contents of 20260507000000_fix_tenant_members_member_read_rls.sql.sql
--
-- That earlier migration has a malformed ".sql.sql" filename, which is NOT a valid
-- Supabase migration name, so the migration runner silently skips it. As a result:
--   * public.is_tenant_member(uuid) was never created on the DB (this is what caused
--     the 42883 "function does not exist" error when other migrations referenced it), and
--   * the intended "members can read all members in their tenant" SELECT policy was
--     never applied — non-admin members can currently only read their own row (Bug M).
--
-- This migration re-creates both with a valid filename. It is fully idempotent
-- (create or replace + drop policy if exists), so it is safe whether or not the
-- original SQL was ever applied by hand. The companion malformed file is deleted in
-- this same change set.
--
-- Security note: is_tenant_member is SECURITY DEFINER (to avoid RLS recursion when used
-- inside tenant_members' own policy) but reads auth.uid(), so it only ever reports
-- membership for the *calling* user — it cannot be used to read other tenants' data.

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
  );
$$;

-- Replace the self-only SELECT policy with a tenant-scoped member-directory policy.
-- A member of a tenant may read all member rows of that same tenant (and only that
-- tenant). The "Tenant admins can read all memberships in their tenants" policy from
-- the base schema still applies and is subsumed by this one (admins are members).
drop policy if exists "Members can read own membership" on public.tenant_members;
drop policy if exists "members can read all members in their tenant" on public.tenant_members;

create policy "members can read all members in their tenant"
on public.tenant_members
for select
using (
  public.is_tenant_member(tenant_members.tenant_id)
);
