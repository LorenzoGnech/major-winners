import type { DuelResultSnapshot } from "./schema";

export type DuelStatsSummary = {
	played: number;
	wins: number;
	losses: number;
	winRate: number;
	mapsWon: number;
	mapsLost: number;
	roundsWon: number;
	roundsLost: number;
};

export const EMPTY_DUEL_STATS: DuelStatsSummary = {
	played: 0,
	wins: 0,
	losses: 0,
	winRate: 0,
	mapsWon: 0,
	mapsLost: 0,
	roundsWon: 0,
	roundsLost: 0,
};

export function summarizeDuelStats(results: readonly DuelResultSnapshot[]): DuelStatsSummary {
	const played = results.length;
	const wins = results.filter((result) => result.won).length;
	const mapsWon = results.reduce((sum, result) => sum + result.mapsWon, 0);
	const mapsLost = results.reduce((sum, result) => sum + result.mapsLost, 0);
	const roundsWon = results.reduce((sum, result) => sum + result.roundsWon, 0);
	const roundsLost = results.reduce((sum, result) => sum + result.roundsLost, 0);
	return {
		played,
		wins,
		losses: played - wins,
		winRate: played ? Math.round((wins / played) * 100) : 0,
		mapsWon,
		mapsLost,
		roundsWon,
		roundsLost,
	};
}
