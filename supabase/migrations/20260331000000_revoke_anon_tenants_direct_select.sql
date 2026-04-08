-- Security hardening: revoke direct anon SELECT on tenants table.
-- Anon users should query tenant_branding (view) instead of the tenants table.
-- The tenant_branding view and its grants were created in 20260220000100.

-- Drop the overly permissive anon policy that allowed reading all tenant rows.
drop policy if exists "Anon can read tenant by slug for branding" on public.tenants;

-- Revoke direct SELECT on tenants from anon. The tenant_branding view is
-- SECURITY INVOKER by default in Postgres, but it was created by a superuser /
-- migration role that owns the tenants table, so the view owner already has
-- SELECT. We only need the anon grant on the view itself (already in place).
revoke select on public.tenants from anon;

-- Recreate the view with SECURITY DEFINER so it can read the tenants table
-- on behalf of anon users (since we just revoked their direct SELECT).
create or replace view public.tenant_branding
with (security_invoker = false)
as
select
    slug,
    company_name,
    logo_url,
    primary_color,
    secondary_color,
    ui_preset,
    theme_tokens
from public.tenants;

-- Ensure the tenant_branding view grants are still in place (idempotent).
grant select on public.tenant_branding to anon;
grant select on public.tenant_branding to authenticated;
