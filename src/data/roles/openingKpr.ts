import type { PlayerSeason } from "../schema";

export type OpeningKillRow = {
	playerSeasonIds: string[];
	openingKills?: number;
	roundsPlayed?: number;
};

function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

export function openingKprFrom(row: OpeningKillRow): number | undefined {
	if (row.openingKills === undefined || !row.roundsPlayed) return undefined;
	return round4(row.openingKills / row.roundsPlayed);
}

export function fillOpeningKpr(
	seasons: PlayerSeason[],
	rows: readonly OpeningKillRow[],
): { seasons: PlayerSeason[]; filled: number } {
	const bySeasonId = new Map<string, number>();
	for (const row of rows) {
		const openingKpr = openingKprFrom(row);
		if (openingKpr === undefined) continue;
		for (const id of row.playerSeasonIds) bySeasonId.set(id, openingKpr);
	}
	let filled = 0;
	const next = seasons.map((season) => {
		if (!season.stats || season.stats.openingKpr !== undefined) return season;
		const openingKpr = bySeasonId.get(season.id);
		if (openingKpr === undefined) return season;
		filled += 1;
		return { ...season, stats: { ...season.stats, openingKpr } };
	});
	return { seasons: next, filled };
}
