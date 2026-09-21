-- Homepage totals include Daily runs won / Daily runs played.

drop function if exists public.site_stats();

create function public.site_stats()
returns table (
	games_played bigint,
	saved_teams bigint,
	wins bigint,
	majors_won bigint,
	daily_runs_played bigint,
	daily_runs_won bigint
)
language sql
stable
security invoker
set search_path = public
as $$
	with titles as (
		select count(*) as n from public.published_runs where finish = 'Champion'
	),
	daily as (
		select
			count(*) as played,
			count(*) filter (where finish = 'Champion') as won
		from public.published_runs
		where mode = 'daily'
	)
	select
		(select coalesce(sum(wins + losses), 0) from public.published_runs),
		(select count(*) from public.saved_teams),
		titles.n,
		titles.n,
		daily.played,
		daily.won
	from titles
	cross join daily;
$$;

revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated;

notify pgrst, 'reload schema';
