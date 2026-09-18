-- Community teams, published runs, and public leaderboards.

create table public.saved_teams (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references auth.users (id) on delete set null,
	author_name text not null,
	team_name text not null,
	seed bigint not null,
	roster jsonb not null,
	coach_id text not null,
	traits jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	constraint saved_teams_author_name_len check (char_length(author_name) between 1 and 32),
	constraint saved_teams_team_name_len check (char_length(team_name) between 1 and 32)
);

create table public.published_runs (
	id uuid primary key default gen_random_uuid(),
	team_id uuid not null references public.saved_teams (id) on delete cascade,
	mode text not null,
	wins integer not null,
	losses integer not null,
	maps_won integer not null,
	maps_lost integer not null,
	rounds_won integer not null,
	rounds_lost integer not null,
	finish text not null,
	perfect boolean not null,
	fingerprint text not null unique,
	created_at timestamptz not null default now(),
	constraint published_runs_mode check (mode in ('daily', 'free', 'community')),
	constraint published_runs_wins check (wins >= 0 and wins <= 9),
	constraint published_runs_losses check (losses >= 0 and losses <= 3),
	constraint published_runs_maps_won check (maps_won >= 0),
	constraint published_runs_maps_lost check (maps_lost >= 0),
	constraint published_runs_rounds_won check (rounds_won >= 0),
	constraint published_runs_rounds_lost check (rounds_lost >= 0)
);

create index published_runs_leaderboard_idx
	on public.published_runs (
		wins desc,
		losses asc,
		maps_lost asc,
		rounds_lost asc,
		maps_won desc,
		rounds_won desc,
		created_at asc
	);

create index saved_teams_user_id_idx on public.saved_teams (user_id);
create index saved_teams_created_at_idx on public.saved_teams (created_at desc);

alter table public.saved_teams enable row level security;
alter table public.published_runs enable row level security;

create policy "saved_teams_select_public"
	on public.saved_teams
	for select
	using (true);

create policy "saved_teams_insert"
	on public.saved_teams
	for insert
	with check (user_id is null or user_id = auth.uid());

create policy "saved_teams_update_own"
	on public.saved_teams
	for update
	using (auth.uid() = user_id)
	with check (auth.uid() = user_id);

create policy "saved_teams_delete_own"
	on public.saved_teams
	for delete
	using (auth.uid() = user_id);

create policy "published_runs_select_public"
	on public.published_runs
	for select
	using (true);

create policy "published_runs_insert"
	on public.published_runs
	for insert
	with check (true);

grant select, insert on public.saved_teams to anon, authenticated;
grant update, delete on public.saved_teams to authenticated;
grant select, insert on public.published_runs to anon, authenticated;
