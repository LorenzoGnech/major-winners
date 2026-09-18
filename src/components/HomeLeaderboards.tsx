import type { ReactNode } from "react";
import {
	COMMUNITY_BOARD_SIZE,
	compareBestRuns,
	compareHighestRated,
	type PublishedRunSnapshot,
	type SavedTeamSnapshot,
	teamOverallFromSnapshot,
	uniqueTeamsByRoster,
} from "../community";
import { type Dataset, ROLES } from "../data";
import type { RatedPlayer } from "../engine";
import { PlayerCrest } from "./PlayerCrest";

export function rankedBestRuns(runs: readonly PublishedRunSnapshot[]): PublishedRunSnapshot[] {
	return [...runs].sort(compareBestRuns).slice(0, COMMUNITY_BOARD_SIZE);
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
		<section className="min-w-0 border border-white/10 bg-black/40 p-4 text-left">
			<h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
				{title}
			</h2>
			<div className="mt-3">{children}</div>
		</section>
	);
}

function RosterStrip({
	roster,
	nicks,
	photos,
}: {
	roster: SavedTeamSnapshot["roster"];
	nicks: ReadonlyMap<string, string>;
	photos: ReadonlyMap<string, { playerId: string; nick: string; photo?: string }>;
}) {
	return (
		<ul className="mt-3 grid grid-cols-5 gap-2">
			{ROLES.map((role) => {
				const season = photos.get(roster[role]);
				const nick = nicks.get(roster[role]) ?? "—";
				return (
					<li key={role} className="flex min-w-0 flex-col items-center">
						{season ? (
							<PlayerCrest player={season} size="card" />
						) : (
							<div className="aspect-[3/4] w-full rounded-lg bg-white/5" />
						)}
						<p className="mt-1.5 w-full truncate text-center text-xs font-medium text-zinc-300">
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
	dataset,
	ratedPlayers,
}: {
	runs: readonly PublishedRunSnapshot[];
	teams: readonly SavedTeamSnapshot[];
	dataset: Dataset;
	ratedPlayers: readonly RatedPlayer[];
}) {
	const best = rankedBestRuns(runs);
	const top = rankedTopTeams(teams, dataset, ratedPlayers);
	const nicks = new Map(dataset.playerSeasons.map((player) => [player.id, player.nick]));
	const photos = new Map(dataset.playerSeasons.map((player) => [player.id, player]));

	return (
		<div className="grid w-full grid-cols-1 gap-4 min-[900px]:grid-cols-2">
			<BoardShell title="Best runs">
				{best.length > 0 ? (
					<ol className="space-y-3">
						{best.map((run, index) => {
							const saved = formatSavedAt(run.createdAt);
							return (
								<li key={run.id} className="border border-white/10 px-3 py-3">
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
										<p className="shrink-0 text-right text-xs tabular-nums text-zinc-300">
											{run.wins}–{run.losses}
											<span className="mt-0.5 block text-[10px] text-zinc-500">
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
						No published runs yet. Finish a Major and save your team.
					</p>
				)}
			</BoardShell>
			<BoardShell title="Highest rated teams">
				{top.length > 0 ? (
					<ol className="space-y-3">
						{top.map(({ team, overall }, index) => {
							const saved = formatSavedAt(team.createdAt);
							return (
								<li key={team.id} className="border border-white/10 px-3 py-3">
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
		</div>
	);
}
