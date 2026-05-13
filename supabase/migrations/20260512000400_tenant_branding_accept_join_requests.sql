-- Extend the tenant_branding view with accept_join_requests so the anonymous
-- login page on a tenant subdomain can decide whether to render the
-- "Request access" link. Without this, anon visitors (who can't read the full
-- tenants row) wouldn't know if the tenant has the toggle off.

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
    theme_tokens,
    accept_join_requests
from public.tenants;

grant select on public.tenant_branding to anon;
grant select on public.tenant_branding to authenticated;
