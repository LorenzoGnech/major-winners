-- Ranked 1v1: profiles, poll matchmaking, Elo applied only when both clients agree.

alter table public.duels
	add column kind text not null default 'casual',
	add column host_user_id uuid references auth.users (id) on delete set null,
	add column guest_user_id uuid references auth.users (id) on delete set null,
	add column host_claim jsonb,
	add column guest_claim jsonb,
	add column elo_applied boolean not null default false,
	add column elo_result jsonb;

alter table public.duels
	add constraint duels_kind_check check (kind in ('casual', 'ranked'));

create table public.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null,
	elo integer not null default 1000,
	wins integer not null default 0,
	losses integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint profiles_display_name_check check (display_name ~ '^[A-Za-z0-9_]{3,16}$'),
	constraint profiles_elo_check check (elo >= 100),
	constraint profiles_wins_check check (wins >= 0),
	constraint profiles_losses_check check (losses >= 0)
);

create unique index profiles_display_name_lower_idx on public.profiles (lower(display_name));
create index profiles_elo_idx on public.profiles (elo desc, display_name);

alter table public.profiles enable row level security;

create policy "profiles_select_public"
	on public.profiles
	for select
	using (true);

grant select on table public.profiles to anon, authenticated;

create table public.ranked_queue (
	user_id uuid primary key references auth.users (id) on delete cascade,
	elo integer not null,
	joined_at timestamptz not null default now(),
	heartbeat timestamptz not null default now()
);

alter table public.ranked_queue enable row level security;
revoke all on table public.ranked_queue from public, anon, authenticated;

create table public.ranked_assignments (
	user_id uuid primary key references auth.users (id) on delete cascade,
	code text not null,
	secret text not null,
	side text not null,
	created_at timestamptz not null default now(),
	constraint ranked_assignments_side_check check (side in ('host', 'guest')),
	constraint ranked_assignments_code_check check (code ~ '^[A-HJ-NP-Z2-9]{6}$')
);

alter table public.ranked_assignments enable row level security;
revoke all on table public.ranked_assignments from public, anon, authenticated;

create or replace function public.duel_public_row(p_row public.duels, p_side text)
returns jsonb
language sql
stable
set search_path = public
as $$
	select jsonb_build_object(
		'code', p_row.code,
		'status', p_row.status,
		'seriesSeed', p_row.series_seed,
		'side', p_side,
		'kind', p_row.kind,
		'hostRoster', p_row.host_roster,
		'guestRoster', p_row.guest_roster,
		'vetoLog', p_row.veto_log,
		'mapQueue', p_row.map_queue,
		'hostName', (select display_name from public.profiles where user_id = p_row.host_user_id),
		'guestName', (select display_name from public.profiles where user_id = p_row.guest_user_id)
	);
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
	if row.kind = 'ranked' then
		raise exception 'This is a ranked match';
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
	return public.duel_public_row(row, 'guest')
		|| jsonb_build_object('secret', secret, 'room', public.duel_public_row(row, 'guest'));
end;
$$;

create or replace function public.ranked_search_window(p_joined_at timestamptz)
returns integer
language sql
stable
set search_path = public
as $$
	select least(400, 100 + 50 * floor(extract(epoch from (now() - p_joined_at)) / 5)::integer);
$$;

create or replace function public.next_elo(p_ra integer, p_rb integer, p_won boolean)
returns integer
language sql
immutable
set search_path = public
as $$
	select greatest(
		100,
		round(
			(
				p_ra + 32.0 * (
					(case when p_won then 1.0 else 0.0 end)
					- 1.0 / (1.0 + power(10.0, (p_rb - p_ra) / 400.0))
				)
			)::numeric
		)::integer
	);
$$;

create or replace function public.ranked_side_payload(
	p_uid uuid,
	p_row public.duels,
	p_pending boolean,
	p_mismatch boolean
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
	host public.profiles;
	guest public.profiles;
	you_name text;
	opp_name text;
	you_elo integer;
	opp_elo integer;
	you_delta integer;
	opp_delta integer;
	result jsonb := p_row.elo_result;
	host_block jsonb;
	guest_block jsonb;
	you_block jsonb;
	opp_block jsonb;
begin
	select * into host from public.profiles where user_id = p_row.host_user_id;
	select * into guest from public.profiles where user_id = p_row.guest_user_id;
	if result is not null then
		host_block := result->'host';
		guest_block := result->'guest';
		if p_uid = p_row.host_user_id then
			you_block := host_block;
			opp_block := guest_block;
		else
			you_block := guest_block;
			opp_block := host_block;
		end if;
		return jsonb_build_object(
			'pending', false,
			'eloApplied', true,
			'mismatch', false,
			'you', you_block,
			'opponent', opp_block
		);
	end if;
	if p_uid = p_row.host_user_id then
		you_name := host.display_name;
		you_elo := host.elo;
		opp_name := guest.display_name;
		opp_elo := guest.elo;
	else
		you_name := guest.display_name;
		you_elo := guest.elo;
		opp_name := host.display_name;
		opp_elo := host.elo;
	end if;
	you_delta := null;
	opp_delta := null;
	return jsonb_build_object(
		'pending', p_pending,
		'eloApplied', false,
		'mismatch', p_mismatch,
		'you', jsonb_build_object(
			'displayName', you_name,
			'elo', you_elo,
			'delta', you_delta
		),
		'opponent', jsonb_build_object(
			'displayName', opp_name,
			'elo', opp_elo,
			'delta', opp_delta
		)
	);
end;
$$;

create or replace function public.claim_ranked_assignment(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	assignment public.ranked_assignments;
	row public.duels;
begin
	select * into assignment from public.ranked_assignments where user_id = p_uid for update;
	if not found then
		return null;
	end if;
	select * into row from public.duels where code = assignment.code;
	delete from public.ranked_assignments where user_id = p_uid;
	if not found or row.id is null then
		return null;
	end if;
	return public.duel_public_row(row, assignment.side)
		|| jsonb_build_object(
			'matched', true,
			'secret', assignment.secret,
			'room', public.duel_public_row(row, assignment.side)
		);
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
		raise exception 'Choose a 3–16 character handle (letters, numbers, underscore)';
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

create or replace function public.queue_ranked_match(p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	uid uuid := auth.uid();
	profile public.profiles;
	claimed jsonb;
	me public.ranked_queue;
	opp public.ranked_queue;
	opp_id uuid;
	host_id uuid;
	guest_id uuid;
	host_secret text;
	guest_secret text;
	row public.duels;
	first uuid;
	search_window integer;
	now_ts timestamptz := now();
begin
	if uid is null then
		raise exception 'Sign in required';
	end if;
	claimed := public.claim_ranked_assignment(uid);
	if claimed is not null then
		return claimed;
	end if;
	profile := public.ensure_ranked_profile(uid, p_display_name);

	select * into me from public.ranked_queue where user_id = uid;
	select q.user_id into opp_id
	from public.ranked_queue q
	where q.user_id <> uid
		and q.heartbeat > now_ts - interval '15 seconds'
		and abs(q.elo - profile.elo) <= greatest(
			public.ranked_search_window(q.joined_at),
			case when me.user_id is null then 100 else public.ranked_search_window(me.joined_at) end
		)
	order by abs(q.elo - profile.elo), q.joined_at, q.user_id
	limit 1;

	if opp_id is not null then
		if uid < opp_id then
			first := uid;
		else
			first := opp_id;
		end if;
		if first = uid then
			perform 1 from public.ranked_queue where user_id = uid for update;
			select * into opp from public.ranked_queue where user_id = opp_id for update;
		else
			select * into opp from public.ranked_queue where user_id = opp_id for update;
			perform 1 from public.ranked_queue where user_id = uid for update;
		end if;
		select * into me from public.ranked_queue where user_id = uid;
	end if;

	if opp_id is not null
		and opp.user_id is not null
		and opp.heartbeat > now() - interval '15 seconds'
		and abs(opp.elo - profile.elo) <= greatest(
			public.ranked_search_window(opp.joined_at),
			case when me.user_id is null then 100 else public.ranked_search_window(me.joined_at) end
		)
	then
		if me.user_id is not null and (
			me.joined_at < opp.joined_at
			or (me.joined_at = opp.joined_at and me.user_id < opp.user_id)
		) then
			host_id := me.user_id;
			guest_id := opp.user_id;
		else
			host_id := opp.user_id;
			guest_id := uid;
		end if;
		host_secret := encode(gen_random_bytes(16), 'hex');
		guest_secret := encode(gen_random_bytes(16), 'hex');
		insert into public.duels (
			code,
			status,
			series_seed,
			host_secret_hash,
			guest_secret_hash,
			kind,
			host_user_id,
			guest_user_id
		)
		values (
			public.duel_new_code(),
			'drafting',
			(get_byte(gen_random_bytes(4), 0)::bigint << 24)
				+ (get_byte(gen_random_bytes(4), 1)::bigint << 16)
				+ (get_byte(gen_random_bytes(4), 2)::bigint << 8)
				+ get_byte(gen_random_bytes(4), 3)::bigint,
			public.duel_hash_secret(host_secret),
			public.duel_hash_secret(guest_secret),
			'ranked',
			host_id,
			guest_id
		)
		returning * into row;
		insert into public.ranked_assignments (user_id, code, secret, side)
		values
			(host_id, row.code, host_secret, 'host'),
			(guest_id, row.code, guest_secret, 'guest');
		delete from public.ranked_queue where user_id in (host_id, guest_id);
		claimed := public.claim_ranked_assignment(uid);
		if claimed is not null then
			return claimed;
		end if;
	end if;

	claimed := public.claim_ranked_assignment(uid);
	if claimed is not null then
		return claimed;
	end if;

	insert into public.ranked_queue (user_id, elo, joined_at, heartbeat)
	values (uid, profile.elo, now_ts, now())
	on conflict (user_id) do update
		set elo = excluded.elo, heartbeat = now();

	select * into me from public.ranked_queue where user_id = uid;
	search_window := public.ranked_search_window(me.joined_at);
	return jsonb_build_object(
		'matched', false,
		'elo', profile.elo,
		'window', search_window,
		'displayName', profile.display_name
	);
end;
$$;

create or replace function public.leave_ranked_queue()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	uid uuid := auth.uid();
begin
	if uid is null then
		raise exception 'Sign in required';
	end if;
	delete from public.ranked_queue where user_id = uid;
	return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.submit_ranked_result(
	p_code text,
	p_secret text,
	p_maps_won integer,
	p_maps_lost integer,
	p_rounds_won integer,
	p_rounds_lost integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
	uid uuid := auth.uid();
	row public.duels;
	slot text;
	claim jsonb;
	host_p public.profiles;
	guest_p public.profiles;
	host_won boolean;
	host_after integer;
	guest_after integer;
	host_delta integer;
	guest_delta integer;
	mismatch boolean := false;
begin
	if uid is null then
		raise exception 'Sign in required';
	end if;
	select * into row from public.duels where code = upper(trim(p_code)) for update;
	if not found then
		raise exception 'Room not found';
	end if;
	if row.kind <> 'ranked' then
		raise exception 'Not a ranked match';
	end if;
	if row.status <> 'playing' then
		raise exception 'Series is not finished';
	end if;
	slot := public.duel_slot(row, p_secret);
	if slot is null then
		raise exception 'Invalid room secret';
	end if;
	if slot = 'host' and row.host_user_id is distinct from uid then
		raise exception 'Sign in required';
	end if;
	if slot = 'guest' and row.guest_user_id is distinct from uid then
		raise exception 'Sign in required';
	end if;
	if row.elo_applied then
		return public.ranked_side_payload(uid, row, false, false);
	end if;

	if p_maps_won < 0 or p_maps_won > 3 or p_maps_lost < 0 or p_maps_lost > 3
		or p_rounds_won < 0 or p_rounds_lost < 0
		or (p_maps_won = 3) = (p_maps_lost = 3)
	then
		raise exception 'Invalid series score';
	end if;
	claim := jsonb_build_object(
		'mapsWon', p_maps_won,
		'mapsLost', p_maps_lost,
		'roundsWon', p_rounds_won,
		'roundsLost', p_rounds_lost,
		'won', p_maps_won > p_maps_lost
	);
	if slot = 'host' then
		row.host_claim := claim;
	else
		row.guest_claim := claim;
	end if;
	update public.duels
	set
		host_claim = row.host_claim,
		guest_claim = row.guest_claim,
		updated_at = now()
	where id = row.id
	returning * into row;

	if row.host_claim is null or row.guest_claim is null then
		return public.ranked_side_payload(uid, row, true, false);
	end if;

	if not (
		(row.host_claim->>'mapsWon')::int = (row.guest_claim->>'mapsLost')::int
		and (row.host_claim->>'mapsLost')::int = (row.guest_claim->>'mapsWon')::int
		and (row.host_claim->>'roundsWon')::int = (row.guest_claim->>'roundsLost')::int
		and (row.host_claim->>'roundsLost')::int = (row.guest_claim->>'roundsWon')::int
		and (row.host_claim->>'won')::boolean is distinct from (row.guest_claim->>'won')::boolean
	) then
		mismatch := true;
		return public.ranked_side_payload(uid, row, false, true);
	end if;

	select * into host_p from public.profiles where user_id = row.host_user_id for update;
	select * into guest_p from public.profiles where user_id = row.guest_user_id for update;
	host_won := (row.host_claim->>'won')::boolean;
	host_after := public.next_elo(host_p.elo, guest_p.elo, host_won);
	guest_after := public.next_elo(guest_p.elo, host_p.elo, not host_won);
	host_delta := host_after - host_p.elo;
	guest_delta := guest_after - guest_p.elo;

	update public.profiles
	set
		elo = host_after,
		wins = wins + case when host_won then 1 else 0 end,
		losses = losses + case when host_won then 0 else 1 end,
		updated_at = now()
	where user_id = host_p.user_id;
	update public.profiles
	set
		elo = guest_after,
		wins = wins + case when host_won then 0 else 1 end,
		losses = losses + case when host_won then 1 else 0 end,
		updated_at = now()
	where user_id = guest_p.user_id;

	insert into public.duel_results (
		user_id, room_code, won, maps_won, maps_lost, rounds_won, rounds_lost
	)
	values
		(
			host_p.user_id,
			row.code,
			host_won,
			(row.host_claim->>'mapsWon')::int,
			(row.host_claim->>'mapsLost')::int,
			(row.host_claim->>'roundsWon')::int,
			(row.host_claim->>'roundsLost')::int
		),
		(
			guest_p.user_id,
			row.code,
			not host_won,
			(row.guest_claim->>'mapsWon')::int,
			(row.guest_claim->>'mapsLost')::int,
			(row.guest_claim->>'roundsWon')::int,
			(row.guest_claim->>'roundsLost')::int
		)
	on conflict (user_id, room_code) do nothing;

	update public.duels
	set
		elo_applied = true,
		elo_result = jsonb_build_object(
			'host', jsonb_build_object(
				'displayName', host_p.display_name,
				'elo', host_after,
				'delta', host_delta
			),
			'guest', jsonb_build_object(
				'displayName', guest_p.display_name,
				'elo', guest_after,
				'delta', guest_delta
			)
		),
		updated_at = now()
	where id = row.id
	returning * into row;

	return public.ranked_side_payload(uid, row, false, false);
end;
$$;

revoke execute on function public.ranked_search_window(timestamptz) from public, anon, authenticated;
revoke execute on function public.next_elo(integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.ranked_side_payload(uuid, public.duels, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.claim_ranked_assignment(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_ranked_profile(uuid, text) from public, anon, authenticated;
revoke execute on function public.duel_public_row(public.duels, text) from public, anon, authenticated;

create or replace function public.queue_ranked_match()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
	select public.queue_ranked_match(null::text);
$$;

grant execute on function public.queue_ranked_match(text) to anon, authenticated;
grant execute on function public.queue_ranked_match() to anon, authenticated;
grant execute on function public.leave_ranked_queue() to anon, authenticated;
grant execute on function public.submit_ranked_result(text, text, integer, integer, integer, integer) to anon, authenticated;
grant execute on function public.join_duel(text) to anon, authenticated;

notify pgrst, 'reload schema';
