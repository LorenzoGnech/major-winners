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

function BoardShell({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="border border-white/10 bg-black/55 p-4 text-left backdrop-blur-xl">
			<h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
				{title}
			</h2>
			<div className="mt-3">{children}</div>
		</section>
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
		<div className="flex w-full flex-col gap-3">
			<BoardShell title="Best runs">
				{best.length > 0 ? (
					<ol className="space-y-2">
						{best.map((run, index) => (
							<li
								key={run.id}
								className="flex items-baseline justify-between gap-3 border border-white/10 px-3 py-2"
							>
								<div className="min-w-0">
									<p className="truncate text-sm font-semibold text-white">
										<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
										{run.team.teamName}
									</p>
									<p className="truncate text-[11px] text-zinc-500">
										{run.team.authorName} · {run.finish}
									</p>
								</div>
								<p className="shrink-0 text-right text-xs tabular-nums text-zinc-300">
									{run.wins}–{run.losses}
									<span className="mt-0.5 block text-[10px] text-zinc-500">
										maps {run.mapsWon}–{run.mapsLost} · rnd {run.roundsWon}–{run.roundsLost}
									</span>
								</p>
							</li>
						))}
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
						{top.map(({ team, overall }, index) => (
							<li key={team.id} className="border border-white/10 px-3 py-2">
								<div className="flex items-baseline justify-between gap-2">
									<p className="truncate text-sm font-semibold text-white">
										<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
										{team.teamName}
									</p>
									<p className="shrink-0 text-sm font-bold tabular-nums text-amber-200">
										{overall.toFixed(1)}
									</p>
								</div>
								<p className="text-[11px] text-zinc-500">{team.authorName}</p>
								<ul className="mt-2 grid grid-cols-5 gap-1">
									{ROLES.map((role) => {
										const season = photos.get(team.roster[role]);
										return (
											<li key={role} className="min-w-0">
												{season ? (
													<PlayerCrest player={season} size="sm" />
												) : (
													<div className="size-8 rounded bg-white/5" />
												)}
												<p className="mt-1 truncate text-center text-[10px] text-zinc-400">
													{nicks.get(team.roster[role]) ?? "—"}
												</p>
											</li>
										);
									})}
								</ul>
							</li>
						))}
					</ol>
				) : (
					<p className="text-sm text-zinc-500">No saved teams yet.</p>
				)}
			</BoardShell>
		</div>
	);
}
