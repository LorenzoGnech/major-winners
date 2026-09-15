import type { OrgTier } from "../../data/schema";

/** Distinct org-year cards revealed in the five player rounds. */
export const PLAYER_CARD_COUNT = 5;

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
