import type { ReactNode } from "react";
import {
	COMMUNITY_BOARD_SIZE,
	compareHighestRated,
	type PublishedRunSnapshot,
	type RankedProfile,
	type SavedTeamSnapshot,
	teamOverallFromSnapshot,
	topPublishedRuns,
	uniqueTeamsByRoster,
} from "../community";
import { type Dataset, ROLES } from "../data";
import type { RatedPlayer } from "../engine";
import { PlayerCrest } from "./PlayerCrest";

export function rankedBestRuns(runs: readonly PublishedRunSnapshot[]): PublishedRunSnapshot[] {
	return topPublishedRuns(runs, COMMUNITY_BOARD_SIZE);
}

export function rankedTopTeams(
	teams: readonly SavedTeamSnapshot[],
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
): { team: SavedTeamSnapshot; overall: number }[] {
	return uniqueTeamsByRoster(teams)
		.flatMap((team) => {
			const overall = teamOverallFromSnapshot(team, dataset, ratedPlayers);
			return overall === null ? [] : [{ team, overall }];
		})
		.sort((left, right) =>
			compareHighestRated(
				{ overall: left.overall, teamName: left.team.teamName, id: left.team.id },
				{ overall: right.overall, teamName: right.team.teamName, id: right.team.id },
			),
		)
		.slice(0, COMMUNITY_BOARD_SIZE);
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

export function formatSavedAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const month = MONTHS[date.getUTCMonth()];
	if (!month) return "";
	return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

function BoardShell({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="min-w-0 border border-white/10 bg-black/40 p-3 text-left sm:p-4">
			<h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:text-[11px] sm:tracking-[0.2em]">
				{title}
			</h2>
			<div className="mt-3">{children}</div>
		</section>
	);
}

export function RosterStrip({
	roster,
	nicks,
	photos,
}: {
	roster: SavedTeamSnapshot["roster"];
	nicks: ReadonlyMap<string, string>;
	photos: ReadonlyMap<string, { playerId: string; nick: string; photo?: string }>;
}) {
	return (
		<ul className="mt-2 grid grid-cols-5 justify-items-center gap-1 sm:gap-2">
			{ROLES.map((role) => {
				const season = photos.get(roster[role]);
				const nick = nicks.get(roster[role]) ?? "—";
				return (
					<li key={role} className="flex w-full max-w-17 min-w-0 flex-col items-center">
						{season ? (
							<PlayerCrest player={season} size="card" />
						) : (
							<div className="aspect-[3/4] w-full rounded-lg bg-white/5" />
						)}
						<p className="mt-1 w-full truncate text-center text-[10px] font-medium text-zinc-300">
							{nick}
						</p>
					</li>
				);
			})}
		</ul>
	);
}

export function HomeLeaderboards({
	runs,
	teams,
	eloBoard,
	dataset,
	ratedPlayers,
}: {
	runs: readonly PublishedRunSnapshot[];
	teams: readonly SavedTeamSnapshot[];
	eloBoard: readonly RankedProfile[];
	dataset: Dataset;
	ratedPlayers: readonly RatedPlayer[];
}) {
	const best = rankedBestRuns(runs);
	const top = rankedTopTeams(teams, dataset, ratedPlayers);
	const nicks = new Map(dataset.playerSeasons.map((player) => [player.id, player.nick]));
	const photos = new Map(dataset.playerSeasons.map((player) => [player.id, player]));

	return (
		<div className="grid w-full grid-cols-1 gap-4 min-[900px]:grid-cols-2 xl:grid-cols-3">
			<BoardShell title="Best runs">
				{best.length > 0 ? (
					<ol className="space-y-2">
						{best.map((run, index) => {
							const saved = formatSavedAt(run.createdAt);
							return (
								<li key={run.id} className="border border-white/10 px-2.5 py-2">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-white">
												<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
												{run.team.teamName}
											</p>
											<p className="truncate text-[11px] text-zinc-500">
												{run.team.authorName} · {run.finish}
												{saved ? ` · ${saved}` : ""}
											</p>
										</div>
										<p className="max-w-[42%] shrink-0 text-right text-[11px] tabular-nums text-zinc-300 sm:text-xs">
											{run.wins}–{run.losses}
											<span className="mt-0.5 block text-[9px] leading-tight text-zinc-500 sm:text-[10px]">
												maps {run.mapsWon}–{run.mapsLost} · rnd {run.roundsWon}–{run.roundsLost}
											</span>
										</p>
									</div>
									<RosterStrip roster={run.team.roster} nicks={nicks} photos={photos} />
								</li>
							);
						})}
					</ol>
				) : (
					<p className="text-sm text-zinc-500">
						Nothing here yet. Finish a Major and save your team.
					</p>
				)}
			</BoardShell>
			<BoardShell title="Highest rated teams">
				{top.length > 0 ? (
					<ol className="space-y-2">
						{top.map(({ team, overall }, index) => {
							const saved = formatSavedAt(team.createdAt);
							return (
								<li key={team.id} className="border border-white/10 px-2.5 py-2">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-white">
												<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
												{team.teamName}
											</p>
											<p className="truncate text-[11px] text-zinc-500">
												{team.authorName}
												{saved ? ` · ${saved}` : ""}
											</p>
										</div>
										<p className="shrink-0 text-sm font-bold tabular-nums text-amber-200">
											{overall.toFixed(1)}
										</p>
									</div>
									<RosterStrip roster={team.roster} nicks={nicks} photos={photos} />
								</li>
							);
						})}
					</ol>
				) : (
					<p className="text-sm text-zinc-500">No saved teams yet.</p>
				)}
			</BoardShell>
			<BoardShell title="Highest Elo">
				{eloBoard.length > 0 ? (
					<ol className="space-y-2">
						{eloBoard.map((row, index) => (
							<li key={row.userId} className="border border-white/10 px-2.5 py-2">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-white">
											<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
											{row.displayName}
										</p>
										<p className="truncate text-[11px] text-zinc-500">
											{row.wins}–{row.losses} ranked
										</p>
									</div>
									<p className="shrink-0 text-sm font-bold tabular-nums text-amber-200">
										{row.elo}
									</p>
								</div>
							</li>
						))}
					</ol>
				) : (
					<p className="text-sm text-zinc-500">No ranked players yet. Queue a match to place.</p>
				)}
			</BoardShell>
		</div>
	);
}
