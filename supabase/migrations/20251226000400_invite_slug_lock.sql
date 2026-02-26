-- Invite slug lock (optional)

alter table public.tenant_invites
add column if not exists allowed_slug text;

create or replace function public.create_tenant_with_invite(invite_code text, slug text, company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	normalized_slug text;
	normalized_name text;
	tenant_id uuid;
	invite_record public.tenant_invites%rowtype;
begin
	if auth.uid() is null then
		raise exception 'not_authenticated';
	end if;

	normalized_slug := btrim(slug);
	if normalized_slug = '' then
		raise exception 'slug_required';
	end if;
	if char_length(normalized_slug) > 32 then
		raise exception 'slug_too_long';
	end if;

	select *
	into invite_record
	from public.tenant_invites
	where code = invite_code
		and is_active = true
		and (expires_at is null or expires_at > now())
	for update;

	if not found then
		raise exception 'invalid_invite';
	end if;

	if invite_record.allowed_slug is not null and btrim(invite_record.allowed_slug) <> normalized_slug then
		raise exception 'invite_slug_mismatch';
	end if;

	if invite_record.max_uses is not null and invite_record.uses >= invite_record.max_uses then
		raise exception 'invite_exhausted';
	end if;

	normalized_name := btrim(company_name);
	if normalized_name = '' then
		normalized_name := normalized_slug;
	end if;

	insert into public.tenants (slug, company_name)
	values (normalized_slug, normalized_name)
	returning id into tenant_id;

	insert into public.tenant_members (tenant_id, user_id, role)
	values (tenant_id, auth.uid(), 'admin');

	update public.tenant_invites
	set uses = uses + 1,
		is_active = case
			when max_uses is not null and uses + 1 >= max_uses then false
			else is_active
		end
	where code = invite_code;

	return tenant_id;
exception
	when unique_violation then
		raise exception 'slug_taken';
end;
$$;
