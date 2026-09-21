import type { PublishedRunSnapshot, SavedTeamSnapshot } from "./schema";

export type RunRankInput = Pick<
	PublishedRunSnapshot,
	"wins" | "losses" | "mapsLost" | "roundsLost" | "mapsWon" | "roundsWon" | "createdAt"
>;

export function compareBestRuns(left: RunRankInput, right: RunRankInput): number {
	return (
		right.wins - left.wins ||
		left.losses - right.losses ||
		left.mapsLost - right.mapsLost ||
		left.roundsLost - right.roundsLost ||
		right.mapsWon - left.mapsWon ||
		right.roundsWon - left.roundsWon ||
		left.createdAt.localeCompare(right.createdAt)
	);
}

export function compareHighestRated(
	left: { overall: number; teamName: string; id: string },
	right: { overall: number; teamName: string; id: string },
): number {
	return (
		right.overall - left.overall ||
		left.teamName.localeCompare(right.teamName) ||
		left.id.localeCompare(right.id)
	);
}

export function topPublishedRuns(
	runs: readonly PublishedRunSnapshot[],
	limit: number,
): PublishedRunSnapshot[] {
	return [...runs].sort(compareBestRuns).slice(0, limit);
}

export function topDailyPublishedRuns(
	runs: readonly PublishedRunSnapshot[],
	seed: number,
	limit: number,
): PublishedRunSnapshot[] {
	return topPublishedRuns(
		runs.filter((run) => run.mode === "daily" && run.team.seed === seed),
		limit,
	);
}

export function uniqueBestPublishedRuns(
	runs: readonly PublishedRunSnapshot[],
	limit: number,
): PublishedRunSnapshot[] {
	const seen = new Set<string>();
	const unique: PublishedRunSnapshot[] = [];
	for (const run of [...runs].sort(compareBestRuns)) {
		const key = `${run.team.roster.awp}:${run.team.roster.igl}:${run.team.roster.entry}:${run.team.roster.support}:${run.team.roster.lurker}:${run.team.coachId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(run);
		if (unique.length >= limit) break;
	}
	return unique;
}

export function uniqueTeamsByRoster(teams: readonly SavedTeamSnapshot[]): SavedTeamSnapshot[] {
	const seen = new Set<string>();
	const unique: SavedTeamSnapshot[] = [];
	for (const team of teams) {
		const key = `${team.roster.awp}:${team.roster.igl}:${team.roster.entry}:${team.roster.support}:${team.roster.lurker}:${team.coachId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(team);
	}
	return unique;
}
