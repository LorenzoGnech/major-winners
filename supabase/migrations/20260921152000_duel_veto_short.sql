-- Short BO3 veto: one ban each, one pick each, then a seed-picked leftover decider.

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
	remaining text[];
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
	if step >= 4 then
		raise exception 'Veto is already complete';
	end if;
	expected_side := step % 2;
	kind := case when step >= 2 then 'pick' else 'ban' end;
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
	if jsonb_array_length(next_log) < 4 then
		update public.duels
		set veto_log = next_log, updated_at = now()
		where id = row.id
		returning * into row;
		return public.duel_public_row(row, slot);
	end if;
	select coalesce(array_agg(value->>'mapId'), '{}') into used
	from jsonb_array_elements(next_log);
	select coalesce(array_agg(value order by ordinality), '{}') into remaining
	from unnest(pool) with ordinality as t(value, ordinality)
	where value <> all (used);
	if coalesce(array_length(remaining, 1), 0) = 0 then
		raise exception 'No leftover map';
	end if;
	leftover := remaining[(row.series_seed % array_length(remaining, 1)::bigint) + 1];
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

grant execute on function public.submit_duel_veto(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
