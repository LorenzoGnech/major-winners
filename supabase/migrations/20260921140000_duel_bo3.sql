-- Private and ranked 1v1 are BO3. Elo agrees on complementary map scores,
-- not exact round totals from the two local sims.

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
	kind := case when step in (4, 5) then 'pick' else 'ban' end;
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
	return jsonb_build_object(
		'pending', p_pending,
		'eloApplied', false,
		'mismatch', p_mismatch,
		'you', case
			when you_name is null or you_elo is null then null
			else jsonb_build_object('displayName', you_name, 'elo', you_elo, 'delta', null)
		end,
		'opponent', case
			when opp_name is null or opp_elo is null then null
			else jsonb_build_object('displayName', opp_name, 'elo', opp_elo, 'delta', null)
		end
	);
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
	winner_maps integer;
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

	winner_maps := greatest(p_maps_won, p_maps_lost);
	if p_maps_won < 0 or p_maps_lost < 0 or p_maps_won > 3 or p_maps_lost > 3
		or p_rounds_won < 0 or p_rounds_lost < 0
		or p_maps_won = p_maps_lost
		or winner_maps not in (2, 3)
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

	if (row.host_claim->>'mapsWon')::int is distinct from (row.guest_claim->>'mapsLost')::int
		or (row.host_claim->>'mapsLost')::int is distinct from (row.guest_claim->>'mapsWon')::int
		or ((row.host_claim->>'mapsWon')::int > (row.host_claim->>'mapsLost')::int)
			is not distinct from ((row.guest_claim->>'mapsWon')::int > (row.guest_claim->>'mapsLost')::int)
	then
		return public.ranked_side_payload(uid, row, false, true);
	end if;

	select * into host_p from public.profiles where user_id = row.host_user_id for update;
	select * into guest_p from public.profiles where user_id = row.guest_user_id for update;
	if host_p.user_id is null or guest_p.user_id is null then
		raise exception 'Ranked profiles are missing';
	end if;
	host_won := (row.host_claim->>'mapsWon')::int > (row.host_claim->>'mapsLost')::int;
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

revoke execute on function public.ranked_side_payload(uuid, public.duels, boolean, boolean) from public, anon, authenticated;
grant execute on function public.submit_duel_veto(text, text, text) to anon, authenticated;
grant execute on function public.submit_ranked_result(text, text, integer, integer, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
