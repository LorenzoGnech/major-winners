export type TournamentErrorCode =
	| "NO_OPPONENTS"
	| "TOURNAMENT_COMPLETE"
	| "MISSING_NEXT_MATCH"
	| "INVALID_STATE"
	| "INVALID_RESULT"
	| "MATCH_IN_PROGRESS";

export class TournamentError extends Error {
	readonly code: TournamentErrorCode;

	constructor(code: TournamentErrorCode, message: string) {
		super(message);
		this.name = "TournamentError";
		this.code = code;
	}
}
