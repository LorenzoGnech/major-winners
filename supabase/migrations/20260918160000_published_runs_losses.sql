-- A Major run can take two Swiss losses in Challengers, then three more in
-- Legends (or two in Legends plus a playoff loss). Total losses reach 5.

alter table public.published_runs
	drop constraint published_runs_losses;

alter table public.published_runs
	add constraint published_runs_losses check (losses >= 0 and losses <= 5);
