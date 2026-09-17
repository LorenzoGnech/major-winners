import type { OrgTier } from "../../data/schema";

/** Distinct org-year cards revealed in the five player rounds. */
export const PLAYER_CARD_COUNT = 5;

/** Coach candidates sampled for the sixth round. */
export const COACH_CANDIDATE_COUNT = 5;

/** Major rerolls and team rerolls each player may spend before a pick. */
export const REROLL_BUDGET = 2;

/**
 * Relative integer tickets for without-replacement org-year sampling.
 * Legendary cards show up more often than cult cards when the pool is mixed.
 */
export const TIER_WEIGHTS: Record<OrgTier, number> = {
	legendary: 5,
	strong: 3,
	cult: 1,
};

export function orgYearWeight(tier: OrgTier): number {
	return TIER_WEIGHTS[tier];
}
