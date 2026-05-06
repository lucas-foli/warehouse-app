# Onboarding & Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual invite-code onboarding system with (a) a public signup-request flow gated by a platform-admin approval UI and (b) an in-tenant teammate invitation flow, while keeping a single provisioning code path so a future Stripe webhook can replace the manual approval trigger without further migration.

**Architecture:** Three new tables (`signup_requests`, `platform_admins`, `tenant_invitations`), one column added to `tenants` (`granted_until`), six new Supabase Edge Functions, and a set of new SPA routes (`/signup`, `/admin/requests`, `/members`, `/accept-invite`). The legacy `tenant_invites` system is dropped at the end. Edge Functions hold the service-role key; the SPA never does.

**Tech Stack:** React 19 + Vite + react-router-dom 7, Supabase (Postgres + Auth + Edge Functions/Deno), Tailwind, Framer Motion. Vitest for utility tests.

**Spec:** `docs/superpowers/specs/2026-05-06-onboarding-signup-design.md`

**Phase map (each phase ends in a stable, testable checkpoint):**

1. Schema additions (one migration; adds only)
2. Workspace-creation Edge Functions
3. Workspace-creation client (public signup + admin approval UI)
4. Teammate-invitation Edge Functions
5. Teammate-invitation client (members UI + accept-invite page)
6. `granted_until` locked-state wall
7. Legacy cleanup (drop migration + frontend cleanup)

Phases 1-6 are additive — the legacy invite system continues to work the entire time. Phase 7 removes it once the new flows are verified.

---

## File structure

```
supabase/
  migrations/
    20260506000100_onboarding_signup_redesign.sql   # CREATE — phase 1
    20260506000150_tenant_members_with_email_view.sql  # CREATE — phase 5
    20260506000200_drop_legacy_invite_system.sql    # CREATE — phase 7
  functions/
    _shared/
      cors.ts                                       # CREATE — phase 2
      authGuards.ts                                 # CREATE — phase 2
      supabaseAdmin.ts                              # CREATE — phase 2
      json.ts                                       # CREATE — phase 2
    approve_signup_request/index.ts                 # CREATE — phase 2
    decline_signup_request/index.ts                 # CREATE — phase 2
    create_tenant_invitation/index.ts               # CREATE — phase 4
    accept_tenant_invitation/index.ts               # CREATE — phase 4
    resend_tenant_invitation/index.ts               # CREATE — phase 4
    revoke_tenant_invitation/index.ts               # CREATE — phase 4
src/
  utils/
    slug.ts                                         # CREATE — phase 3
    slug.test.ts                                    # CREATE — phase 3
  services/
    signupRequests.ts                               # CREATE — phase 3
    invitations.ts                                  # CREATE — phase 5
    platformAdmin.ts                                # CREATE — phase 3
  context/
    PlatformAdminContext.tsx                        # CREATE — phase 3
  components/
    SignupPage.tsx                                  # CREATE — phase 3
    AcceptInvitePage.tsx                            # CREATE — phase 5
    WorkspaceLockedWall.tsx                         # CREATE — phase 6
    admin/
      AdminLayout.tsx                               # CREATE — phase 3
      RequestsPage.tsx                              # CREATE — phase 3
      ApproveRequestModal.tsx                       # CREATE — phase 3
      DeclineRequestModal.tsx                       # CREATE — phase 3
    members/
      MembersPage.tsx                               # CREATE — phase 5
      InviteMemberModal.tsx                         # CREATE — phase 5
      MembersList.tsx                               # CREATE — phase 5
      InvitationsList.tsx                           # CREATE — phase 5
    LoginForm.tsx                                   # MODIFY — phase 7 (remove signup mode + invite handling)
    TenantInviteGate.tsx                            # DELETE — phase 7
  App.tsx                                           # MODIFY — phases 3, 5, 6, 7
```

---

## Phase 1 — Schema additions

### Task 1.1: Create the additive migration

**Files:**
- Create: `supabase/migrations/20260506000100_onboarding_signup_redesign.sql`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration locally**

Run:
```bash
supabase db reset
```

Expected: all migrations replay, no errors. The output should end with "Finished supabase db reset" (or equivalent).

- [ ] **Step 3: Verify schema in psql**

Run:
```bash
supabase db remote ls --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" 2>/dev/null || true
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*" -c "\d public.signup_requests" -c "\d public.tenant_invitations" -c "\d public.platform_admins" -c "\d public.tenants"
```

Expected: tables `signup_requests`, `tenant_invitations`, `platform_admins` exist; `tenants` has `granted_until timestamptz`. No errors.

- [ ] **Step 4: Verify the helper function**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select public.is_platform_admin();"
```

Expected: returns `false` (no `auth.uid()` in psql session, but should not error).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506000100_onboarding_signup_redesign.sql
git commit -m "Add onboarding/signup schema (signup_requests, platform_admins, tenant_invitations)"
```

---

### Task 1.2: Document platform-admin seed step

**Files:**
- Create: `docs/superpowers/runbooks/seed-platform-admin.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Seed the first platform admin

After deploying the onboarding/signup migration, the `platform_admins` table is empty. Until the first row is inserted, the `/admin/requests` route is locked and no one can approve signup requests.

## Steps

1. Confirm Lucas (or whichever user should be the first platform admin) has signed in to the app at least once. This creates their `auth.users` row.

2. Find the user_id:
   ```sql
   select id, email from auth.users where email = '<email>';
   ```

3. Insert the row:
   ```sql
   insert into public.platform_admins (user_id) values ('<user_id>');
   ```

4. Verify:
   ```sql
   select pa.user_id, u.email
   from public.platform_admins pa
   join auth.users u on u.id = pa.user_id;
   ```

To add additional platform admins later, repeat the insert step.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/seed-platform-admin.md
git commit -m "Document platform_admins seed runbook"
```

---

## Phase 2 — Workspace-creation Edge Functions

### Task 2.1: Create shared Edge Function helpers

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/json.ts`
- Create: `supabase/functions/_shared/supabaseAdmin.ts`
- Create: `supabase/functions/_shared/authGuards.ts`

- [ ] **Step 1: Write `cors.ts`**

```typescript
// supabase/functions/_shared/cors.ts
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowedRaw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const allowedOrigins = allowedRaw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const isAllowed = origin && allowedOrigins.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\./g, "\\.").replace("*", "[a-z0-9-]+") + "$",
      );
      return regex.test(origin);
    }
    return pattern === origin;
  });

  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}
```

- [ ] **Step 2: Write `json.ts`**

```typescript
// supabase/functions/_shared/json.ts
export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  });
}

export function errorResponse(
  code: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: code }, { status }, extraHeaders);
}
```

- [ ] **Step 3: Write `supabaseAdmin.ts`**

```typescript
// supabase/functions/_shared/supabaseAdmin.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role client — bypasses RLS. Use only in Edge Functions.
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("missing_supabase_env");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Caller-scoped client — uses the JWT in the request's Authorization header.
// Use this to verify who is calling (auth.uid(), is_tenant_admin(), is_platform_admin()).
export function createCallerClient(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("missing_supabase_env");
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}
```

- [ ] **Step 4: Write `authGuards.ts`**

```typescript
// supabase/functions/_shared/authGuards.ts
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function requireAuthenticatedUser(
  caller: SupabaseClient,
): Promise<{ userId: string; email: string } | { error: string }> {
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return { error: "not_authenticated" };
  return { userId: data.user.id, email: data.user.email ?? "" };
}

export async function requirePlatformAdmin(
  caller: SupabaseClient,
): Promise<{ userId: string } | { error: string }> {
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return auth;
  const { data, error } = await caller
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return { error: "auth_check_failed" };
  if (!data) return { error: "not_platform_admin" };
  return { userId: auth.userId };
}

export async function requireTenantAdmin(
  caller: SupabaseClient,
  tenantId: string,
): Promise<{ userId: string } | { error: string }> {
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return auth;
  // is_tenant_admin() reads auth.uid(), so the caller-scoped client honors RLS.
  const { data, error } = await caller.rpc("is_tenant_admin", {
    target_tenant_id: tenantId,
  });
  if (error) return { error: "auth_check_failed" };
  if (!data) return { error: "not_tenant_admin" };
  return { userId: auth.userId };
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "Add shared helpers for onboarding Edge Functions"
```

---

### Task 2.2: Create `approve_signup_request` Edge Function

**Files:**
- Create: `supabase/functions/approve_signup_request/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/approve_signup_request/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requirePlatformAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
  slug: string;
  granted_until: string | null; // ISO8601 or null for "forever"
}

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }

  if (!body.request_id || !body.slug) return errorResponse("missing_fields", 400, cors);
  if (!SLUG_RE.test(body.slug)) return errorResponse("invalid_slug", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requirePlatformAdmin(caller);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  // 1. Lock and validate the request row.
  const { data: request, error: fetchErr } = await admin
    .from("signup_requests")
    .select("*")
    .eq("id", body.request_id)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!request) return errorResponse("request_not_found", 404, cors);
  if (request.status !== "pending") return errorResponse("already_processed", 409, cors);

  // 2. Insert the tenant.
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      slug: body.slug,
      company_name: request.workspace_name,
      granted_until: body.granted_until,
    })
    .select("id, slug")
    .single();
  if (tenantErr) {
    if (tenantErr.code === "23505") return errorResponse("slug_taken", 409, cors);
    return errorResponse("tenant_insert_failed", 500, cors);
  }

  // 3. Send invite email (creates auth.users if absent, returns existing if present).
  const redirectTo = `https://${body.slug}.${baseDomain}/`;
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    request.email,
    { redirectTo },
  );
  let userId = inviteData?.user?.id ?? null;

  if (inviteErr || !userId) {
    // Email may already exist — fetch the existing user.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find(
      (u) => (u.email ?? "").toLowerCase() === request.email.toLowerCase(),
    );
    if (existing) {
      userId = existing.id;
    } else {
      // Compensating delete of the tenant row we just inserted.
      await admin.from("tenants").delete().eq("id", tenant.id);
      return errorResponse("invite_email_failed", 500, cors);
    }
  }

  // 4. Insert the admin membership.
  const { error: memberErr } = await admin
    .from("tenant_members")
    .insert({ tenant_id: tenant.id, user_id: userId, role: "admin" });
  if (memberErr) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return errorResponse("member_insert_failed", 500, cors);
  }

  // 5. Mark the request approved.
  const { error: updateErr } = await admin
    .from("signup_requests")
    .update({
      status: "approved",
      approved_tenant_id: tenant.id,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending"); // optimistic lock
  if (updateErr) {
    // Tenant + member are created; the request update failed. Surface the error
    // but leave the side-effects so a manual SQL update can reconcile.
    return errorResponse("request_update_failed", 500, cors);
  }

  return jsonResponse(
    { tenant_id: tenant.id, slug: tenant.slug, granted_until: body.granted_until },
    { status: 200 },
    cors,
  );
});
```

- [ ] **Step 2: Run `supabase functions serve` locally**

```bash
supabase functions serve approve_signup_request --env-file ./supabase/.env.local
```

Expected: server starts, listens on `http://127.0.0.1:54321/functions/v1/approve_signup_request`.

If `./supabase/.env.local` doesn't exist, create it with: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status`), `BASE_DOMAIN=localhost`, `ALLOWED_ORIGINS=http://localhost:5173`.

- [ ] **Step 3: Smoke-test the unauthorized branch**

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/approve_signup_request \
  -H "Content-Type: application/json" \
  -d '{"request_id":"00000000-0000-0000-0000-000000000000","slug":"acme","granted_until":null}'
```

Expected: HTTP 403 with body `{"error":"not_authenticated"}`.

- [ ] **Step 4: Seed a platform-admin user + a pending request, then test the happy path**

In psql (`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`):

```sql
-- Create a test user via Supabase auth admin API or insert into auth.users manually,
-- then mark them platform_admin:
insert into public.platform_admins (user_id) values ('<test-user-id>');

-- Insert a pending signup request:
insert into public.signup_requests (email, workspace_name)
values ('founder@acme.test', 'Acme Inc')
returning id;
```

Get the test user's JWT (sign in via the SPA dev server or use `supabase auth ...`), then:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/approve_signup_request \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<request-id>","slug":"acme","granted_until":"2027-01-01T00:00:00Z"}'
```

Expected: HTTP 200 with `{"tenant_id":"...","slug":"acme","granted_until":"..."}`. Verify in psql:

```sql
select id, slug, company_name, granted_until from public.tenants where slug = 'acme';
select tenant_id, user_id, role from public.tenant_members where tenant_id = '<tenant-id>';
select status, approved_tenant_id from public.signup_requests where id = '<request-id>';
```

All three should reflect the approval.

- [ ] **Step 5: Smoke-test the slug_taken branch**

Re-run the same curl with a different `request_id` but the same `slug=acme`. Expected: HTTP 409 with `{"error":"slug_taken"}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/approve_signup_request/
git commit -m "Add approve_signup_request Edge Function"
```

---

### Task 2.3: Create `decline_signup_request` Edge Function

**Files:**
- Create: `supabase/functions/decline_signup_request/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/decline_signup_request/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requirePlatformAdmin } from "../_shared/authGuards.ts";

interface Body {
  request_id: string;
  reason: string | null;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.request_id) return errorResponse("missing_fields", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requirePlatformAdmin(caller);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("signup_requests")
    .update({
      status: "declined",
      declined_reason: body.reason,
      reviewed_by: guard.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", body.request_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return errorResponse("update_failed", 500, cors);
  if (!data) return errorResponse("already_processed", 409, cors);

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
```

- [ ] **Step 2: Smoke-test**

```bash
supabase functions serve decline_signup_request --env-file ./supabase/.env.local
```

Insert another pending request in psql, then:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/decline_signup_request \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<request-id>","reason":"Not a fit"}'
```

Expected: HTTP 200, `{"ok":true}`. Re-running returns HTTP 409 `already_processed`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/decline_signup_request/
git commit -m "Add decline_signup_request Edge Function"
```

---

## Phase 3 — Workspace-creation client

### Task 3.1: Slug derivation utility + tests

**Files:**
- Create: `src/utils/slug.ts`
- Create: `src/utils/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/utils/slug.test.ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Acme Inc")).toBe("acme-inc");
  });

  it("strips diacritics", () => {
    expect(slugify("Maxpharma Saúde")).toBe("maxpharma-saude");
  });

  it("collapses multiple separators", () => {
    expect(slugify("  Foo   --  Bar  ")).toBe("foo-bar");
  });

  it("drops disallowed characters", () => {
    expect(slugify("Joe's Plumbing & Co.")).toBe("joes-plumbing-co");
  });

  it("truncates to 32 chars", () => {
    expect(slugify("a".repeat(40))).toHaveLength(32);
  });

  it("returns empty string for input with no allowed chars", () => {
    expect(slugify("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/utils/slug.test.ts
```

Expected: 6 failing tests, all because `slugify` is not exported.

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/slug.ts

// Derives a URL-safe tenant slug from a free-text workspace name.
// Output matches the database constraint: ^[a-z0-9-]{1,32}$.
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, ""); // re-strip trailing dash if truncation produced one
}

export const SLUG_RE = /^[a-z0-9-]{1,32}$/;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/utils/slug.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/slug.ts src/utils/slug.test.ts
git commit -m "Add slugify utility for tenant slug derivation"
```

---

### Task 3.2: signupRequests + platformAdmin services

**Files:**
- Create: `src/services/signupRequests.ts`
- Create: `src/services/platformAdmin.ts`

- [ ] **Step 1: Write `signupRequests.ts`**

```typescript
// src/services/signupRequests.ts
import { supabase } from "../lib/supabaseClient";

export type SignupRequestStatus = "pending" | "approved" | "declined";

export interface SignupRequest {
  id: string;
  email: string;
  workspace_name: string;
  use_case: string | null;
  referral_source: string | null;
  status: SignupRequestStatus;
  declined_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_tenant_id: string | null;
  created_at: string;
}

export interface SubmitSignupRequestInput {
  email: string;
  workspace_name: string;
  use_case?: string;
  referral_source?: string;
}

export async function submitSignupRequest(
  input: SubmitSignupRequestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("signup_requests").insert({
    email: input.email.trim().toLowerCase(),
    workspace_name: input.workspace_name.trim(),
    use_case: input.use_case?.trim() || null,
    referral_source: input.referral_source || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "already_pending" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listSignupRequests(
  status?: SignupRequestStatus,
): Promise<SignupRequest[]> {
  let query = supabase
    .from("signup_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SignupRequest[];
}

export async function approveSignupRequest(input: {
  request_id: string;
  slug: string;
  granted_until: string | null;
}): Promise<{ ok: true; tenant_id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("approve_signup_request", {
    body: input,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, tenant_id: data.tenant_id };
}

export async function declineSignupRequest(input: {
  request_id: string;
  reason: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("decline_signup_request", {
    body: input,
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}
```

- [ ] **Step 2: Write `platformAdmin.ts`**

```typescript
// src/services/platformAdmin.ts
import { supabase } from "../lib/supabaseClient";

export async function checkIsPlatformAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/signupRequests.ts src/services/platformAdmin.ts
git commit -m "Add signupRequests and platformAdmin service modules"
```

---

### Task 3.3: PlatformAdminContext

**Files:**
- Create: `src/context/PlatformAdminContext.tsx`

- [ ] **Step 1: Write the context**

```tsx
// src/context/PlatformAdminContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { checkIsPlatformAdmin } from "../services/platformAdmin";

interface PlatformAdminContextValue {
  isPlatformAdmin: boolean;
  loading: boolean;
}

const PlatformAdminContext = createContext<PlatformAdminContextValue>({
  isPlatformAdmin: false,
  loading: true,
});

export const PlatformAdminProvider = ({ children }: { children: ReactNode }) => {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id ?? null;
      const result = await checkIsPlatformAdmin(userId);
      if (cancelled) return;
      setIsPlatformAdmin(result);
      setLoading(false);
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <PlatformAdminContext.Provider value={{ isPlatformAdmin, loading }}>
      {children}
    </PlatformAdminContext.Provider>
  );
};

export const usePlatformAdmin = () => useContext(PlatformAdminContext);
```

- [ ] **Step 2: Wire the provider in `main.tsx`**

Locate `src/main.tsx`. Wrap the existing `<App />` (which is already inside `<TenantProvider>` and `<ThemeProvider>`) with `<PlatformAdminProvider>` as the innermost wrapper around `<App />`.

Modify: open `src/main.tsx`, add the import:

```tsx
import { PlatformAdminProvider } from "./context/PlatformAdminContext";
```

And wrap `<App />`:

```tsx
<PlatformAdminProvider>
  <App />
</PlatformAdminProvider>
```

- [ ] **Step 3: Commit**

```bash
git add src/context/PlatformAdminContext.tsx src/main.tsx
git commit -m "Add PlatformAdminContext provider"
```

---

### Task 3.4: SignupPage component

**Files:**
- Create: `src/components/SignupPage.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/SignupPage.tsx
import { motion } from "framer-motion";
import { useState } from "react";
import { submitSignupRequest } from "../services/signupRequests";

const REFERRAL_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "google", label: "Google" },
  { value: "twitter", label: "Twitter" },
  { value: "friend", label: "Friend or colleague" },
  { value: "other", label: "Other" },
];

const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");

    const validEmail = /.+@.+\..+/.test(email);
    if (!validEmail) { setError("Please enter a valid email."); return; }
    if (!workspaceName.trim()) { setError("Workspace name is required."); return; }

    setSubmitting(true);
    const result = await submitSignupRequest({
      email,
      workspace_name: workspaceName,
      use_case: useCase,
      referral_source: referralSource,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.error === "already_pending") {
        setError("You already have a pending request — we'll email you when it's reviewed.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
          <h1 className="text-xl font-semibold tracking-tight">Request received</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Thanks. We'll email you at <strong>{email}</strong> when access is granted.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)]">
        <h1 className="text-xl font-semibold tracking-tight">Request access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us a bit about your business. We review every request and grant access manually.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="Workspace name">
            <input type="text" required maxLength={60} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Inc"
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="How will you use this? (optional)">
            <textarea rows={3} maxLength={500} value={useCase} onChange={(e) => setUseCase(e.target.value)}
              placeholder="A few sentences about your inventory and team."
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </Field>
          <Field label="How'd you hear about us? (optional)">
            <select value={referralSource} onChange={(e) => setReferralSource(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
              {REFERRAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
            {submitting ? "Submitting…" : "Request access"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-left text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:text-[11px] sm:tracking-[0.3em]">
    {label}
    {children}
  </label>
);

export default SignupPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SignupPage.tsx
git commit -m "Add public SignupPage component"
```

---

### Task 3.5: Wire `/signup` route into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a route gate that detects the apex domain and renders SignupPage**

Open `src/App.tsx`. After the `tenantError` check (currently around line 243-247) but before the `if (!session) return <LoginForm…>` line, add:

```tsx
// On the apex domain (no tenant subdomain), `/signup` shows the public request form.
// `tenantError` is set when no tenant matches the current host — including the apex.
const isApexSignup = typeof window !== "undefined"
  && location.pathname === "/signup"
  && tenantError;
if (isApexSignup) return <SignupPage />;
```

Add the import at the top:

```tsx
import SignupPage from "./components/SignupPage";
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Visit `http://localhost:5173/signup`. Expected: SignupPage renders. Submit with email + workspace name; verify in psql:

```sql
select * from public.signup_requests order by created_at desc limit 1;
```

A pending row should appear.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Wire /signup route on apex domain"
```

---

### Task 3.6: AdminLayout (route gate for `/admin/*`)

**Files:**
- Create: `src/components/admin/AdminLayout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// src/components/admin/AdminLayout.tsx
import { Navigate, Outlet } from "react-router-dom";
import { usePlatformAdmin } from "../../context/PlatformAdminContext";

const AdminLayout = () => {
  const { isPlatformAdmin, loading } = usePlatformAdmin();
  if (loading) return null;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-6 py-4">
        <h1 className="text-sm font-semibold uppercase tracking-[0.3em]">Platform admin</h1>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/AdminLayout.tsx
git commit -m "Add AdminLayout with platform-admin gate"
```

---

### Task 3.7: ApproveRequestModal

**Files:**
- Create: `src/components/admin/ApproveRequestModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/admin/ApproveRequestModal.tsx
import { useEffect, useState } from "react";
import { approveSignupRequest, type SignupRequest } from "../../services/signupRequests";
import { SLUG_RE, slugify } from "../../utils/slug";

const DURATIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "forever", label: "Forever" },
];

interface Props {
  request: SignupRequest;
  onClose: () => void;
  onApproved: () => void;
}

const ApproveRequestModal = ({ request, onClose, onApproved }: Props) => {
  const [slug, setSlug] = useState(slugify(request.workspace_name));
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setSlug(slugify(request.workspace_name)); }, [request.id, request.workspace_name]);

  const computeGrantedUntil = (): string | null => {
    if (duration === "forever") return null;
    const days = Number(duration);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    if (!SLUG_RE.test(slug)) {
      setError("Slug must be 1–32 chars, lowercase letters, numbers, or dashes.");
      return;
    }
    setSubmitting(true);
    const result = await approveSignupRequest({
      request_id: request.id,
      slug,
      granted_until: computeGrantedUntil(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onApproved();
  };

  return (
    <Backdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-lg font-semibold">Approve request</h2>
        <p className="text-sm text-muted-foreground">
          Granting access for <strong>{request.email}</strong> ({request.workspace_name}).
        </p>

        <Field label="Slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required
            className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
        </Field>

        <Field label="Access duration">
          <select value={duration} onChange={(e) => setDuration(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25">
            {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
            {error === "slug_taken" ? "That slug is already taken — try another." : error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
            {submitting ? "Approving…" : "Approve"}
          </button>
        </div>
      </form>
    </Backdrop>
  );
};

const Backdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
    {label}
    {children}
  </label>
);

export default ApproveRequestModal;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/ApproveRequestModal.tsx
git commit -m "Add ApproveRequestModal"
```

---

### Task 3.8: DeclineRequestModal

**Files:**
- Create: `src/components/admin/DeclineRequestModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/admin/DeclineRequestModal.tsx
import { useState } from "react";
import { declineSignupRequest, type SignupRequest } from "../../services/signupRequests";

interface Props {
  request: SignupRequest;
  onClose: () => void;
  onDeclined: () => void;
}

const DeclineRequestModal = ({ request, onClose, onDeclined }: Props) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await declineSignupRequest({
      request_id: request.id,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    onDeclined();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Decline request</h2>
          <p className="text-sm text-muted-foreground">
            Decline {request.email}'s request for <strong>{request.workspace_name}</strong>?
          </p>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Reason (optional, internal)
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </label>
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-2xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60">
              {submitting ? "Declining…" : "Decline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeclineRequestModal;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DeclineRequestModal.tsx
git commit -m "Add DeclineRequestModal"
```

---

### Task 3.9: RequestsPage

**Files:**
- Create: `src/components/admin/RequestsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/components/admin/RequestsPage.tsx
import { useEffect, useState } from "react";
import { listSignupRequests, type SignupRequest, type SignupRequestStatus } from "../../services/signupRequests";
import ApproveRequestModal from "./ApproveRequestModal";
import DeclineRequestModal from "./DeclineRequestModal";

const TABS: SignupRequestStatus[] = ["pending", "approved", "declined"];

const RequestsPage = () => {
  const [tab, setTab] = useState<SignupRequestStatus>("pending");
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<SignupRequest | null>(null);
  const [declining, setDeclining] = useState<SignupRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listSignupRequests(tab);
      setRequests(rows);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [tab]);

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full border border-border/40 bg-muted p-1 text-xs font-semibold uppercase tracking-[0.25em]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {tab} requests.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <tr>
              <th className="py-2">Submitted</th>
              <th>Email</th>
              <th>Workspace</th>
              <th>Use case</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.email}</td>
                <td>{r.workspace_name}</td>
                <td className="max-w-xs truncate text-muted-foreground" title={r.use_case ?? ""}>{r.use_case ?? "—"}</td>
                <td className="text-muted-foreground">{r.referral_source ?? "—"}</td>
                <td className="text-right">
                  {r.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setApproving(r)} className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">Approve</button>
                      <button onClick={() => setDeclining(r)} className="rounded-full border border-border/40 px-3 py-1 text-xs">Decline</button>
                    </div>
                  )}
                  {r.status === "declined" && r.declined_reason && (
                    <span className="text-xs text-muted-foreground" title={r.declined_reason}>Declined</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {approving && (
        <ApproveRequestModal
          request={approving}
          onClose={() => setApproving(null)}
          onApproved={() => { setApproving(null); void load(); }} />
      )}
      {declining && (
        <DeclineRequestModal
          request={declining}
          onClose={() => setDeclining(null)}
          onDeclined={() => { setDeclining(null); void load(); }} />
      )}
    </div>
  );
};

export default RequestsPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/RequestsPage.tsx
git commit -m "Add RequestsPage with approve/decline actions"
```

---

### Task 3.10: Wire `/admin/*` routes into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the routes**

Open `src/App.tsx`. Add imports near the top:

```tsx
import AdminLayout from "./components/admin/AdminLayout";
import RequestsPage from "./components/admin/RequestsPage";
```

In the `<Routes>` block (currently inside the `tenant.isOnboarded` branch, but the admin UI should work even without a tenant context — it's a platform-level surface), the cleanest fix is to short-circuit `/admin/*` *before* the tenant context checks.

After the `if (forwardingSession || checkingSession || tenantLoading) return null;` line (around line 232), and after the `isApexSignup` check, add:

```tsx
// Platform admin surface — accessible from any host as long as the user is signed in.
const isAdminRoute = location.pathname.startsWith("/admin");
if (isAdminRoute) {
  if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/admin/requests" element={<RequestsPage />} />
        <Route path="/admin" element={<Navigate to="/admin/requests" replace />} />
      </Route>
    </Routes>
  );
}
```

`AdminLayout` itself gates non-platform-admins via `usePlatformAdmin`.

- [ ] **Step 2: End-to-end smoke test of Flow A**

1. `npm run dev` → open `http://localhost:5173/signup`
2. Submit a request (email: `test@acme.test`, workspace: `Acme`)
3. In another tab, sign in as the seeded platform admin
4. Visit `http://localhost:5173/admin/requests` — verify the pending request appears
5. Click Approve → confirm dialog with slug `acme`, duration 30 days → submit
6. Check Mailpit (Supabase local mail UI at `http://127.0.0.1:54324`) — the invite email to `test@acme.test` should be visible
7. Click the magic link → verify it redirects to `http://acme.localhost:5173/` (or the equivalent BASE_DOMAIN-aware URL)
8. Set password → land on the existing onboarding wizard

If subdomain routing on localhost is awkward, override `VITE_TENANT_SLUG=acme` in `.env.local` for the dev session.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Wire /admin/requests route + admin layout"
```

---

## Phase 4 — Teammate-invitation Edge Functions

### Task 4.1: `create_tenant_invitation` Edge Function

**Files:**
- Create: `supabase/functions/create_tenant_invitation/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/create_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body {
  tenant_id: string;
  email: string;
  role: "admin" | "member";
}

const EMAIL_RE = /.+@.+\..+/;
const INVITE_TTL_DAYS = 7;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.tenant_id || !body.email || !body.role) return errorResponse("missing_fields", 400, cors);
  if (!EMAIL_RE.test(body.email)) return errorResponse("invalid_email", 400, cors);
  if (body.role !== "admin" && body.role !== "member") return errorResponse("invalid_role", 400, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, body.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  const normalizedEmail = body.email.trim().toLowerCase();

  // Active invitation?
  const { data: existingInvite } = await admin
    .from("tenant_invitations")
    .select("id")
    .eq("tenant_id", body.tenant_id)
    .ilike("email", normalizedEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingInvite) return errorResponse("already_invited", 409, cors);

  // Already a member?
  const { data: tenant } = await admin
    .from("tenants").select("slug").eq("id", body.tenant_id).maybeSingle();
  if (!tenant) return errorResponse("tenant_not_found", 404, cors);

  const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = usersList?.users.find(
    (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
  );
  if (existingUser) {
    const { data: existingMember } = await admin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", body.tenant_id)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMember) return errorResponse("already_member", 409, cors);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const redirectTo = `https://${tenant.slug}.${baseDomain}/accept-invite?token=${token}`;

  const { data: invitation, error: insertErr } = await admin
    .from("tenant_invitations")
    .insert({
      tenant_id: body.tenant_id,
      email: normalizedEmail,
      role: body.role,
      token,
      invited_by: guard.userId,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();
  if (insertErr) return errorResponse("insert_failed", 500, cors);

  const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo },
  );
  if (emailErr) {
    // Don't roll back the invitation row — admin can resend.
    return jsonResponse(
      { invitation_id: invitation.id, expires_at: invitation.expires_at, email_warning: emailErr.message },
      { status: 200 },
      cors,
    );
  }

  return jsonResponse(
    { invitation_id: invitation.id, expires_at: invitation.expires_at },
    { status: 200 },
    cors,
  );
});
```

- [ ] **Step 2: Smoke-test**

```bash
supabase functions serve create_tenant_invitation --env-file ./supabase/.env.local
```

Get a tenant-admin JWT (sign in as the test admin from phase 3). Run:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/create_tenant_invitation \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"<tenant-id>","email":"teammate@acme.test","role":"member"}'
```

Expected: HTTP 200 `{"invitation_id":"...","expires_at":"..."}`. Verify in psql:

```sql
select id, email, token, role, expires_at from public.tenant_invitations order by created_at desc limit 1;
```

Re-run with same email → HTTP 409 `already_invited`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create_tenant_invitation/
git commit -m "Add create_tenant_invitation Edge Function"
```

---

### Task 4.2: `accept_tenant_invitation` Edge Function

**Files:**
- Create: `supabase/functions/accept_tenant_invitation/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/accept_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireAuthenticatedUser } from "../_shared/authGuards.ts";

interface Body { token: string; }

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.token) return errorResponse("missing_token", 400, cors);

  const caller = createCallerClient(req);
  const auth = await requireAuthenticatedUser(caller);
  if ("error" in auth) return errorResponse(auth.error, 401, cors);

  const admin = createAdminClient();

  const { data: invitation, error: fetchErr } = await admin
    .from("tenant_invitations")
    .select("*")
    .eq("token", body.token)
    .maybeSingle();
  if (fetchErr) return errorResponse("fetch_failed", 500, cors);
  if (!invitation) return errorResponse("invalid_token", 404, cors);
  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return errorResponse("revoked", 410, cors);
  if (new Date(invitation.expires_at) <= new Date()) return errorResponse("expired", 410, cors);

  if ((auth.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    return errorResponse("email_mismatch", 403, cors);
  }

  const { error: memberErr } = await admin
    .from("tenant_members")
    .upsert(
      { tenant_id: invitation.tenant_id, user_id: auth.userId, role: invitation.role },
      { onConflict: "tenant_id,user_id" },
    );
  if (memberErr) return errorResponse("member_insert_failed", 500, cors);

  const { error: updateErr } = await admin
    .from("tenant_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);
  if (updateErr) return errorResponse("invitation_update_failed", 500, cors);

  return jsonResponse(
    { tenant_id: invitation.tenant_id, role: invitation.role },
    { status: 200 },
    cors,
  );
});
```

- [ ] **Step 2: Smoke-test**

```bash
supabase functions serve accept_tenant_invitation --env-file ./supabase/.env.local
```

Get the test invitee's JWT (sign in via SPA after Supabase invite email lands them in dev). Use the token from Task 4.1's verified invitation:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/accept_tenant_invitation \
  -H "Authorization: Bearer <invitee-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"token":"<token>"}'
```

Expected: HTTP 200 `{"tenant_id":"...","role":"member"}`. Verify in psql:

```sql
select * from public.tenant_members where user_id = '<invitee-user-id>';
select accepted_at from public.tenant_invitations where token = '<token>';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/accept_tenant_invitation/
git commit -m "Add accept_tenant_invitation Edge Function"
```

---

### Task 4.3: `resend_tenant_invitation` and `revoke_tenant_invitation`

**Files:**
- Create: `supabase/functions/resend_tenant_invitation/index.ts`
- Create: `supabase/functions/revoke_tenant_invitation/index.ts`

- [ ] **Step 1: Write `resend_tenant_invitation/index.ts`**

```typescript
// supabase/functions/resend_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body { invitation_id: string; }

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.invitation_id) return errorResponse("missing_fields", 400, cors);

  const admin = createAdminClient();
  const baseDomain = Deno.env.get("BASE_DOMAIN") ?? "";
  if (!baseDomain) return errorResponse("missing_base_domain", 500, cors);

  const { data: invitation } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, email, token, accepted_at, revoked_at, expires_at, tenants:tenant_id(slug)")
    .eq("id", body.invitation_id)
    .maybeSingle();
  if (!invitation) return errorResponse("invitation_not_found", 404, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, invitation.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return errorResponse("revoked", 410, cors);

  // Refresh expiry to give recipient a fresh window.
  const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await admin.from("tenant_invitations").update({ expires_at: newExpires }).eq("id", invitation.id);

  // tenants:tenant_id(slug) embeds the slug; type is `{ slug: string } | { slug: string }[] | null`
  const tenantSlug = Array.isArray(invitation.tenants)
    ? invitation.tenants[0]?.slug
    : (invitation.tenants as { slug: string } | null)?.slug;
  if (!tenantSlug) return errorResponse("tenant_slug_missing", 500, cors);

  const redirectTo = `https://${tenantSlug}.${baseDomain}/accept-invite?token=${invitation.token}`;
  const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(
    invitation.email, { redirectTo },
  );
  if (emailErr) return errorResponse("email_failed", 500, cors);

  return jsonResponse({ ok: true, expires_at: newExpires }, { status: 200 }, cors);
});
```

- [ ] **Step 2: Write `revoke_tenant_invitation/index.ts`**

```typescript
// supabase/functions/revoke_tenant_invitation/index.ts
import { getCorsHeaders } from "../_shared/cors.ts";
import { errorResponse, jsonResponse } from "../_shared/json.ts";
import { createAdminClient, createCallerClient } from "../_shared/supabaseAdmin.ts";
import { requireTenantAdmin } from "../_shared/authGuards.ts";

interface Body { invitation_id: string; }

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405, cors);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("invalid_json", 400, cors); }
  if (!body.invitation_id) return errorResponse("missing_fields", 400, cors);

  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("tenant_invitations")
    .select("id, tenant_id, accepted_at, revoked_at")
    .eq("id", body.invitation_id)
    .maybeSingle();
  if (!invitation) return errorResponse("invitation_not_found", 404, cors);

  const caller = createCallerClient(req);
  const guard = await requireTenantAdmin(caller, invitation.tenant_id);
  if ("error" in guard) return errorResponse(guard.error, 403, cors);

  if (invitation.accepted_at) return errorResponse("already_accepted", 409, cors);
  if (invitation.revoked_at) return jsonResponse({ ok: true, already: true }, { status: 200 }, cors);

  const { error: updateErr } = await admin
    .from("tenant_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitation.id);
  if (updateErr) return errorResponse("update_failed", 500, cors);

  return jsonResponse({ ok: true }, { status: 200 }, cors);
});
```

- [ ] **Step 3: Smoke-test both functions**

For revoke:
```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/revoke_tenant_invitation \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"invitation_id":"<id>"}'
```
Expected: HTTP 200 `{"ok":true}`; second call returns `{"ok":true,"already":true}`.

For resend (use a fresh, non-revoked invitation):
```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/resend_tenant_invitation \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"invitation_id":"<id>"}'
```
Expected: HTTP 200 `{"ok":true,"expires_at":"..."}`. Verify Mailpit received a new email.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/resend_tenant_invitation/ supabase/functions/revoke_tenant_invitation/
git commit -m "Add resend_tenant_invitation and revoke_tenant_invitation Edge Functions"
```

---

## Phase 5 — Teammate-invitation client

### Task 5.1: invitations service module

**Files:**
- Create: `src/services/invitations.ts`

- [ ] **Step 1: Write the module**

```typescript
// src/services/invitations.ts
import { supabase } from "../lib/supabaseClient";

export interface TenantInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  created_at: string;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  role: "admin" | "member";
  email: string | null;
  created_at: string;
}

export async function listInvitations(tenantId: string): Promise<TenantInvitation[]> {
  const { data, error } = await supabase
    .from("tenant_invitations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TenantInvitation[];
}

// Note: emails come from a Postgres view that joins tenant_members with auth.users.
// If that view doesn't exist yet, returns rows without email — UI handles null.
export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  const { data, error } = await supabase
    .from("tenant_members_with_email") // see runbook for view definition (optional)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) {
    // Fallback: read tenant_members without email if the view doesn't exist.
    const { data: fallback } = await supabase
      .from("tenant_members")
      .select("tenant_id, user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    return ((fallback ?? []) as Omit<TenantMember, "email">[]).map((r) => ({ ...r, email: null }));
  }
  return (data ?? []) as TenantMember[];
}

export async function createInvitation(input: {
  tenant_id: string;
  email: string;
  role: "admin" | "member";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("create_tenant_invitation", { body: input });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function acceptInvitation(token: string):
  Promise<{ ok: true; tenant_id: string; role: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("accept_tenant_invitation", { body: { token } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, tenant_id: data.tenant_id, role: data.role };
}

export async function resendInvitation(invitation_id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("resend_tenant_invitation", { body: { invitation_id } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

export async function revokeInvitation(invitation_id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("revoke_tenant_invitation", { body: { invitation_id } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}
```

- [ ] **Step 2: Create a follow-up migration for the members-with-email view**

The `listMembers` function prefers a view that joins `tenant_members` with `auth.users`. This goes in its own migration file (rather than amending Task 1.1's already-committed migration, whose hash Supabase tracks).

Create `supabase/migrations/20260506000150_tenant_members_with_email_view.sql`:

```sql
-- Members-with-email read-only view (security_invoker, so RLS on tenant_members applies).
create or replace view public.tenant_members_with_email
with (security_invoker = true)
as
select
  tm.tenant_id,
  tm.user_id,
  tm.role,
  tm.created_at,
  u.email
from public.tenant_members tm
left join auth.users u on u.id = tm.user_id;

grant select on public.tenant_members_with_email to authenticated;
```

Apply locally:

```bash
supabase db reset
```

Expected: clean replay including the new migration.

- [ ] **Step 3: Commit**

```bash
git add src/services/invitations.ts supabase/migrations/20260506000150_tenant_members_with_email_view.sql
git commit -m "Add invitations service + tenant_members_with_email view"
```

---

### Task 5.2: AcceptInvitePage

**Files:**
- Create: `src/components/AcceptInvitePage.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/AcceptInvitePage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvitation } from "../services/invitations";
import { supabase } from "../lib/supabaseClient";
import LoginForm from "./LoginForm";

const TOKEN_STORAGE_KEY = "tenant_invitation_token";

const AcceptInvitePage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Persist token across the auth round-trip.
  const tokenFromUrl = params.get("token")?.trim() ?? "";
  if (typeof window !== "undefined" && tokenFromUrl) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
  }
  const token = tokenFromUrl
    || (typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "" : "");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
    };
    void check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setHasSession(!!session);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!hasSession || !token) return;
    let cancelled = false;
    const accept = async () => {
      const result = await acceptInvitation(token);
      if (cancelled) return;
      if (!result.ok) {
        setError(translateError(result.error));
        return;
      }
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      navigate("/", { replace: true });
    };
    void accept();
    return () => { cancelled = true; };
  }, [hasSession, token, navigate]);

  if (hasSession === null) return null;

  if (!token) {
    return <CenteredCard title="Invalid invitation link" body="No token found in this URL." />;
  }

  if (error) {
    return <CenteredCard title="Couldn't accept invite" body={error} />;
  }

  if (!hasSession) {
    return <LoginForm onSuccess={() => { /* effect above will pick up the new session */ }} />;
  }

  return <CenteredCard title="Joining workspace…" body="One moment." />;
};

const translateError = (code: string) => {
  switch (code) {
    case "expired": return "This invitation has expired. Ask the workspace admin for a new one.";
    case "revoked": return "This invitation has been revoked.";
    case "already_accepted": return "This invitation has already been used.";
    case "email_mismatch": return "This invitation is for a different email address.";
    case "invalid_token": return "This invitation link is invalid.";
    default: return "Something went wrong. Try again or contact your workspace admin.";
  }
};

const CenteredCard = ({ title, body }: { title: string; body: string }) => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    <div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
    </div>
  </div>
);

export default AcceptInvitePage;
```

- [ ] **Step 2: Wire `/accept-invite` route in App.tsx**

Open `src/App.tsx`, add import:

```tsx
import AcceptInvitePage from "./components/AcceptInvitePage";
```

Add a route guard near the apex-signup check (after `if (forwardingSession || …) return null;`):

```tsx
if (location.pathname === "/accept-invite") return <AcceptInvitePage />;
```

This bypasses tenant/membership checks — accepting an invite must work even when the user has no membership yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/AcceptInvitePage.tsx src/App.tsx
git commit -m "Add /accept-invite route + page"
```

---

### Task 5.3: MembersList + InvitationsList components

**Files:**
- Create: `src/components/members/MembersList.tsx`
- Create: `src/components/members/InvitationsList.tsx`

- [ ] **Step 1: Write `MembersList.tsx`**

```tsx
// src/components/members/MembersList.tsx
import type { TenantMember } from "../../services/invitations";

const MembersList = ({ members }: { members: TenantMember[] }) => {
  if (members.length === 0) return <p className="text-sm text-muted-foreground">No members yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        <tr>
          <th className="py-2">Email</th>
          <th>Role</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {members.map((m) => (
          <tr key={m.user_id}>
            <td className="py-3">{m.email ?? <span className="text-muted-foreground">—</span>}</td>
            <td>{m.role}</td>
            <td className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default MembersList;
```

- [ ] **Step 2: Write `InvitationsList.tsx`**

```tsx
// src/components/members/InvitationsList.tsx
import { useState } from "react";
import { resendInvitation, revokeInvitation, type TenantInvitation } from "../../services/invitations";

interface Props {
  invitations: TenantInvitation[];
  onChanged: () => void;
}

const InvitationsList = ({ invitations, onChanged }: Props) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const isPending = (i: TenantInvitation) =>
    !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date();
  const isExpired = (i: TenantInvitation) =>
    !i.accepted_at && !i.revoked_at && new Date(i.expires_at) <= new Date();

  const pending = invitations.filter(isPending);
  const expired = invitations.filter(isExpired);

  const handleResend = async (id: string) => {
    setBusyId(id);
    await resendInvitation(id);
    setBusyId(null);
    onChanged();
  };
  const handleRevoke = async (id: string) => {
    setBusyId(id);
    await revokeInvitation(id);
    setBusyId(null);
    onChanged();
  };

  return (
    <div className="space-y-6">
      <Section title="Pending invitations" rows={pending} busyId={busyId}
        onResend={handleResend} onRevoke={handleRevoke} kind="pending" />
      {expired.length > 0 && (
        <Section title="Expired invitations" rows={expired} busyId={busyId}
          onResend={handleResend} onRevoke={handleRevoke} kind="expired" />
      )}
    </div>
  );
};

const Section = ({ title, rows, busyId, onResend, onRevoke, kind }: {
  title: string; rows: TenantInvitation[]; busyId: string | null;
  onResend: (id: string) => void; onRevoke: (id: string) => void;
  kind: "pending" | "expired";
}) => {
  if (rows.length === 0 && kind === "pending") {
    return <div><h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{title}</h3><p className="mt-2 text-sm text-muted-foreground">None.</p></div>;
  }
  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <tr><th className="py-2">Email</th><th>Role</th><th>Expires</th><th></th></tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((i) => (
            <tr key={i.id}>
              <td className="py-3">{i.email}</td>
              <td>{i.role}</td>
              <td className="text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</td>
              <td className="text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onResend(i.id)} disabled={busyId === i.id}
                    className="rounded-full border border-border/40 px-3 py-1 text-xs disabled:opacity-50">Resend</button>
                  <button onClick={() => onRevoke(i.id)} disabled={busyId === i.id}
                    className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-600 disabled:opacity-50">Revoke</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InvitationsList;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/members/
git commit -m "Add MembersList and InvitationsList components"
```

---

### Task 5.4: InviteMemberModal

**Files:**
- Create: `src/components/members/InviteMemberModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/members/InviteMemberModal.tsx
import { useState } from "react";
import { createInvitation } from "../../services/invitations";

interface Props {
  tenantId: string;
  onClose: () => void;
  onInvited: () => void;
}

const InviteMemberModal = ({ tenantId, onClose, onInvited }: Props) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError("");
    if (!/.+@.+\..+/.test(email)) { setError("Enter a valid email."); return; }
    setSubmitting(true);
    const result = await createInvitation({ tenant_id: tenantId, email, role });
    setSubmitting(false);
    if (!result.ok) { setError(translateError(result.error)); return; }
    onInvited();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border/40 bg-card p-6 shadow-[var(--shadow-card)]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">Invite teammate</h2>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-ring/60 focus:ring-2 focus:ring-ring/25" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Role</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="member" checked={role === "member"} onChange={() => setRole("member")} /> Member
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="admin" checked={role === "admin"} onChange={() => setRole("admin")} /> Admin
            </label>
          </fieldset>
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-600">{error}</div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-2 text-sm border border-border/40">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const translateError = (code: string) => {
  switch (code) {
    case "already_invited": return "There's already a pending invite for that email.";
    case "already_member": return "That user is already a member of this workspace.";
    case "invalid_email": return "Enter a valid email.";
    default: return "Something went wrong. Please try again.";
  }
};

export default InviteMemberModal;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/members/InviteMemberModal.tsx
git commit -m "Add InviteMemberModal"
```

---

### Task 5.5: MembersPage

**Files:**
- Create: `src/components/members/MembersPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/components/members/MembersPage.tsx
import { useEffect, useState } from "react";
import { useTenant } from "../../context/TenantContext";
import {
  listInvitations, listMembers,
  type TenantInvitation, type TenantMember,
} from "../../services/invitations";
import InviteMemberModal from "./InviteMemberModal";
import InvitationsList from "./InvitationsList";
import MembersList from "./MembersList";

interface Props { canInvite: boolean; }

const MembersPage = ({ canInvite }: Props) => {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([listMembers(tenantId), listInvitations(tenantId)]);
      setMembers(m);
      setInvitations(i);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [tenantId]);

  if (!tenantId) return null;

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Members</h1>
        {canInvite && (
          <button onClick={() => setShowInvite(true)}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Invite teammate
          </button>
        )}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <MembersList members={members} />
          {canInvite && <InvitationsList invitations={invitations} onChanged={load} />}
        </>
      )}

      {showInvite && (
        <InviteMemberModal
          tenantId={tenantId}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); void load(); }} />
      )}
    </div>
  );
};

export default MembersPage;
```

- [ ] **Step 2: Wire `/members` route in App.tsx**

Open `src/App.tsx`, add import:

```tsx
import MembersPage from "./components/members/MembersPage";
```

Inside the existing `<Routes>` block (which renders inside the tenant-active branch), add:

```tsx
<Route
  path="/members"
  element={<MembersPage canInvite={isAdmin} />}
/>
```

- [ ] **Step 3: End-to-end smoke test of Flow B**

1. Sign in as the tenant admin from phase 3 smoke test
2. Navigate to `/members` — verify the admin appears in members list
3. Click "Invite teammate", enter `teammate@acme.test`, role member, submit
4. Verify invitation row appears in the pending list
5. Open Mailpit (`http://127.0.0.1:54324`) — invite email present
6. Click the magic link → land on `/accept-invite?token=…`
7. Set password (Supabase invite flow) → page calls `accept_tenant_invitation` → redirects to `/`
8. Verify in psql that a `tenant_members` row was inserted and the invitation row has `accepted_at` set

- [ ] **Step 4: Commit**

```bash
git add src/components/members/MembersPage.tsx src/App.tsx
git commit -m "Wire /members route and end-to-end teammate invite flow"
```

---

## Phase 6 — Granted-until locked-state wall

### Task 6.1: WorkspaceLockedWall component

**Files:**
- Create: `src/components/WorkspaceLockedWall.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/WorkspaceLockedWall.tsx
import { useTenant } from "../context/TenantContext";
import { supabase } from "../lib/supabaseClient";

interface Props { reason: "expired" | "locked"; }

const WorkspaceLockedWall = ({ reason }: Props) => {
  const { tenant } = useTenant();
  const handleLogout = async () => { await supabase.auth.signOut(); };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-[var(--radius-card)] border border-border/40 bg-card p-8 shadow-[var(--shadow-card)] text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          {reason === "expired" ? "Subscription expired" : "Workspace inactive"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Access to <strong>{tenant?.companyName ?? "this workspace"}</strong> is currently disabled.
          Contact <a href="mailto:support@warehouse.app" className="underline">support@warehouse.app</a> to renew.
        </p>
        <button onClick={handleLogout}
          className="mt-6 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground hover:bg-primary/90">
          Sign out
        </button>
      </div>
    </div>
  );
};

export default WorkspaceLockedWall;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/WorkspaceLockedWall.tsx
git commit -m "Add WorkspaceLockedWall component"
```

---

### Task 6.2: Surface `granted_until` through TenantContext

**Files:**
- Modify: `src/context/TenantContext.tsx`

- [ ] **Step 1: Read the current TenantContext to find the right spot**

```bash
cat src/context/TenantContext.tsx
```

Identify where the tenant row is mapped to the `Tenant` shape consumed by the SPA. Look for the SELECT call (likely `from('tenants').select(…)`) and the mapping function/object that builds the context value.

- [ ] **Step 2: Add `grantedUntil` to the SELECT and the mapped shape**

Edit `src/context/TenantContext.tsx`:

- Add `granted_until` to the column list of the tenant SELECT (e.g., change `'id, slug, company_name, …'` to include `granted_until`).
- Extend the local Tenant type with `grantedUntil: string | null`.
- In the mapping, `grantedUntil: row.granted_until ?? null`.

If the file uses an inferred shape from Supabase types, also export the new field through the context value.

- [ ] **Step 3: Commit**

```bash
git add src/context/TenantContext.tsx
git commit -m "Surface tenants.granted_until through TenantContext"
```

---

### Task 6.3: Gate routes on granted_until

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the gate**

Open `src/App.tsx`. Add the import:

```tsx
import WorkspaceLockedWall from "./components/WorkspaceLockedWall";
```

After membership resolves (after `if (checkingMembership) return null;`) and before the `if (!tenant.isOnboarded)` branch, insert:

```tsx
const grantedUntil = tenant.grantedUntil ? new Date(tenant.grantedUntil) : null;
const isExpired = !grantedUntil || grantedUntil <= new Date();
if (isExpired) {
  return <WorkspaceLockedWall reason={grantedUntil ? "expired" : "locked"} />;
}
```

This affects both admins and members. To allow admins through (e.g., to renew via support, view a billing page later) we'd add a role check — but per the spec there's no in-app renew/billing surface yet, so locking everyone uniformly is correct.

- [ ] **Step 2: Smoke test**

In psql, expire the test tenant:

```sql
update public.tenants set granted_until = now() - interval '1 hour' where slug = 'acme';
```

Reload `http://acme.localhost:5173/` (or your equivalent dev URL). Expected: the locked wall renders. Then restore:

```sql
update public.tenants set granted_until = now() + interval '30 days' where slug = 'acme';
```

Reload — dashboard returns.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Gate workspace access on granted_until"
```

---

## Phase 7 — Legacy cleanup

### Task 7.1: Remove signup mode + invite handling from LoginForm

**Files:**
- Modify: `src/components/LoginForm.tsx`

- [ ] **Step 1: Strip signup mode + invite logic**

Open `src/components/LoginForm.tsx`. Make these changes:

1. Delete the `INVITE_STORAGE_KEY` constant and `readInviteFromUrl`, `readInviteFromStorage`, `storeInvite` helpers.
2. Remove the `useEffect` that reads/stores the invite from the URL.
3. In `handleSubmit`, remove the `inviteCode` reading and `redirectParams.set('invite', …)` line.
4. Remove the entire `if (mode === 'signup') { … }` block — signup is no longer reachable from this form.
5. Remove the "Criar conta" / signup tab button from the JSX (the segmented control).
6. Update `AuthMode` import / local type to only include `'signin' | 'reset'`.
7. Replace the segmented control with a simple "Forgot password?" link (already present) — single-mode form, no toggle needed.
8. Add a small "Need an account? Request access" link below the form, pointing to `https://${BASE_DOMAIN}/signup` (read `VITE_BASE_DOMAIN` from env). On localhost without a base domain, link to `/signup` on apex (i.e., the dev server with no subdomain).

Resulting form modes: sign-in (default), reset.

- [ ] **Step 2: Update the AuthMode type if exported elsewhere**

Search for `AuthMode`:

```bash
grep -r "AuthMode" src/
```

If it's defined in `src/types/`, update the type definition to `'signin' | 'reset'` and check all usages compile.

- [ ] **Step 3: Run the build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginForm.tsx src/types/
git commit -m "Remove signup mode and invite handling from LoginForm"
```

---

### Task 7.2: Delete TenantInviteGate

**Files:**
- Delete: `src/components/TenantInviteGate.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove TenantInviteGate from App.tsx**

Open `src/App.tsx`. Find the branch:

```tsx
if (tenantError) {
  if (!inviteCode) return <SlugNotFound />;
  if (!session) return <LoginForm onSuccess={handleSuccessAuth} />;
  return <Onboarding onFinish={() => void refreshTenant()} inviteCode={inviteCode} />;
}
```

Replace with:

```tsx
if (tenantError) {
  // Apex /signup is handled above. For all other apex/subdomain mismatches,
  // SlugNotFound is the right answer.
  return <SlugNotFound />;
}
```

Also remove any `inviteCode` reading at the top of the App body and the `INVITE_STORAGE_KEY` constant — none of it is reachable anymore.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/TenantInviteGate.tsx
```

- [ ] **Step 3: Run the build**

```bash
npm run build
```

Expected: no errors. If `Onboarding` still imports `inviteCode` from props, also remove that prop from the call site (`<Onboarding onFinish={…} />`).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "Delete TenantInviteGate and remove invite-code branch from App.tsx"
```

---

### Task 7.3: Drop legacy invite system in DB

**Files:**
- Create: `supabase/migrations/20260506000200_drop_legacy_invite_system.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply locally**

```bash
supabase db reset
```

Expected: clean replay; all migrations apply.

- [ ] **Step 3: Verify legacy artifacts are gone**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.tenants" -c "select to_regclass('public.tenant_invites');"
```

Expected: `tenants` no longer has `allow_self_signup`; `tenant_invites` returns NULL.

- [ ] **Step 4: Final smoke test — all flows**

Re-seed a platform admin (per `docs/superpowers/runbooks/seed-platform-admin.md`) and verify each flow end-to-end:

1. **Flow A:** apex `/signup` → submit → admin `/admin/requests` → approve → magic-link email → set password → onboarding wizard appears
2. **Flow B:** tenant admin `/members` → invite teammate → magic-link email → accept → teammate lands as member
3. **Locked-state:** psql `update tenants set granted_until = now() - interval '1 hour'` → reload → wall renders → restore
4. **Legacy paths gone:** visiting `/?invite=ABC` should NOT trigger any tenant-invite UI; should fall through to the standard apex/subdomain logic

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506000200_drop_legacy_invite_system.sql
git commit -m "Drop legacy tenant_invites system"
```

---

### Task 7.4: Final cleanup pass

**Files:**
- Modify: any file still referencing `INVITE_STORAGE_KEY`, `tenant_invites`, `create_tenant_with_invite`, `mapInviteError`, `inviteCode`, etc.

- [ ] **Step 1: Find lingering references**

```bash
grep -rn "INVITE_STORAGE_KEY\|tenant_invites\|create_tenant_with_invite\|mapInviteError" src/ supabase/ docs/ || true
```

The only acceptable matches are in this plan / spec files. Any remaining code references are bugs to delete.

- [ ] **Step 2: Verify build + tests**

```bash
npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit if anything was touched**

```bash
git add -A
git commit -m "Remove last references to legacy invite system" || echo "nothing to commit"
```

---

## Verification checklist (run before opening PR)

- [ ] `supabase db reset` applies all migrations cleanly
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm test` passes (slug.test.ts and existing tests)
- [ ] Manual Flow A passes (signup → approve → land in workspace)
- [ ] Manual Flow B passes (invite teammate → accept → join)
- [ ] Manual locked-state verification passes
- [ ] No grep hits for legacy invite identifiers
- [ ] Platform-admin seed runbook is committed

## Rollback notes

If the new flow needs to be rolled back in production:

1. Revert the frontend commits — `LoginForm` and `App.tsx` go back to invite-code mode
2. Re-create `tenant_invites` and `create_tenant_with_invite()` from history (`git show <hash>:supabase/migrations/20251226000200_tenant_invites.sql`) and apply as a new migration
3. The new tables (`signup_requests`, `tenant_invitations`, `platform_admins`) and `tenants.granted_until` can stay; they're inert if nothing reads/writes them

## Notes on production deployment

- Set `BASE_DOMAIN`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for each Edge Function before deploying
- Deploy in this order: (1) migrations, (2) Edge Functions, (3) frontend. The frontend depends on both being live
- Run the platform-admin seed runbook immediately after migration deploy, or `/admin/requests` will be locked
- Existing tenants are backfilled to `granted_until = now() + 100 years` so they don't lock out
