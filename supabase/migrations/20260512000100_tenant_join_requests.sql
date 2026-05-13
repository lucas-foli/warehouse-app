-- Tenant-scoped join requests.
-- A visitor on <slug>.warehouse.go-fly.ai/login who clicks "Request access"
-- submits a request to join that specific tenant. The tenant's admin reviews
-- and either approves (issuing a tenant_invitation) or declines.
--
-- Anon INSERT is intentionally NOT allowed at the table level. Submissions go
-- through the submit_join_request Edge Function so the function can resolve
-- slug→tenant_id with the service role and return an anti-enumeration response
-- when the tenant doesn't exist or has join requests disabled.

create table if not exists public.tenant_join_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  declined_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_invitation_id uuid references public.tenant_invitations(id),
  created_at timestamptz not null default now()
);

create index if not exists tenant_join_requests_tenant_status_idx
  on public.tenant_join_requests (tenant_id, status, created_at desc);

create unique index if not exists tenant_join_requests_pending_email_uidx
  on public.tenant_join_requests (tenant_id, lower(email))
  where status = 'pending';

alter table public.tenant_join_requests enable row level security;

-- Tenant admins can read their own tenant's requests.
drop policy if exists "Tenant admins can read join requests"
  on public.tenant_join_requests;
create policy "Tenant admins can read join requests"
  on public.tenant_join_requests for select
  using (public.is_tenant_admin(tenant_id));

-- Tenant admins can update (approve/decline) their own tenant's requests.
-- The Edge Functions also update via service role; this policy makes
-- the table inspectable from the SPA without requiring a function round-trip
-- for read.
drop policy if exists "Tenant admins can update join requests"
  on public.tenant_join_requests;
create policy "Tenant admins can update join requests"
  on public.tenant_join_requests for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- Platform admin read escape hatch (parity with signup_requests).
drop policy if exists "Platform admins can read all join requests"
  on public.tenant_join_requests;
create policy "Platform admins can read all join requests"
  on public.tenant_join_requests for select
  using (public.is_platform_admin());

-- No INSERT policy: writes happen via submit_join_request Edge Function
-- (service role).
