export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_FLOOR = 100;
export const ELO_WINDOW_START = 100;
export const ELO_WINDOW_STEP = 50;
export const ELO_WINDOW_CAP = 400;
export const ELO_WINDOW_STEP_MS = 5000;
export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 16;

export function expectedScore(rating: number, opponentRating: number): number {
	return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function nextElo(rating: number, opponentRating: number, won: boolean): number {
	const score = won ? 1 : 0;
	return Math.max(
		ELO_FLOOR,
		Math.round(rating + ELO_K * (score - expectedScore(rating, opponentRating))),
	);
}

export function eloDelta(rating: number, opponentRating: number, won: boolean): number {
	return nextElo(rating, opponentRating, won) - rating;
}

export function rankedSearchWindow(waitMs: number): number {
	const steps = Math.floor(Math.max(0, waitMs) / ELO_WINDOW_STEP_MS);
	return Math.min(ELO_WINDOW_CAP, ELO_WINDOW_START + ELO_WINDOW_STEP * steps);
}

export function parseDisplayName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.trim();
	if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return null;
	return name;
}

export function formatEloDelta(delta: number): string {
	if (delta > 0) return `+${delta}`;
	return `${delta}`;
}
