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
