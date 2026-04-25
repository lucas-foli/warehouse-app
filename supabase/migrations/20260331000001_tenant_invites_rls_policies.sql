-- Security hardening: add RLS policies for tenant_invites.
-- RLS was enabled in 20251226000200 but no policies were created,
-- meaning no role could access the table through PostgREST.
-- Invites are global (no tenant_id column); scope access to the creator.

-- Creators can view their own invites.
drop policy if exists "Creators can read own invites" on public.tenant_invites;
create policy "Creators can read own invites"
on public.tenant_invites
for select
using (
	created_by = auth.uid()
);

-- Authenticated users can create invites (tracked via created_by).
drop policy if exists "Authenticated users can create invites" on public.tenant_invites;
create policy "Authenticated users can create invites"
on public.tenant_invites
for insert
with check (
	created_by = auth.uid()
);

-- Creators can delete their own invites.
drop policy if exists "Creators can delete own invites" on public.tenant_invites;
create policy "Creators can delete own invites"
on public.tenant_invites
for delete
using (
	created_by = auth.uid()
);
