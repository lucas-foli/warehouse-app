-- Drop legacy invite system. The new flow (signup_requests + tenant_invitations)
-- replaces it entirely. Order matters: drop function first (it references the
-- table), then policies on tenant_members that reference allow_self_signup,
-- then the column, then the table.

-- Drop the legacy provisioning function.
drop function if exists public.create_tenant_with_invite(text, text, text);

-- Drop the legacy self-signup policy (referenced allow_self_signup column).
drop policy if exists "Members can self-join when allowed" on public.tenant_members;

-- Drop the unused column.
alter table public.tenants drop column if exists allow_self_signup;

-- Drop the legacy invite table.
drop table if exists public.tenant_invites;
