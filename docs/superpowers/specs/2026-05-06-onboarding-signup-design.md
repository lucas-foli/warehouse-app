# Onboarding & Signup — Design

**Date:** 2026-05-06
**Status:** Approved (pending implementation plan)
**Worktree branch:** `worktree-feat-onboarding-signup`

## Problem

The current onboarding flow depends on manually issued invite codes (`tenant_invites` table, populated by hand via SQL) for *both* workspace creation and adding teammates. This is operationally heavy: every new tenant requires Lucas to issue a code, every new teammate requires direct DB inserts. At the same time, fully open self-signup is unwanted — the platform should not be a place where random users sign up to play around.

## Goals

- Reduce dependence on manually issued codes for workspace creation while keeping a real gate
- Give tenant admins (workspace owners) a self-serve UI to invite, manage, and revoke teammates
- Architect for an eventual paid self-serve flow (Stripe) without building it yet — the same provisioning function should fire whether the trigger is a manual approval today or a `checkout.session.completed` webhook later
- Cleanly remove the dead `tenant_invites` / `TenantInviteGate` system

## Non-goals (v1)

- Stripe / payment integration. Approval today is manual, by Lucas, in an in-app admin UI.
- A full subscription model (`subscriptions` table, plans, prices, dunning). Replaced by a single `tenants.granted_until` column.
- Marketing landing page changes. Existing apex/marketing surface is out of scope.
- Public sign-up confirmation emails. Prospects see a "request received" UI state; no transactional email is sent until access is granted.
- Email template customization. Use Supabase's default invite email templates for v1.
- Two-factor auth, SSO, OAuth providers. Email + password only, as today.

## Architecture overview

Two end-user flows, one shared provisioning code path, three new tables, one modified table.

### Flow A — Workspace creation (gated by Lucas today, by Stripe later)

```
[apex /signup form]
  → INSERT signup_requests (status=pending)
  → UI: "We received your request."
[Lucas at /admin/requests]
  → click Approve(slug, duration)
  → Edge Function approve_signup_request:
      1. Lock signup_requests row, abort if not pending
      2. INSERT tenants(slug, company_name, granted_until)
      3. supabase.auth.admin.inviteUserByEmail(email, redirect=tenant subdomain)
      4. INSERT tenant_members(tenant_id, user_id, role='admin')
      5. UPDATE signup_requests SET status='approved', approved_tenant_id, reviewed_*
  → prospect receives Supabase invite email → clicks magic link
  → lands on tenant subdomain → sets password (Supabase invite default flow)
  → existing Onboarding wizard runs (branding, theme, CSV import, etc.)
```

### Flow B — Teammate invite (admin-managed, in-app)

```
[admin /members]
  → enter email + role → Edge Function create_tenant_invitation:
      1. Validate caller is admin of the tenant
      2. Generate token (random, single-use)
      3. INSERT tenant_invitations(token, email, tenant_id, role, expires_at)
      4. supabase.auth.admin.inviteUserByEmail(email, redirect=accept-invite URL with token)
[teammate clicks link]
  → /accept-invite?token=xxx (same SPA, on tenant subdomain)
  → Edge Function accept_tenant_invitation:
      1. Validate token (matches, not expired, not accepted, not revoked)
      2. Validate authenticated session email matches invitation email
      3. INSERT tenant_members(tenant_id, user_id, role)
      4. UPDATE tenant_invitations SET accepted_at = now()
  → teammate lands in tenant
```

### Why Edge Functions

Both `approve_signup_request` and `create_tenant_invitation` need the Supabase **service-role key** (to call `auth.admin.inviteUserByEmail`). The SPA must never hold this key. Edge Functions are the only safe place to run these.

`accept_tenant_invitation` doesn't strictly need service role (the token+email match is enough), but keeping it server-side simplifies validation and is consistent.

The existing `proxy-webhook` Edge Function establishes the deployment pattern.

## Data model

### New tables

```sql
-- 1. Public signup requests (pre-tenant)
create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  workspace_name text not null,
  use_case text,                          -- "How will you use this?" (optional)
  referral_source text,                   -- "How'd you hear about us?" dropdown
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  declined_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_tenant_id uuid references public.tenants(id),
  created_at timestamptz not null default now()
);
create index signup_requests_status_created_idx
  on public.signup_requests (status, created_at desc);
create unique index signup_requests_pending_email_uidx
  on public.signup_requests (lower(email))
  where status = 'pending';

alter table public.signup_requests enable row level security;

-- Anyone (including anon) can submit a request.
create policy "Public can submit signup request"
  on public.signup_requests for insert
  to anon, authenticated
  with check (true);

-- Only platform admins can read or update.
create policy "Platform admins can read all requests"
  on public.signup_requests for select
  using (public.is_platform_admin());

create policy "Platform admins can update requests"
  on public.signup_requests for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 2. Platform-level admins (super-admin role above tenants)
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Only platform admins can see the list (and themselves).
create policy "Platform admins can read platform_admins"
  on public.platform_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- 3. Tenant invitations (in-tenant teammate invites)
create table public.tenant_invitations (
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

create unique index tenant_invitations_active_email_uidx
  on public.tenant_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.tenant_invitations enable row level security;

-- Tenant admins can read/insert/update invitations for their tenant.
create policy "Tenant admins can read invitations"
  on public.tenant_invitations for select
  using (public.is_tenant_admin(tenant_id));

-- INSERT/UPDATE happen only via Edge Functions (service role bypasses RLS),
-- so no public INSERT/UPDATE policies are needed.
```

### Modified tables

```sql
-- tenants: add the trial/grant lifecycle column
alter table public.tenants
  add column granted_until timestamptz;
-- null      → no access (locked, e.g., declined or revoked)
-- future ts → active until that time
-- past ts   → expired (read-only wall)

comment on column public.tenants.granted_until is
  'Workspace access expiry. Stand-in for subscription state until Stripe is added.';

-- Drop the unused self-signup boolean. We never used it; granted_until + RLS supersede it.
alter table public.tenants drop column allow_self_signup;
```

### Deprecated (removed in same migration)

- `tenant_invites` table — replaced by `signup_requests`
- `create_tenant_with_invite()` RPC — replaced by `approve_signup_request` Edge Function
- `TenantInviteGate.tsx` component — no longer reachable; deleted

The existing `is_tenant_admin()` helper stays — still used by tenant-scoped RLS policies on products, tenant_members, etc.

### RLS update on existing tables

Add a "platform admin can do anything" escape hatch on `tenants` and `tenant_members`. Without it, Lucas can't manage edge cases (e.g., manually adjust a tenant for support) without using the Supabase service-role key directly. Keep it minimal: SELECT only, no UPDATE/DELETE — destructive ops still require explicit Edge Functions.

```sql
create policy "Platform admins can read all tenants"
  on public.tenants for select
  using (public.is_platform_admin());

create policy "Platform admins can read all members"
  on public.tenant_members for select
  using (public.is_platform_admin());
```

## Flow A — Workspace creation (in detail)

### Public signup page (`/signup` on apex domain)

- New SPA route. Visible only when `tenantError && !session && !inviteCode` *and* current host is the apex (not a subdomain). Subdomain `SlugNotFound` behavior unchanged — typo'd subdomains still show that page.
- Form fields:
  - `email` (text, required, email format)
  - `workspace_name` (text, required, max 60 chars)
  - `use_case` (textarea, optional, max 500 chars) — "How will you use this?"
  - `referral_source` (select, optional) — "How'd you hear about us?" with options: Google / Twitter / Friend / Other
- Submit → direct `supabase.from('signup_requests').insert(...)` (no Edge Function needed; anon RLS allows insert)
- Client-side validation: email format, workspace_name non-empty, lengths
- Success state: form replaced with "We received your request. We'll email you when access is granted." No email is sent at this stage (Lucas reviews and approves, which triggers the only email).
- Error states: network/validation errors shown inline. Duplicate pending request for same email returns a unique-violation; UI message: "You already have a pending request — we'll email you when it's reviewed."

### Admin approval surface (`/admin/requests`)

- New SPA route. Gated by `is_platform_admin()` check on mount; non-admins get redirected to `/`.
- Table view of `signup_requests`:
  - Columns: requested at, email, workspace name, use case (truncated), referral source, status, action
  - Default filter: status = pending
  - Tabs / segmented control to switch to approved / declined / all
- Approve action opens a modal:
  - `slug` field, prefilled from `slugify(workspace_name)`, editable, validated client-side against `^[a-z0-9-]{1,32}$`
  - `duration` select: 7 days / 30 days / 90 days / Forever (`null` = forever, internally large date or null)
  - Confirm button → calls Edge Function `approve_signup_request(request_id, slug, granted_until)`
- Decline action opens a modal:
  - `reason` textarea (optional)
  - Confirm → calls Edge Function `decline_signup_request(request_id, reason)`
- Both functions return updated request row; UI updates optimistically and reconciles on response

### Edge Function: `approve_signup_request`

```
Inputs: { request_id: uuid, slug: string, granted_until: timestamptz | null }
Auth:   caller must be platform_admin (verify via service-role-side check on JWT)

Steps (single transaction where possible):
  1. SELECT * FROM signup_requests WHERE id = request_id FOR UPDATE
     → if status != 'pending', return { error: 'already_processed' }
  2. INSERT INTO tenants (slug, company_name, granted_until)
       VALUES (slug, request.workspace_name, granted_until)
     → on slug unique violation: return { error: 'slug_taken' }
  3. CALL supabase.auth.admin.inviteUserByEmail(request.email, {
       redirectTo: `https://${slug}.${BASE_DOMAIN}/`,
     })
     → if error: ROLLBACK tenant insert; return { error: 'invite_email_failed' }
     → on duplicate user (email already exists): use returned existing user_id
  4. INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (..., 'admin')
  5. UPDATE signup_requests SET
       status='approved', approved_tenant_id=tenant.id,
       reviewed_by=caller, reviewed_at=now()

Returns: { tenant_id, slug, granted_until }
```

Implementation notes:

- Postgres transactions don't span Edge Function HTTP calls to Supabase Auth. The "rollback on auth failure" is implemented as a compensating delete of the inserted tenant row if step 3 fails. If the compensating delete itself fails (very rare: DB connectivity loss between steps), the tenant row remains and the request stays `pending`; Lucas resolves manually via SQL. Slug uniqueness makes a retry with the same slug surface as `slug_taken`, so we never double-create.
- The "platform admin" auth check is implemented inside the Edge Function by initialising a Supabase client with the caller's JWT and querying `select 1 from platform_admins where user_id = auth.uid()` before any privileged work. The service-role client is then used for the actual operations.

### Edge Function: `decline_signup_request`

```
Inputs: { request_id: uuid, reason: string | null }
Auth:   platform_admin
Steps:
  UPDATE signup_requests SET
    status='declined', declined_reason=reason,
    reviewed_by=caller, reviewed_at=now()
  WHERE id = request_id AND status = 'pending'
Returns: { ok: true } or { error: 'already_processed' }
```

### Prospect's path post-approval

1. Receives Supabase's default invite email at the address they provided
2. Clicks the link → lands on `https://{slug}.app.com/auth/callback`
3. Existing `App.tsx` callback handler exchanges the code, session is established
4. Supabase invite flow prompts for password set on first login (default behavior)
5. Once password is set, `App.tsx` flow runs as today: tenant exists, membership exists with role=admin, `is_onboarded=false` → existing `Onboarding` wizard renders

No changes to the `Onboarding` wizard itself.

### Edge cases

- **Slug collision at approve time:** Edge Function returns `slug_taken`; Lucas adjusts the slug in the modal and re-submits.
- **Email already has an auth user** (e.g., they previously created an account on a different tenant): `inviteUserByEmail` returns the existing user; we still create the new tenant_member row. They'll see both tenants on subsequent logins (existing membership-list UX, unchanged).
- **Duplicate approve clicks:** Row lock + status check makes step 1 idempotent; second click returns `already_processed`.
- **Prospect never opens the email:** Tenant exists with `granted_until` set, but no logged-in admin yet. No data leakage (no products, no members other than them). `granted_until` will eventually expire if they never set their password. Lucas can resend the invite from `/admin/requests` (button on approved row that re-calls `inviteUserByEmail`).

## Flow B — Teammate invite (in detail)

### Members surface (`/members` inside tenant)

- New SPA route, accessible to admins of the current tenant. Members see a read-only version (just the list, no actions).
- Sections:
  - **Active members:** rows from `tenant_members` joined to `auth.users` for email; columns: email, role, joined at, actions (change role, remove — both admin only)
  - **Pending invitations:** rows from `tenant_invitations` where `accepted_at is null AND revoked_at is null AND expires_at > now()`; columns: email, role, invited at, expires at, actions (resend, revoke)
  - **Expired invitations:** rows where `expires_at <= now() AND accepted_at is null` — collapsed by default; resendable
- "Invite teammate" button opens modal:
  - `email` (required, validated)
  - `role` (radio: member / admin)
  - Submit → calls Edge Function `create_tenant_invitation`

### Edge Function: `create_tenant_invitation`

```
Inputs: { tenant_id: uuid, email: string, role: 'member' | 'admin' }
Auth:   caller must be admin of tenant_id (verify via is_tenant_admin())

Steps:
  1. Validate inputs (email format, role enum)
  2. Check no active invitation exists for (tenant_id, email)
     → if exists: return { error: 'already_invited' }
  3. Check user is not already a member
     → if member: return { error: 'already_member' }
  4. Generate token: 32 bytes random, base64url
  5. INSERT INTO tenant_invitations
       (tenant_id, email, role, token, invited_by, expires_at)
       VALUES (..., now() + interval '7 days')
  6. CALL supabase.auth.admin.inviteUserByEmail(email, {
       redirectTo: `https://${tenant.slug}.${BASE_DOMAIN}/accept-invite?token=${token}`,
     })

Returns: { invitation_id, expires_at }
```

### Edge Function: `accept_tenant_invitation`

```
Inputs: { token: string }
Auth:   caller must be authenticated (auth.uid() not null)

Steps:
  1. SELECT * FROM tenant_invitations WHERE token = $1 FOR UPDATE
     → if not found: return { error: 'invalid_token' }
     → if accepted_at is not null: return { error: 'already_accepted' }
     → if revoked_at is not null: return { error: 'revoked' }
     → if expires_at <= now(): return { error: 'expired' }
  2. SELECT email FROM auth.users WHERE id = auth.uid()
     → if email != invitation.email: return { error: 'email_mismatch' }
  3. INSERT INTO tenant_members (tenant_id, user_id, role)
       VALUES (invitation.tenant_id, auth.uid(), invitation.role)
       ON CONFLICT DO NOTHING  -- idempotent
  4. UPDATE tenant_invitations SET accepted_at = now() WHERE id = invitation.id

Returns: { tenant_id, role }
```

### Edge Functions: `resend_tenant_invitation`, `revoke_tenant_invitation`

Standard CRUD on `tenant_invitations`. Resend re-calls `inviteUserByEmail` with the same token; revoke sets `revoked_at = now()`. Both gated by `is_tenant_admin()`.

### Accept-invite page (`/accept-invite?token=xxx`)

- New SPA route on tenant subdomain
- Expected entry path: teammate clicks the magic link in the invite email → Supabase exchanges the code → session is established on the tenant subdomain → SPA navigates to `/accept-invite?token=…`. In this case a session is already present.
- On mount:
  - If session is present → call `accept_tenant_invitation(token)`; on success redirect to `/`; on error render appropriate error UI keyed off the error code (`invalid_token`, `expired`, `email_mismatch`, etc.)
  - If session is absent (rare — direct navigation, or magic link expired before code exchange) → render `LoginForm` (sign-in mode); on successful sign-in, re-mount of this route picks up the persisted token and resumes the accept flow
- Token persisted in `localStorage` (key `tenant_invitation_token`) across the auth round-trip, analogous to the existing `INVITE_STORAGE_KEY` pattern. Cleared on successful acceptance or terminal error.

### Edge cases

- **Invitee already has account on another tenant:** `inviteUserByEmail` returns existing user; on accept, they get a second `tenant_members` row. They see a tenant switcher (existing UX) on subsequent logins.
- **Invitee tries to accept on wrong subdomain:** `accept-invite` page reads tenant context; if the invitation's `tenant_id` doesn't match current tenant, redirect to the correct subdomain with token preserved.
- **Admin invites their own email:** caught by "already_member" check.
- **Two pending invites for same email:** unique partial index prevents this.

## Platform admin surface

### Bootstrapping the first platform admin

Per the YAGNI principle, no UI for adding platform admins in v1. Lucas seeds himself via SQL migration:

```sql
-- One-shot seed: replace with actual user_id post-deploy.
-- Run manually after Lucas's auth.users row exists:
-- INSERT INTO platform_admins (user_id) VALUES ('<lucas-user-id>');
```

Documented as a manual step in the implementation plan. A "manage platform admins" UI is out of scope.

### Admin routes

- `/admin/requests` — signup request triage (covered above)
- (Future) `/admin/tenants` — tenant list, suspend/extend `granted_until`. Out of scope for this design but the data model and RLS support it.

### Admin route gating

Client-side: on mount of any `/admin/*` route, query `platform_admins` for `auth.uid()`. If absent, redirect to `/`. This is UX, not security — the real gate is RLS on `signup_requests` and the platform-admin auth check inside each Edge Function.

## Trial / grant lifecycle

### `tenants.granted_until` semantics

- `null` → workspace is locked; no member can access app surfaces. Used for suspended/declined-but-already-created cases (rare; new tenants always start with a value set on approval).
- `future timestamp` → workspace is active; full access for members per their role.
- `past timestamp` → workspace is expired; show "Subscription expired — contact support" wall in `App.tsx` *before* rendering the dashboard. Members can still log in (so they can see the wall), but routes return the wall component instead of dashboard content.

### Where the gate enforces

Two layers:

1. **UI wall in `App.tsx`** — after membership resolves, before rendering routes: if `tenant.granted_until == null || tenant.granted_until <= now()`, render `WorkspaceLockedWall` component.
2. **RLS predicate addition** on tenant-scoped tables (products, tenant_members select-by-non-admin, etc.):
   ```sql
   exists (
     select 1 from tenants t
     where t.id = <table>.tenant_id
       and t.granted_until is not null
       and t.granted_until > now()
   )
   ```
   This prevents data access via the API even if the UI wall is bypassed.

   Exception: `tenants` SELECT itself stays unchanged (login pages need to read branding even from expired tenants).
   Exception: platform-admin SELECT policies still work (they use `is_platform_admin()`, which doesn't check granted_until).

### Extending / revoking

- From `/admin/requests`, an approved row's "View tenant" link goes to a future `/admin/tenants/:id` page (out of scope).
- For v1, Lucas can extend or revoke by direct SQL update on `tenants.granted_until`. Documented in the implementation plan.

## Migrations & cleanup

Single migration file: `supabase/migrations/<timestamp>_onboarding_signup_redesign.sql`.

Order:

1. Create `platform_admins` table + `is_platform_admin()` helper
2. Create `signup_requests` table + RLS policies
3. Create `tenant_invitations` table + RLS policies
4. Add `tenants.granted_until` column
5. Add platform-admin SELECT policies on `tenants`, `tenant_members`
6. Add `granted_until` predicate to existing tenant-scoped RLS on `products`, etc. (re-create policies)
7. Backfill: set `granted_until = now() + interval '100 years'` for all existing tenants (so existing customers don't get locked out)
8. Drop `create_tenant_with_invite()` function
9. Drop `tenant_invites` table
10. Drop `tenants.allow_self_signup` column
11. Drop policies referencing `allow_self_signup` (the "Members can self-join when allowed" policy on `tenant_members`)

Frontend cleanup (separate commits):
- Delete `src/components/TenantInviteGate.tsx`
- Remove `TenantInviteGate` import and rendering from `App.tsx`
- Remove `INVITE_STORAGE_KEY` reads except where preserved for the new `accept-invite` token (likely renamed to `TENANT_INVITATION_TOKEN_KEY`)
- Remove `invite` URL parameter handling from `LoginForm.tsx`
- Update `LoginForm.tsx`: remove the `signup` mode entirely. The form is sign-in + reset only. New tenants enter via `/signup` on apex; teammates enter via invitation link.
- Update `mapInviteError` references — translate to new error keys

## Module / file map

```
supabase/
  migrations/
    <ts>_onboarding_signup_redesign.sql            # NEW — see above
  functions/
    approve_signup_request/index.ts                # NEW
    decline_signup_request/index.ts                # NEW
    create_tenant_invitation/index.ts              # NEW
    accept_tenant_invitation/index.ts              # NEW
    resend_tenant_invitation/index.ts              # NEW
    revoke_tenant_invitation/index.ts              # NEW
    _shared/                                       # NEW
      auth.ts            # platform-admin / tenant-admin guards
      supabase.ts        # service-role client factory
      cors.ts            # shared CORS headers
src/
  components/
    SignupPage.tsx                                 # NEW — public /signup form
    AcceptInvitePage.tsx                           # NEW — /accept-invite?token=
    WorkspaceLockedWall.tsx                        # NEW — granted_until wall
    admin/
      AdminLayout.tsx                              # NEW — gates /admin/* routes
      RequestsPage.tsx                             # NEW — /admin/requests
      ApproveRequestModal.tsx                      # NEW
      DeclineRequestModal.tsx                      # NEW
    members/
      MembersPage.tsx                              # NEW — /members
      InviteMemberModal.tsx                        # NEW
      MembersList.tsx                              # NEW
      InvitationsList.tsx                          # NEW
    LoginForm.tsx                                  # MODIFIED — remove signup mode + invite handling
    TenantInviteGate.tsx                           # DELETED
  context/
    PlatformAdminContext.tsx                       # NEW — caches is_platform_admin
  lib/
    supabaseClient.ts                              # unchanged
  services/
    signupRequests.ts                              # NEW — wraps inserts
    invitations.ts                                 # NEW — wraps Edge Function calls
  App.tsx                                          # MODIFIED — new routes, locked-wall gate, drop TenantInviteGate
```

Each Edge Function is its own module (Supabase deploys them per-folder). Shared helpers in `_shared/`.

## Testing strategy

Existing repo has no test setup (no Vitest, Jest, or Playwright). Adding a full test harness is out of scope for this feature. Verification strategy:

- **Migration:** apply locally via `supabase db reset`; manually verify all flows in dev
- **Edge Functions:** invoke via `supabase functions serve` + curl, with explicit cases for each error branch
- **Frontend:** manual smoke testing of the four user paths:
  1. Apex signup → admin approve → magic link → password set → onboarding wizard
  2. Apex signup → admin decline → request shown declined
  3. Admin invites teammate → teammate accepts → joins as member
  4. Workspace expires (`granted_until` in past) → locked wall renders

If a test framework is added later, these flows are the candidate test cases.

## Out of scope (YAGNI)

- Stripe / payment integration (architecture supports it, intentionally not built)
- Subscription model with plans, prices, proration, dunning
- Marketing landing page changes
- Transactional email customization (Supabase defaults are fine for v1)
- Public sign-up confirmation email
- "Manage platform admins" UI (seed via SQL)
- Tenant management UI for platform admins (`/admin/tenants`)
- Audit log for admin actions
- 2FA, SSO, OAuth providers
- Bulk invite (CSV upload of teammate emails)
- Custom domains per tenant
- I18n (English-only copy for v1; the existing PT-BR strings stay where they are; new screens are English)
