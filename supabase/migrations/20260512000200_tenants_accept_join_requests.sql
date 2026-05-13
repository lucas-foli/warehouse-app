-- Per-tenant kill switch for the "Request access" link on the branded login.
-- When false, the link is hidden on the tenant's login page and
-- submit_join_request silently drops submissions for the tenant
-- (anti-enumeration: same response as a non-existent slug).
--
-- Separate from tenants.allow_self_signup, which controls direct
-- self-insertion into tenant_members via RLS — a different mechanism with
-- different semantics, left untouched here.

alter table public.tenants
  add column if not exists accept_join_requests boolean not null default true;

comment on column public.tenants.accept_join_requests is
  'When false, hides the "Request access" link on this tenant''s login page and rejects join-request submissions.';
