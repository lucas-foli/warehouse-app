-- SECURITY FIX (CRITICAL): public.tenant_branding is a SECURITY DEFINER view.
--
-- The branding-only view was intentionally SECURITY DEFINER so the pre-auth login
-- page (anon, which has no SELECT on public.tenants) could read theming. But a
-- SECURITY DEFINER view in the public schema is flagged CRITICAL by the linter, and
-- with no WHERE filter the anon role can `select * from tenant_branding` to enumerate
-- EVERY tenant's slug + company_name + branding (tenant enumeration / info disclosure).
--
-- Fix: drop the view and expose the same data through a SECURITY DEFINER *function*
-- that takes a single slug. This resolves the linter finding (no SECURITY DEFINER view)
-- and limits each call to one tenant — no bulk enumeration through a bare SELECT.

drop view if exists public.tenant_branding;

create or replace function public.get_tenant_branding(p_slug text)
returns table (
  slug text,
  company_name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  ui_preset text,
  theme_tokens jsonb,
  accept_join_requests boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.slug,
         t.company_name,
         t.logo_url,
         t.primary_color,
         t.secondary_color,
         t.ui_preset,
         t.theme_tokens,
         t.accept_join_requests
  from public.tenants t
  where t.slug = p_slug;
$$;

-- Login page runs pre-auth, so anon needs execute; authenticated needs it too.
revoke all on function public.get_tenant_branding(text) from public;
grant execute on function public.get_tenant_branding(text) to anon;
grant execute on function public.get_tenant_branding(text) to authenticated;
