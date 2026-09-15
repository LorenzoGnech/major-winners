import { type Dataset, ROLES } from "../data";
import type { CompletedDraft, TournamentState } from "../engine";

export const TOURNAMENT_STORAGE_KEY = "major-winners:tournament:v1";
export const TOURNAMENT_STORAGE_VERSION = 1;

export type PersistedTournamentRun = {
	version: typeof TOURNAMENT_STORAGE_VERSION;
	rootSeed: number;
	draft: CompletedDraft;
	tournament: TournamentState;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTeamProfile(value: unknown): boolean {
	return (
		isObject(value) &&
		typeof value.overall === "number" &&
		Array.isArray(value.members) &&
		value.members.length === 5 &&
		isObject(value.coach)
	);
}

function isCompletedMatch(value: unknown): boolean {
	return (
		isObject(value) &&
		typeof value.matchNumber === "number" &&
		typeof value.won === "boolean" &&
		isObject(value.opponent) &&
		isTeamProfile(value.opponent.profile) &&
		isObject(value.result) &&
		Array.isArray(value.result.teams) &&
		value.result.teams.length === 2 &&
		value.result.teams.every(isTeamProfile) &&
		Array.isArray(value.result.maps)
	);
}

function isSwissRecord(value: unknown): boolean {
	return (
		isObject(value) &&
		Number.isInteger(value.wins) &&
		Number.isInteger(value.losses) &&
		Number(value.wins) >= 0 &&
		Number(value.wins) <= 3 &&
		Number(value.losses) >= 0 &&
		Number(value.losses) <= 3
	);
}

export function parsePersistedTournamentRun(
	raw: string,
	dataset: Dataset,
): PersistedTournamentRun | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!isObject(value) || value.version !== TOURNAMENT_STORAGE_VERSION) return null;
		if (
			!Number.isInteger(value.rootSeed) ||
			!isObject(value.draft) ||
			!isObject(value.tournament)
		) {
			return null;
		}
		const draft = value.draft;
		if (
			!Number.isInteger(draft.seed) ||
			typeof draft.coachId !== "string" ||
			!dataset.coaches.some((coach) => coach.id === draft.coachId) ||
			!isObject(draft.roster) ||
			!Array.isArray(draft.cards)
		) {
			return null;
		}
		for (const role of ROLES) {
			const pick = draft.roster[role];
			if (
				!isObject(pick) ||
				pick.role !== role ||
				typeof pick.playerSeasonId !== "string" ||
				!dataset.playerSeasons.some((player) => player.id === pick.playerSeasonId)
			) {
				return null;
			}
		}
		const tournament = value.tournament;
		if (
			tournament.rootSeed !== value.rootSeed ||
			!["active", "champion", "eliminated"].includes(String(tournament.status)) ||
			!["challengers", "legends", "champions"].includes(String(tournament.stage)) ||
			!Array.isArray(tournament.history) ||
			!tournament.history.every(isCompletedMatch) ||
			!isSwissRecord(tournament.challengers) ||
			!isSwissRecord(tournament.legends) ||
			(tournament.playoffRound !== null &&
				!["quarterfinal", "semifinal", "final"].includes(String(tournament.playoffRound)))
		) {
			return null;
		}
		if (
			tournament.status === "active" &&
			(!isObject(tournament.nextMatch) ||
				typeof tournament.nextMatch.matchNumber !== "number" ||
				!isObject(tournament.nextMatch.opponent) ||
				!isTeamProfile(tournament.nextMatch.opponent.profile))
		) {
			return null;
		}
		if (
			(tournament.status !== "active" && tournament.nextMatch !== null) ||
			(tournament.status === "active" &&
				tournament.stage === "champions" &&
				tournament.playoffRound === null)
		) {
			return null;
		}
		return value as PersistedTournamentRun;
	} catch {
		return null;
	}
}
