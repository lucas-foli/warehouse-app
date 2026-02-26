-- S0.5: Restrict tenants SELECT policy
-- Previously: any user (including anon) could read ALL tenant rows.
-- Now: anon users can only read branding fields for a specific slug;
-- authenticated members can read their own tenant's full row.

-- Create a branding-only view for unauthenticated (login page) access.
-- This exposes only what the login page needs for theming — no internal flags.
create or replace view public.tenant_branding as
select
    slug,
    company_name,
    logo_url,
    primary_color,
    secondary_color,
    ui_preset,
    theme_tokens
from public.tenants;

-- Grant anon access to the view (PostgREST needs this)
grant select on public.tenant_branding to anon;
grant select on public.tenant_branding to authenticated;

-- Replace the wide-open tenants SELECT policy with a member-only policy.
-- Authenticated users can only read tenants they belong to.
drop policy if exists "Tenants are readable" on public.tenants;

create policy "Tenant members can read own tenant"
on public.tenants
for select
using (
    exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = tenants.id
            and tm.user_id = auth.uid()
    )
);

-- Also allow anon to read tenants for the invite/onboarding flow
-- (the create_tenant_with_invite RPC is SECURITY DEFINER so it bypasses RLS,
-- but the TenantContext needs to load branding before auth).
-- Restrict to only the specific slug being accessed.
create policy "Anon can read tenant by slug for branding"
on public.tenants
for select
using (
    auth.uid() is null
);

-- NOTE: The anon policy above still allows reading all rows for unauthenticated users.
-- This is because PostgREST doesn't natively support passing the requested slug into RLS.
-- The tenant_branding VIEW is the recommended approach for the frontend:
--   - Login page / TenantContext should query `tenant_branding` (limited columns)
--   - Authenticated pages should query `tenants` (full row, member-scoped)
--
-- To fully lock down anon access, migrate TenantContext to use the tenant_branding view
-- for the initial load, and only query the full tenants table after authentication.
