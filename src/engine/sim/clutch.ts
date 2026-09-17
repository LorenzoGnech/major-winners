import type { Rng } from "../rng";
import type { HighlightEvent } from "./types";

export const MAX_FEATURED_CLUTCHES = 3;

/** Early / mid / late map windows. At most one featured clutch per window. */
export const FEATURED_CLUTCH_WINDOWS = [
	{ start: 1, end: 8 },
	{ start: 9, end: 16 },
	{ start: 17, end: Number.POSITIVE_INFINITY },
] as const;

/** Chance a featured window of this 1vX is offered, checked rarest-first. */
export const FEATURED_CLUTCH_RATES = {
	5: 0.05,
	4: 0.2,
	3: 0.4,
	2: 0.6,
} as const;

export const FEATURED_CLUTCH_ORDER = [5, 4, 3, 2] as const;

export type FeaturedAgainst = (typeof FEATURED_CLUTCH_ORDER)[number];

export type FeaturedClutchPlan =
	| { intent: "none" }
	| { intent: "win" | "lose"; against: FeaturedAgainst };

export function featuredClutchWindow(round: number): number {
	if (round <= 8) return 0;
	if (round <= 16) return 1;
	return 2;
}

export function chooseFeaturedAgainst(rng: Rng): FeaturedAgainst | undefined {
	for (const against of FEATURED_CLUTCH_ORDER) {
		if (rng.next() < FEATURED_CLUTCH_RATES[against]) return against;
	}
	return undefined;
}

export function shouldShowFeaturedClutch(
	maps: readonly { highlights: readonly HighlightEvent[] }[],
	mapIndex: number,
	round: number,
): boolean {
	const map = maps[mapIndex];
	if (!map) return false;
	const sequences = map.highlights
		.filter(
			(highlight): highlight is Extract<HighlightEvent, { type: "clutch-sequence" }> =>
				highlight.type === "clutch-sequence",
		)
		.slice()
		.sort((left, right) => left.round - right.round);
	const slot = sequences.findIndex((sequence) => sequence.round === round);
	return slot >= 0 && slot < MAX_FEATURED_CLUTCHES;
}

/**
 * At most three featured 1vX windows per map, one per early/mid/late window,
 * and only for the player's side. A win plan stages the already-decided player
 * round win; a lose plan stages the player's failed clutch when the opponent
 * took the round.
 */
export function planFeaturedClutch(
	featuredRounds: readonly number[],
	winner: 0 | 1,
	rng: Rng,
	round: number,
): FeaturedClutchPlan {
	if (featuredRounds.length >= MAX_FEATURED_CLUTCHES) return { intent: "none" };
	const window = featuredClutchWindow(round);
	if (featuredRounds.some((featured) => featuredClutchWindow(featured) === window)) {
		return { intent: "none" };
	}
	const against = chooseFeaturedAgainst(rng);
	if (!against) return { intent: "none" };
	if (winner === 0) return { intent: "win", against };
	if (against < 3) return { intent: "none" };
	return { intent: "lose", against };
}
