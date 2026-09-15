import { seedFromUtcDate, utcDateKey } from "../rng";
import type { TournamentStage, TournamentState } from "../tournament";

export const DAILY_STATS_VERSION = 1;
export type DailyIdentity = { day: string; id: string; seed: number };
export type DailyResult = {
	day: string;
	status: "champion" | "eliminated";
	stage: TournamentStage;
	wins: number;
	losses: number;
	matches: readonly { stage: TournamentStage; won: boolean }[];
};
export type DailyStats = {
	version: typeof DAILY_STATS_VERSION;
	playedDays: readonly string[];
	results: readonly DailyResult[];
};
export const EMPTY_DAILY_STATS: DailyStats = { version: 1, playedDays: [], results: [] };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isDay = (value: unknown): value is string => {
	if (typeof value !== "string" || !DAY.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.valueOf()) && utcDateKey(date) === value;
};
const isStage = (value: unknown): value is TournamentStage =>
	value === "challengers" || value === "legends" || value === "champions";
const uniqueDays = (days: readonly string[]) => [...new Set(days)].sort();

function isResult(value: unknown): value is DailyResult {
	return (
		isObject(value) &&
		isDay(value.day) &&
		(value.status === "champion" || value.status === "eliminated") &&
		isStage(value.stage) &&
		Number.isInteger(value.wins) &&
		Number(value.wins) >= 0 &&
		Number.isInteger(value.losses) &&
		Number(value.losses) >= 0 &&
		Array.isArray(value.matches) &&
		value.matches.every(
			(match) => isObject(match) && isStage(match.stage) && typeof match.won === "boolean",
		)
	);
}
export function dailyIdentity(date = new Date()): DailyIdentity {
	const day = utcDateKey(date);
	return { day, id: `MW-${day}`, seed: seedFromUtcDate(date) };
}
export function markDailyPlayed(stats: DailyStats, day: string): DailyStats {
	if (!isDay(day) || stats.playedDays.includes(day)) return stats;
	return { ...stats, playedDays: uniqueDays([...stats.playedDays, day]) };
}
export function dailyResultFromTournament(day: string, state: TournamentState): DailyResult | null {
	if (!isDay(day) || state.status === "active") return null;
	const wins = state.history.filter((match) => match.won).length;
	return {
		day,
		status: state.status,
		stage: state.stage,
		wins,
		losses: state.history.length - wins,
		matches: state.history.map(({ stage, won }) => ({ stage, won })),
	};
}
export function recordDailyResult(stats: DailyStats, result: DailyResult): DailyStats {
	if (stats.results.some(({ day }) => day === result.day))
		return markDailyPlayed(stats, result.day);
	const played = markDailyPlayed(stats, result.day);
	return {
		...played,
		results: [...played.results, result].sort((a, b) => a.day.localeCompare(b.day)),
	};
}
function offsetDay(day: string, offset: number) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + offset);
	return utcDateKey(date);
}
function longestStreak(days: readonly string[]) {
	const set = new Set(days);
	let best = 0;
	for (const start of set) {
		if (set.has(offsetDay(start, -1))) continue;
		let length = 1;
		let cursor = start;
		while (true) {
			cursor = offsetDay(cursor, 1);
			if (!set.has(cursor)) break;
			length++;
		}
		best = Math.max(best, length);
	}
	return best;
}
export function dailyFinish(result: DailyResult): string {
	if (result.status === "champion") return "Champion";
	if (result.stage === "challengers") return "Challengers Swiss";
	if (result.stage === "legends") return "Legends Swiss";
	const count = result.matches.filter(({ stage }) => stage === "champions").length;
	return ["Quarterfinal", "Semifinal", "Final"][Math.max(0, count - 1)] ?? "Quarterfinal";
}
export function summarizeDailyStats(stats: DailyStats, today = utcDateKey()) {
	const days = uniqueDays(stats.results.map(({ day }) => day));
	const wins = stats.results.reduce((sum, result) => sum + result.wins, 0);
	const matches = stats.results.reduce((sum, result) => sum + result.wins + result.losses, 0);
	const ranks = [
		"Challengers Swiss",
		"Legends Swiss",
		"Quarterfinal",
		"Semifinal",
		"Final",
		"Champion",
	];
	let currentStreak = 0;
	let cursor = today;
	while (days.includes(cursor)) {
		currentStreak++;
		cursor = offsetDay(cursor, -1);
	}
	const finishes = stats.results.map(dailyFinish);
	return {
		playedDays: uniqueDays(stats.playedDays).length,
		completedRuns: stats.results.length,
		championships: stats.results.filter(({ status }) => status === "champion").length,
		perfectRuns: stats.results.filter(
			({ status, wins, losses }) => status === "champion" && wins === 9 && losses === 0,
		).length,
		currentStreak,
		maxStreak: longestStreak(days),
		winRate: matches ? Math.round((wins / matches) * 100) : 0,
		bestFinish: finishes.length
			? finishes.reduce((best, finish) =>
					ranks.indexOf(finish) > ranks.indexOf(best) ? finish : best,
				)
			: "—",
	};
}
export function parseDailyStats(raw: string): DailyStats {
	try {
		const value: unknown = JSON.parse(raw);
		if (!isObject(value) || value.version !== 1) return EMPTY_DAILY_STATS;
		const played = Array.isArray(value.playedDays) ? value.playedDays.filter(isDay) : [];
		const results = Array.isArray(value.results) ? value.results.filter(isResult) : [];
		const deduped = [...new Map(results.map((result) => [result.day, result])).values()];
		return {
			version: 1,
			playedDays: uniqueDays([...played, ...deduped.map(({ day }) => day)]),
			results: deduped.sort((a, b) => a.day.localeCompare(b.day)),
		};
	} catch {
		return EMPTY_DAILY_STATS;
	}
}
export function formatDailyShare(result: DailyResult, url: string) {
	const labels = { challengers: "Challengers", legends: "Legends", champions: "Champions" };
	const rows = (Object.keys(labels) as TournamentStage[]).flatMap((stage) => {
		const matches = result.matches.filter((match) => match.stage === stage);
		return matches.length
			? [`${labels[stage]} ${matches.map(({ won }) => (won ? "🟩" : "🟥")).join("")}`]
			: [];
	});
	const perfect = result.status === "champion" && result.wins === 9 && result.losses === 0;
	return [
		`Major Winners · ${result.day}`,
		result.status === "champion" ? "🏆 Major Champion" : `Finish: ${dailyFinish(result)}`,
		...rows,
		`Record ${result.wins}-${result.losses}${perfect ? " · PERFECT 9-0" : ""}`,
		url,
	].join("\n");
}
