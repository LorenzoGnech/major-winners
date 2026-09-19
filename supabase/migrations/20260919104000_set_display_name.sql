-- Username can be set at sign-in or on the profile, not only on first ranked queue.

create or replace function public.display_name_taken(p_display_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.profiles
		where lower(display_name) = lower(trim(p_display_name))
			and (auth.uid() is null or user_id <> auth.uid())
	);
$$;

create or replace function public.set_display_name(p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
	uid uuid := auth.uid();
	profile public.profiles;
	name text := trim(p_display_name);
begin
	if uid is null then
		raise exception 'Sign in required';
	end if;
	if name is null or name !~ '^[A-Za-z0-9_]{3,16}$' then
		raise exception 'Choose a 3–16 character username (letters, numbers, underscore)';
	end if;
	select * into profile from public.profiles where user_id = uid;
	if found then
		update public.profiles
		set display_name = name, updated_at = now()
		where user_id = uid
		returning * into profile;
		return profile;
	end if;
	insert into public.profiles (user_id, display_name)
	values (uid, name)
	returning * into profile;
	return profile;
exception
	when unique_violation then
		raise exception 'That name is taken';
end;
$$;

create or replace function public.ensure_ranked_profile(p_uid uuid, p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
	profile public.profiles;
	name text := trim(p_display_name);
begin
	select * into profile from public.profiles where user_id = p_uid;
	if found then
		return profile;
	end if;
	if name is null or name !~ '^[A-Za-z0-9_]{3,16}$' then
		raise exception 'Choose a 3–16 character username (letters, numbers, underscore)';
	end if;
	insert into public.profiles (user_id, display_name)
	values (p_uid, name)
	returning * into profile;
	return profile;
exception
	when unique_violation then
		raise exception 'That name is taken';
end;
$$;

revoke all on function public.display_name_taken(text) from public;
revoke all on function public.set_display_name(text) from public, anon;
revoke execute on function public.ensure_ranked_profile(uuid, text) from public, anon, authenticated;

grant execute on function public.display_name_taken(text) to anon, authenticated;
grant execute on function public.set_display_name(text) to authenticated;

notify pgrst, 'reload schema';
