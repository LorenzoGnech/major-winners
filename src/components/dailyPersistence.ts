import { type Dataset, ROLES } from "../data";
import {
	type DailyStats,
	type DraftState,
	EMPTY_DAILY_STATS,
	parseDailyStats,
	roleFit,
	startDraft,
	type TournamentState,
} from "../engine";
import { parsePersistedTournamentRun, TOURNAMENT_STORAGE_VERSION } from "./tournamentPersistence";
export const DAILY_ATTEMPT_STORAGE_KEY = "major-winners:daily-attempt:v1";
export const DAILY_ATTEMPT_STORAGE_VERSION = 1;
export const DAILY_STATS_STORAGE_KEY = "major-winners:daily-stats:v1";
export type PersistedDailyAttempt = {
	version: 1;
	day: string;
	seed: number;
	draft: DraftState;
	tournament: TournamentState | null;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
function validDraft(value: unknown, dataset: Dataset, seed: number): value is DraftState {
	if (!isObject(value)) return false;
	const canonical = startDraft(dataset, seed);
	if (
		value.seed !== seed ||
		JSON.stringify(value.cards) !== JSON.stringify(canonical.cards) ||
		JSON.stringify(value.coachIds) !== JSON.stringify(canonical.coachIds) ||
		!isObject(value.roster) ||
		!isObject(value.phase) ||
		!["player", "coach", "complete"].includes(String(value.phase.type))
	)
		return false;
	const picks = Object.values(value.roster);
	for (const role of ROLES) {
		const pick = value.roster[role];
		if (pick === undefined) continue;
		if (!isObject(pick) || pick.role !== role || typeof pick.orgYearId !== "string") return false;
		const card = canonical.cards.find(({ orgYearId }) => orgYearId === pick.orgYearId);
		const player = card?.players.find(({ id }) => id === pick.playerSeasonId);
		if (!player || pick.fit !== roleFit(player, role)) return false;
	}
	if (value.phase.type === "player")
		return (
			Number.isInteger(value.phase.round) &&
			picks.length === value.phase.round &&
			value.phase.round >= 0 &&
			value.phase.round < 5 &&
			value.coachId === null
		);
	if (picks.length !== 5) return false;
	if (value.phase.type === "coach") return value.coachId === null;
	return typeof value.coachId === "string" && canonical.coachIds.includes(value.coachId);
}
export function parsePersistedDailyAttempt(
	raw: string,
	dataset: Dataset,
	day: string,
	seed: number,
): PersistedDailyAttempt | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (
			!isObject(value) ||
			value.version !== 1 ||
			value.day !== day ||
			value.seed !== seed ||
			!validDraft(value.draft, dataset, seed) ||
			(value.tournament !== null && !isObject(value.tournament))
		)
			return null;
		if (value.tournament) {
			if (value.draft.phase.type !== "complete" || !value.draft.coachId) return null;
			const restored = parsePersistedTournamentRun(
				JSON.stringify({
					version: TOURNAMENT_STORAGE_VERSION,
					rootSeed: seed,
					draft: {
						seed,
						cards: value.draft.cards,
						roster: value.draft.roster,
						coachId: value.draft.coachId,
					},
					tournament: value.tournament,
				}),
				dataset,
			);
			if (!restored) return null;
		}
		return value as PersistedDailyAttempt;
	} catch {
		return null;
	}
}
export function loadDailyAttempt(
	storage: StorageLike,
	dataset: Dataset,
	day: string,
	seed: number,
) {
	return parsePersistedDailyAttempt(
		storage.getItem(DAILY_ATTEMPT_STORAGE_KEY) ?? "",
		dataset,
		day,
		seed,
	);
}
export function saveDailyAttempt(storage: StorageLike, attempt: PersistedDailyAttempt) {
	storage.setItem(DAILY_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
}
export function clearDailyAttempt(storage: StorageLike) {
	storage.removeItem(DAILY_ATTEMPT_STORAGE_KEY);
}
export function loadDailyStats(storage: StorageLike) {
	return parseDailyStats(storage.getItem(DAILY_STATS_STORAGE_KEY) ?? "");
}
export function saveDailyStats(storage: StorageLike, stats: DailyStats) {
	storage.setItem(DAILY_STATS_STORAGE_KEY, JSON.stringify(stats));
}
export function fallbackDailyStats(): DailyStats {
	return EMPTY_DAILY_STATS;
}
