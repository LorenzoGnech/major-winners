import type { SeriesFormat, SeriesResult } from "../sim";
import type { TeamProfile } from "../team";

export type TournamentStage = "challengers" | "legends" | "champions";
export type PlayoffRound = "quarterfinal" | "semifinal" | "final";
export type TournamentStatus = "active" | "champion" | "eliminated";

export type SwissRecord = {
	wins: number;
	losses: number;
};

export type HistoricalOpponent = {
	id: string;
	label: string;
	profile: TeamProfile;
};

export type TournamentNextMatch = {
	matchNumber: number;
	stage: TournamentStage;
	playoffRound?: PlayoffRound;
	record?: SwissRecord;
	format: SeriesFormat;
	seriesSeed: number;
	opponent: HistoricalOpponent;
};

export type TournamentMatch = TournamentNextMatch & {
	won: boolean;
	result: SeriesResult;
	recordAfter?: SwissRecord;
};

export type TournamentState = {
	rootSeed: number;
	status: TournamentStatus;
	stage: TournamentStage;
	challengers: SwissRecord;
	legends: SwissRecord;
	playoffRound: PlayoffRound | null;
	history: readonly TournamentMatch[];
	nextMatch: TournamentNextMatch | null;
};

export type SeriesResolver = (input: {
	teams: readonly [TeamProfile, TeamProfile];
	seed: number;
	format: SeriesFormat;
	nextMatch: TournamentNextMatch;
}) => SeriesResult;

export type TournamentResult =
	| { ok: true; value: TournamentState }
	| { ok: false; error: import("./error").TournamentError };
