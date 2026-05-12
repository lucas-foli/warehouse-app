-- The demo-request form (apex /demo) collects the submitter's role to help
-- platform admins triage. workspace_name is kept (NOT NULL) and reused as
-- "company name"; referral_source stays on the table but is dropped from the
-- new form.

alter table public.signup_requests
  add column if not exists role text;
