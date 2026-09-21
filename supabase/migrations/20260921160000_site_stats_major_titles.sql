-- Wins is published Major titles, not summed match wins.

drop function if exists public.site_stats();

create function public.site_stats()
returns table (games_played bigint, saved_teams bigint, wins bigint, majors_won bigint)
language sql
stable
security invoker
set search_path = public
as $$
	with titles as (
		select count(*) as n from public.published_runs where finish = 'Champion'
	)
	select
		(select coalesce(sum(wins + losses), 0) from public.published_runs),
		(select count(*) from public.saved_teams),
		titles.n,
		titles.n
	from titles;
$$;

revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated;

notify pgrst, 'reload schema';
