-- Public homepage totals: published tournament matches, saved teams, and match wins.

create or replace function public.site_stats()
returns table (games_played bigint, saved_teams bigint, wins bigint)
language sql
stable
security invoker
set search_path = public
as $$
	select
		(select coalesce(sum(wins + losses), 0) from public.published_runs) as games_played,
		(select count(*) from public.saved_teams) as saved_teams,
		(select coalesce(sum(wins), 0) from public.published_runs) as wins;
$$;

revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated;

notify pgrst, 'reload schema';
