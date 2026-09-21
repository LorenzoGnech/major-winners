import { ROLES, type Role } from "../../data/schema";
import type { CompletedDraft } from "../draft";
import { seedFromUtcDate, utcDateKey } from "../rng";
import type { TournamentStage, TournamentState } from "../tournament";

export const DAILY_STATS_VERSION = 1;
export type DailyIdentity = { day: string; id: string; seed: number };
export type DailyRoster = Record<Role, string>;
export type DailyResult = {
	day: string;
	status: "champion" | "eliminated";
	stage: TournamentStage;
	wins: number;
	losses: number;
	matches: readonly { stage: TournamentStage; won: boolean }[];
	roster?: DailyRoster;
};
export type SeasonIdentity = { playerId: string; nick: string };
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

function isRoster(value: unknown): value is DailyRoster {
	return (
		isObject(value) &&
		ROLES.every((role) => typeof value[role] === "string" && value[role].length > 0)
	);
}
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
		) &&
		(value.roster === undefined || isRoster(value.roster))
	);
}
export function rosterFromCompletedDraft(draft: CompletedDraft): DailyRoster {
	return Object.fromEntries(
		ROLES.map((role) => [role, draft.roster[role].playerSeasonId]),
	) as DailyRoster;
}
export function dailyIdentity(date = new Date()): DailyIdentity {
	const day = utcDateKey(date);
	return { day, id: `MW-${day}`, seed: seedFromUtcDate(date) };
}
export function markDailyPlayed(stats: DailyStats, day: string): DailyStats {
	if (!isDay(day) || stats.playedDays.includes(day)) return stats;
	return { ...stats, playedDays: uniqueDays([...stats.playedDays, day]) };
}

export function dailyDayLocked(stats: DailyStats, day: string): boolean {
	return isDay(day) && stats.playedDays.includes(day);
}
export function dailyResultFromTournament(
	day: string,
	state: TournamentState,
	draft?: CompletedDraft | null,
): DailyResult | null {
	if (!isDay(day) || state.status === "active") return null;
	const wins = state.history.filter((match) => match.won).length;
	return {
		day,
		status: state.status,
		stage: state.stage,
		wins,
		losses: state.history.length - wins,
		matches: state.history.map(({ stage, won }) => ({ stage, won })),
		...(draft ? { roster: rosterFromCompletedDraft(draft) } : {}),
	};
}
export function recordDailyResult(stats: DailyStats, result: DailyResult): DailyStats {
	const existing = stats.results.find(({ day }) => day === result.day);
	if (existing) {
		if (existing.roster || !result.roster) return markDailyPlayed(stats, result.day);
		return {
			...markDailyPlayed(stats, result.day),
			results: stats.results.map((row) =>
				row.day === result.day ? { ...row, roster: result.roster } : row,
			),
		};
	}
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
function mostUsedPlayerNick(
	results: readonly DailyResult[],
	seasons?: ReadonlyMap<string, SeasonIdentity>,
): string {
	if (!seasons) return "—";
	const counts = new Map<string, { count: number; nick: string }>();
	for (const result of results) {
		if (!result.roster) continue;
		for (const role of ROLES) {
			const identity = seasons.get(result.roster[role]);
			if (!identity) continue;
			const current = counts.get(identity.playerId);
			if (current) current.count += 1;
			else counts.set(identity.playerId, { count: 1, nick: identity.nick });
		}
	}
	let best: { count: number; nick: string } | null = null;
	for (const row of counts.values()) {
		if (
			!best ||
			row.count > best.count ||
			(row.count === best.count && row.nick.localeCompare(best.nick) < 0)
		) {
			best = row;
		}
	}
	return best?.nick ?? "—";
}
export function summarizeDailyStats(
	stats: DailyStats,
	today = utcDateKey(),
	seasons?: ReadonlyMap<string, SeasonIdentity>,
) {
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
	const championships = stats.results.filter(({ status }) => status === "champion").length;
	return {
		playedDays: uniqueDays(stats.playedDays).length,
		completedRuns: stats.results.length,
		totalWins: wins,
		championships,
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
		mostUsedPlayer: mostUsedPlayerNick(stats.results, seasons),
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
