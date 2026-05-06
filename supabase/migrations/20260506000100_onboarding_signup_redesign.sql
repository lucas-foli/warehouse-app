-- Onboarding & Signup redesign — additive changes only.
-- Adds: platform_admins, signup_requests, tenant_invitations, tenants.granted_until.
-- Tightens: tenant-scoped RLS gates on granted_until.
-- Does NOT drop the legacy tenant_invites system — that happens in a follow-up
-- migration once the new flows are live.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. platform_admins (super-admin role above tenants)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists "Platform admins can read platform_admins" on public.platform_admins;
create policy "Platform admins can read platform_admins"
  on public.platform_admins for select
  using (user_id = auth.uid() or exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  ));

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. signup_requests (public signup intake, pre-tenant)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  workspace_name text not null,
  use_case text,
  referral_source text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  declined_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_tenant_id uuid references public.tenants(id),
  created_at timestamptz not null default now()
);

create index if not exists signup_requests_status_created_idx
  on public.signup_requests (status, created_at desc);

create unique index if not exists signup_requests_pending_email_uidx
  on public.signup_requests (lower(email))
  where status = 'pending';

alter table public.signup_requests enable row level security;

drop policy if exists "Public can submit signup request" on public.signup_requests;
create policy "Public can submit signup request"
  on public.signup_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Platform admins can read all requests" on public.signup_requests;
create policy "Platform admins can read all requests"
  on public.signup_requests for select
  using (public.is_platform_admin());

drop policy if exists "Platform admins can update requests" on public.signup_requests;
create policy "Platform admins can update requests"
  on public.signup_requests for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. tenant_invitations (in-tenant teammate invites)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token text not null unique,
  invited_by uuid references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists tenant_invitations_active_email_uidx
  on public.tenant_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists tenant_invitations_tenant_idx
  on public.tenant_invitations (tenant_id, created_at desc);

alter table public.tenant_invitations enable row level security;

drop policy if exists "Tenant admins can read invitations" on public.tenant_invitations;
create policy "Tenant admins can read invitations"
  on public.tenant_invitations for select
  using (public.is_tenant_admin(tenant_id));

-- INSERT/UPDATE happen exclusively via Edge Functions using the service role,
-- which bypasses RLS. No public INSERT/UPDATE policies are added.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. tenants.granted_until (trial / grant lifecycle)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tenants
  add column if not exists granted_until timestamptz;

comment on column public.tenants.granted_until is
  'Workspace access expiry. null=locked, future=active, past=expired. Stand-in for subscription state until Stripe is added.';

-- Backfill existing tenants so they don't get locked out by the new RLS gate.
update public.tenants
set granted_until = now() + interval '100 years'
where granted_until is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Platform-admin SELECT escape hatches on existing tables
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Platform admins can read all tenants" on public.tenants;
create policy "Platform admins can read all tenants"
  on public.tenants for select
  using (public.is_platform_admin());

drop policy if exists "Platform admins can read all members" on public.tenant_members;
create policy "Platform admins can read all members"
  on public.tenant_members for select
  using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Add granted_until predicate to tenant-scoped RLS on products
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: returns true iff the tenant has active access (granted_until in the future).
create or replace function public.tenant_has_active_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants t
    where t.id = target_tenant_id
      and t.granted_until is not null
      and t.granted_until > now()
  );
$$;

-- Re-create products RLS to gate on access.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    drop policy if exists "Tenant members can read products" on public.products;
    create policy "Tenant members can read products"
      on public.products for select
      using (
        public.tenant_has_active_access(products.tenant_id)
        and exists (
          select 1 from public.tenant_members tm
          where tm.tenant_id = products.tenant_id
            and tm.user_id = auth.uid()
        )
      );

    drop policy if exists "Tenant admins can write products" on public.products;
    create policy "Tenant admins can write products"
      on public.products for all
      using (
        public.tenant_has_active_access(products.tenant_id)
        and public.is_tenant_admin(products.tenant_id)
      )
      with check (
        public.tenant_has_active_access(products.tenant_id)
        and public.is_tenant_admin(products.tenant_id)
      );
  end if;
end $$;

-- Note: tenants SELECT policy is intentionally NOT gated on granted_until.
-- Login pages need to read branding even from expired tenants so the locked
-- wall can render with the correct logo/colors.
