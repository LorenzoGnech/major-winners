-- Casual 1v1 duel rooms. Mutations go through security-definer RPCs only.

create extension if not exists pgcrypto with schema extensions;

create table public.duels (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	status text not null default 'open',
	series_seed bigint not null,
	host_secret_hash text not null,
	guest_secret_hash text,
	host_roster jsonb,
	guest_roster jsonb,
	veto_log jsonb not null default '[]'::jsonb,
	map_queue jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint duels_status_check check (status in ('open', 'drafting', 'veto', 'playing')),
	constraint duels_code_check check (code ~ '^[A-HJ-NP-Z2-9]{6}$')
);

create index duels_created_at_idx on public.duels (created_at desc);

alter table public.duels enable row level security;

revoke all on table public.duels from public, anon, authenticated;

create or replace function public.duel_hash_secret(p_secret text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
	select encode(digest(p_secret, 'sha256'), 'hex');
$$;

create or replace function public.duel_new_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
	alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	candidate text;
	bytes bytea;
	i integer;
begin
	loop
		bytes := gen_random_bytes(6);
		candidate := '';
		for i in 0..5 loop
			candidate := candidate || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
		end loop;
		exit when not exists (select 1 from public.duels where code = candidate);
	end loop;
	return candidate;
end;
$$;

create or replace function public.duel_public_row(p_row public.duels, p_side text)
returns jsonb
language sql
stable
as $$
	select jsonb_build_object(
		'code', p_row.code,
		'status', p_row.status,
		'seriesSeed', p_row.series_seed,
		'side', p_side,
		'hostRoster', p_row.host_roster,
		'guestRoster', p_row.guest_roster,
		'vetoLog', p_row.veto_log,
		'mapQueue', p_row.map_queue
	);
$$;

create or replace function public.duel_slot(p_row public.duels, p_secret text)
returns text
language sql
stable
as $$
	select case
		when public.duel_hash_secret(p_secret) = p_row.host_secret_hash then 'host'
		when p_row.guest_secret_hash is not null
			and public.duel_hash_secret(p_secret) = p_row.guest_secret_hash then 'guest'
		else null
	end;
$$;

create or replace function public.create_duel()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	secret text := encode(gen_random_bytes(16), 'hex');
	row public.duels;
begin
	insert into public.duels (code, series_seed, host_secret_hash)
	values (
		public.duel_new_code(),
		(get_byte(gen_random_bytes(4), 0)::bigint << 24)
			+ (get_byte(gen_random_bytes(4), 1)::bigint << 16)
			+ (get_byte(gen_random_bytes(4), 2)::bigint << 8)
			+ get_byte(gen_random_bytes(4), 3)::bigint,
		public.duel_hash_secret(secret)
	)
	returning * into row;
	return public.duel_public_row(row, 'host') || jsonb_build_object('secret', secret, 'room', public.duel_public_row(row, 'host'));
end;
$$;

create or replace function public.join_duel(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	secret text := encode(gen_random_bytes(16), 'hex');
	row public.duels;
begin
	select * into row from public.duels where code = upper(trim(p_code)) for update;
	if not found then
		raise exception 'Room not found';
	end if;
	if row.guest_secret_hash is not null then
		raise exception 'Room is already full';
	end if;
	update public.duels
	set
		guest_secret_hash = public.duel_hash_secret(secret),
		status = 'drafting',
		updated_at = now()
	where id = row.id
	returning * into row;
	return public.duel_public_row(row, 'guest') || jsonb_build_object('secret', secret, 'room', public.duel_public_row(row, 'guest'));
end;
$$;

create or replace function public.fetch_duel(p_code text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	row public.duels;
	slot text;
begin
	select * into row from public.duels where code = upper(trim(p_code));
	if not found then
		raise exception 'Room not found';
	end if;
	slot := public.duel_slot(row, p_secret);
	if slot is null then
		raise exception 'Invalid room secret';
	end if;
	return public.duel_public_row(row, slot);
end;
$$;

create or replace function public.submit_duel_roster(p_code text, p_secret text, p_roster jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	row public.duels;
	slot text;
	host jsonb;
	guest jsonb;
	next_status text;
begin
	select * into row from public.duels where code = upper(trim(p_code)) for update;
	if not found then
		raise exception 'Room not found';
	end if;
	slot := public.duel_slot(row, p_secret);
	if slot is null then
		raise exception 'Invalid room secret';
	end if;
	if row.status not in ('open', 'drafting') then
		raise exception 'Rosters are locked';
	end if;
	if p_roster is null
		or coalesce(p_roster->>'teamName', '') = ''
		or coalesce(p_roster->>'coachId', '') = ''
		or p_roster->'roster' is null
	then
		raise exception 'Invalid roster';
	end if;
	if slot = 'host' then
		host := p_roster;
		guest := row.guest_roster;
	else
		host := row.host_roster;
		guest := p_roster;
	end if;
	next_status := case
		when host is not null and guest is not null then 'veto'
		when row.guest_secret_hash is not null then 'drafting'
		else 'open'
	end;
	update public.duels
	set
		host_roster = host,
		guest_roster = guest,
		status = next_status,
		updated_at = now()
	where id = row.id
	returning * into row;
	return public.duel_public_row(row, slot);
end;
$$;

create or replace function public.submit_duel_veto(p_code text, p_secret text, p_map_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	row public.duels;
	slot text;
	side integer;
	step integer;
	kind text;
	expected_side integer;
	used text[];
	pool constant text[] := array['mirage','dust2','inferno','nuke','ancient','anubis','overpass','cache','cobble'];
	action jsonb;
	next_log jsonb;
	leftover text;
	queue jsonb := '[]'::jsonb;
	pick jsonb;
begin
	select * into row from public.duels where code = upper(trim(p_code)) for update;
	if not found then
		raise exception 'Room not found';
	end if;
	slot := public.duel_slot(row, p_secret);
	if slot is null then
		raise exception 'Invalid room secret';
	end if;
	if row.status <> 'veto' then
		raise exception 'Veto is not open';
	end if;
	side := case when slot = 'host' then 0 else 1 end;
	step := jsonb_array_length(row.veto_log);
	if step >= 8 then
		raise exception 'Veto is already complete';
	end if;
	expected_side := step % 2;
	kind := case when step < 4 then 'ban' else 'pick' end;
	if side <> expected_side then
		raise exception 'Not your veto turn';
	end if;
	if not (p_map_id = any (pool)) then
		raise exception 'Unknown map';
	end if;
	select coalesce(array_agg(value->>'mapId'), '{}') into used
	from jsonb_array_elements(row.veto_log);
	if p_map_id = any (used) then
		raise exception 'Map already used';
	end if;
	action := jsonb_build_object('side', side, 'kind', kind, 'mapId', p_map_id);
	next_log := row.veto_log || jsonb_build_array(action);
	if jsonb_array_length(next_log) < 8 then
		update public.duels
		set veto_log = next_log, updated_at = now()
		where id = row.id
		returning * into row;
		return public.duel_public_row(row, slot);
	end if;
	select coalesce(array_agg(value->>'mapId'), '{}') into used
	from jsonb_array_elements(next_log);
	select value into leftover
	from unnest(pool) as value
	where value <> all (used)
	limit 1;
	for pick in
		select value
		from jsonb_array_elements(next_log) with ordinality as t(value, ordinality)
		where value->>'kind' = 'pick'
		order by ordinality
	loop
		queue := queue || jsonb_build_array(
			jsonb_build_object('mapId', pick->>'mapId', 'pickedBy', (pick->>'side')::int)
		);
	end loop;
	queue := queue || jsonb_build_array(jsonb_build_object('mapId', leftover));
	update public.duels
	set
		veto_log = next_log,
		map_queue = queue,
		status = 'playing',
		updated_at = now()
	where id = row.id
	returning * into row;
	return public.duel_public_row(row, slot);
end;
$$;

revoke execute on function public.duel_hash_secret(text) from public, anon, authenticated;
revoke execute on function public.duel_new_code() from public, anon, authenticated;
revoke execute on function public.duel_public_row(public.duels, text) from public, anon, authenticated;
revoke execute on function public.duel_slot(public.duels, text) from public, anon, authenticated;

grant execute on function public.create_duel() to anon, authenticated;
grant execute on function public.join_duel(text) to anon, authenticated;
grant execute on function public.fetch_duel(text, text) to anon, authenticated;
grant execute on function public.submit_duel_roster(text, text, jsonb) to anon, authenticated;
grant execute on function public.submit_duel_veto(text, text, text) to anon, authenticated;
