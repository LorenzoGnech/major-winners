export type DraftErrorCode =
	| "insufficient_org_years"
	| "insufficient_coaches"
	| "missing_player"
	| "invalid_phase"
	| "player_not_on_card"
	| "role_occupied"
	| "unknown_coach";

export class DraftError extends Error {
	readonly code: DraftErrorCode;

	constructor(code: DraftErrorCode, message: string) {
		super(message);
		this.name = "DraftError";
		this.code = code;
	}
}

export type DraftResult<T> = { ok: true; value: T } | { ok: false; error: DraftError };

export function ok<T>(value: T): DraftResult<T> {
	return { ok: true, value };
}

export function fail<T = never>(code: DraftErrorCode, message: string): DraftResult<T> {
	return { ok: false, error: new DraftError(code, message) };
}
