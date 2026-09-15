import { hashStringToSeed, normalizeSeed } from "../rng";
import type { SeriesFormat } from "../sim";
import { simulateSeries } from "../sim";
import type { TeamProfile } from "../team";
import { TournamentError } from "./error";
import type {
	HistoricalOpponent,
	PlayoffRound,
	SeriesResolver,
	SwissRecord,
	TournamentMatch,
	TournamentNextMatch,
	TournamentResult,
	TournamentStage,
	TournamentState,
} from "./types";

const STAGE_DIFFICULTY: Record<TournamentStage, number> = {
	challengers: 0.18,
	legends: 0.5,
	champions: 0.82,
};

function swissRecord(state: TournamentState): SwissRecord {
	return state.stage === "challengers" ? state.challengers : state.legends;
}

function matchFormat(state: TournamentState): SeriesFormat {
	if (state.stage === "champions") return "BO3";
	const record = swissRecord(state);
	return record.wins === 2 || record.losses === 2 ? "BO3" : "BO1";
}

function sameRoster(left: TeamProfile, right: TeamProfile): boolean {
	const ids = new Set(left.members.map((member) => member.id));
	return ids.size === right.members.length && right.members.every((member) => ids.has(member.id));
}

function chooseOpponent(
	state: TournamentState,
	playerTeam: TeamProfile,
	opponents: readonly HistoricalOpponent[],
): HistoricalOpponent {
	const distinct = opponents.filter((opponent) => !sameRoster(playerTeam, opponent.profile));
	const available = distinct.length > 0 ? distinct : [...opponents];
	if (available.length === 0) {
		throw new TournamentError("NO_OPPONENTS", "a tournament requires at least one opponent");
	}
	const previousId = state.history.at(-1)?.opponent.id;
	const usedIds = new Set(state.history.map((match) => match.opponent.id));
	const notUsed = available.filter((opponent) => !usedIds.has(opponent.id));
	const noImmediateRepeat = available.filter((opponent) => opponent.id !== previousId);
	const candidates =
		notUsed.length > 0 ? notUsed : noImmediateRepeat.length > 0 ? noImmediateRepeat : available;
	const record = state.stage === "champions" ? null : swissRecord(state);
	const recordAdjustment = record ? (record.wins - record.losses) * 0.08 : 0;
	const desired = Math.max(0, Math.min(1, STAGE_DIFFICULTY[state.stage] + recordAdjustment));
	// buildHistoricalOpponents returns a stable strength index; filtering preserves that order.
	const ranked = candidates;
	const baseIndex = Math.round(desired * (ranked.length - 1));
	const jitter = hashStringToSeed(
		`${state.rootSeed}:opponent:${state.stage}:${state.history.length}`,
	);
	const offset = ranked.length > 2 ? (jitter % 3) - 1 : jitter % ranked.length;
	const index = Math.max(0, Math.min(ranked.length - 1, baseIndex + offset));
	return ranked[index] as HistoricalOpponent;
}

function prepareNext(
	state: TournamentState,
	playerTeam: TeamProfile,
	opponents: readonly HistoricalOpponent[],
): TournamentState {
	if (state.status !== "active") return { ...state, nextMatch: null };
	const matchNumber = state.history.length + 1;
	const opponent = chooseOpponent(state, playerTeam, opponents);
	const nextMatch: TournamentNextMatch = {
		matchNumber,
		stage: state.stage,
		...(state.stage === "champions" && state.playoffRound
			? { playoffRound: state.playoffRound }
			: { record: { ...swissRecord(state) } }),
		format: matchFormat(state),
		seriesSeed: hashStringToSeed(`${state.rootSeed}:major-match:${matchNumber}`),
		opponent,
	};
	return { ...state, nextMatch };
}

export function createTournament({
	rootSeed,
	playerTeam,
	opponents,
}: {
	rootSeed: number | string;
	playerTeam: TeamProfile;
	opponents: readonly HistoricalOpponent[];
}): TournamentState {
	if (opponents.length === 0) {
		throw new TournamentError("NO_OPPONENTS", "a tournament requires at least one opponent");
	}
	const initial: TournamentState = {
		rootSeed: normalizeSeed(rootSeed),
		status: "active",
		stage: "challengers",
		challengers: { wins: 0, losses: 0 },
		legends: { wins: 0, losses: 0 },
		playoffRound: null,
		history: [],
		nextMatch: null,
	};
	return prepareNext(initial, playerTeam, opponents);
}

function progressSwiss(state: TournamentState, won: boolean): TournamentState {
	const key = state.stage as "challengers" | "legends";
	const current = state[key];
	const record = {
		wins: current.wins + (won ? 1 : 0),
		losses: current.losses + (won ? 0 : 1),
	};
	const withRecord = { ...state, [key]: record };
	if (record.losses === 3) return { ...withRecord, status: "eliminated", nextMatch: null };
	if (record.wins < 3) return withRecord;
	if (key === "challengers") return { ...withRecord, stage: "legends" };
	return { ...withRecord, stage: "champions", playoffRound: "quarterfinal" };
}

function progressPlayoffs(state: TournamentState, won: boolean): TournamentState {
	if (!won) return { ...state, status: "eliminated", nextMatch: null };
	const nextRound: Record<PlayoffRound, PlayoffRound | null> = {
		quarterfinal: "semifinal",
		semifinal: "final",
		final: null,
	};
	const playoffRound = state.playoffRound;
	if (!playoffRound) {
		throw new TournamentError("MISSING_NEXT_MATCH", "active playoffs require a round");
	}
	const next = nextRound[playoffRound];
	return next
		? { ...state, playoffRound: next }
		: { ...state, playoffRound: null, status: "champion", nextMatch: null };
}

const defaultResolver: SeriesResolver = ({ teams, seed, format, nextMatch }) =>
	simulateSeries({
		teams,
		seed,
		format,
		mapContext: { label: `${nextMatch.opponent.label} · Major map` },
	});

export function runNextMatch(
	state: TournamentState,
	playerTeam: TeamProfile,
	opponents: readonly HistoricalOpponent[],
	resolver: SeriesResolver = defaultResolver,
): TournamentResult {
	if (state.status !== "active") {
		return {
			ok: false,
			error: new TournamentError("TOURNAMENT_COMPLETE", `tournament is already ${state.status}`),
		};
	}
	const next = state.nextMatch;
	if (!next) {
		return {
			ok: false,
			error: new TournamentError("MISSING_NEXT_MATCH", "active tournament has no next match"),
		};
	}
	const expectedRecord = state.stage === "champions" ? undefined : swissRecord(state);
	const invalidMetadata =
		next.matchNumber !== state.history.length + 1 ||
		next.stage !== state.stage ||
		next.format !== matchFormat(state) ||
		(state.stage === "champions"
			? !state.playoffRound || next.playoffRound !== state.playoffRound
			: !next.record ||
				next.record.wins !== expectedRecord?.wins ||
				next.record.losses !== expectedRecord?.losses);
	const winsSoFar = state.history.filter((match) => match.won).length;
	if (invalidMetadata || (state.playoffRound === "final" && winsSoFar !== 8)) {
		return {
			ok: false,
			error: new TournamentError("INVALID_STATE", "tournament state cannot play this match"),
		};
	}
	const result = resolver({
		teams: [playerTeam, next.opponent.profile],
		seed: next.seriesSeed,
		format: next.format,
		nextMatch: next,
	});
	if (
		result.format !== next.format ||
		result.seed !== next.seriesSeed ||
		(result.winner !== 0 && result.winner !== 1)
	) {
		return {
			ok: false,
			error: new TournamentError("INVALID_RESULT", "series resolver returned incompatible output"),
		};
	}
	const won = result.winner === 0;
	const recordAfter =
		next.stage === "champions"
			? undefined
			: {
					wins: (next.record?.wins ?? 0) + (won ? 1 : 0),
					losses: (next.record?.losses ?? 0) + (won ? 0 : 1),
				};
	const completed: TournamentMatch = {
		...next,
		won,
		result,
		...(recordAfter ? { recordAfter } : {}),
	};
	const withHistory: TournamentState = {
		...state,
		history: [...state.history, completed],
		nextMatch: null,
	};
	const progressed =
		state.stage === "champions"
			? progressPlayoffs(withHistory, won)
			: progressSwiss(withHistory, won);
	return {
		ok: true,
		value: prepareNext(progressed, playerTeam, opponents),
	};
}
