-- Signed-in private match results for My profile.

create table public.duel_results (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	room_code text not null,
	won boolean not null,
	maps_won integer not null,
	maps_lost integer not null,
	rounds_won integer not null,
	rounds_lost integer not null,
	created_at timestamptz not null default now(),
	constraint duel_results_room unique (user_id, room_code),
	constraint duel_results_code_check check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
	constraint duel_results_maps_won check (maps_won >= 0 and maps_won <= 3),
	constraint duel_results_maps_lost check (maps_lost >= 0 and maps_lost <= 3),
	constraint duel_results_rounds_won check (rounds_won >= 0),
	constraint duel_results_rounds_lost check (rounds_lost >= 0)
);

create index duel_results_user_id_idx on public.duel_results (user_id, created_at desc);

alter table public.duel_results enable row level security;

create policy "duel_results_select_own"
	on public.duel_results
	for select
	using (auth.uid() = user_id);

create policy "duel_results_insert_own"
	on public.duel_results
	for insert
	with check (auth.uid() = user_id);

grant select, insert on public.duel_results to authenticated;
