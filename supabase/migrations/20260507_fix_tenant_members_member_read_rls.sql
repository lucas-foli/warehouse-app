-- Bug M: /members shows only the current user's row when signed in as a non-admin.
-- The previous SELECT policy on tenant_members restricted reads to user_id = auth.uid(),
-- which hid every other member (including the admin) from non-admin members.
--
-- Fix: allow any authenticated tenant member to read all rows in their own tenant.
-- A correlated subquery on tenant_members inside its own RLS policy would recurse,
-- so use a SECURITY DEFINER helper (same pattern as public.is_tenant_admin).

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

-- Drop the old self-only SELECT policy that caused the bug.
drop policy if exists "Members can read own membership" on public.tenant_members;

-- New SELECT policy: any authenticated tenant member can read all rows belonging to
-- a tenant they are themselves a member of. The existing
-- "Tenant admins can list members" policy is now subsumed by this one (admins are
-- also members), but is left in place to avoid touching unrelated state.
drop policy if exists "members can read all members in their tenant" on public.tenant_members;
create policy "members can read all members in their tenant"
on public.tenant_members
for select
using (
	public.is_tenant_member(tenant_members.tenant_id)
);

-- INSERT / UPDATE / DELETE policies are intentionally not modified here:
--   - "Tenant admins can add members"      (insert,  is_tenant_admin)
--   - "Members can self-join when allowed" (insert,  self + tenant flag)
--   - "Tenant admins can remove members"   (delete,  is_tenant_admin)
-- Write access remains admin-only.
