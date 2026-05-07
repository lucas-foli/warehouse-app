-- Fix infinite-recursion (42P17) in the SELECT policy on public.platform_admins.
--
-- The previous policy referenced public.platform_admins inside its USING clause,
-- which re-applied the same policy and looped:
--
--   using (user_id = auth.uid() or exists (
--     select 1 from public.platform_admins pa where pa.user_id = auth.uid()
--   ))
--
-- v1 has no "manage platform admins" UI (see design doc, "Out of scope (YAGNI)"),
-- so a self-only read policy is sufficient: each user can read their own
-- platform_admins row. The SPA's checkIsPlatformAdmin only ever queries the
-- current user, and Edge Functions use the service role (bypasses RLS).

drop policy if exists "Platform admins can read platform_admins"
  on public.platform_admins;

drop policy if exists "Users can read their own platform_admin row"
  on public.platform_admins;

create policy "Users can read their own platform_admin row"
  on public.platform_admins for select
  using (user_id = auth.uid());
