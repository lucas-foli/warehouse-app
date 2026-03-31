-- Security hardening: add RLS policies for tenant_invites.
-- RLS was enabled in 20251226000200 but no policies were created,
-- meaning no role could access the table through PostgREST.

-- Tenant admins can view invites that belong to their tenant.
drop policy if exists "Tenant admins can read invites" on public.tenant_invites;
create policy "Tenant admins can read invites"
on public.tenant_invites
for select
using (
	public.is_tenant_admin(tenant_id)
);

-- Tenant admins can create invites for their tenant.
drop policy if exists "Tenant admins can create invites" on public.tenant_invites;
create policy "Tenant admins can create invites"
on public.tenant_invites
for insert
with check (
	public.is_tenant_admin(tenant_id)
);

-- Tenant admins can delete invites for their tenant.
drop policy if exists "Tenant admins can delete invites" on public.tenant_invites;
create policy "Tenant admins can delete invites"
on public.tenant_invites
for delete
using (
	public.is_tenant_admin(tenant_id)
);
