-- Current ranked win streak on profiles; Elo SQL remains the only writer.

alter table public.profiles
	add column if not exists streak integer not null default 0;

alter table public.profiles
	drop constraint if exists profiles_streak_check;

alter table public.profiles
	add constraint profiles_streak_check check (streak >= 0);

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
		streak = case when host_won then host_p.streak + 1 else 0 end,
		updated_at = now()
	where user_id = host_p.user_id;
	update public.profiles
	set
		elo = guest_after,
		wins = wins + case when host_won then 0 else 1 end,
		losses = losses + case when host_won then 1 else 0 end,
		streak = case when host_won then 0 else guest_p.streak + 1 end,
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

grant execute on function public.submit_ranked_result(text, text, integer, integer, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
