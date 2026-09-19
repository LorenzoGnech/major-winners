/**
 * Elite LAN-pool reference distributions.
 *
 * These are not "all of CS" (where 1.00 is average). They describe the cluster
 * of players who actually appear on good teams at big events — the contemporaries
 * a legend should be measured against.
 *
 * Do not z-score against the committed dataset for a year. A five-man roster is
 * not a peer group (IGLs would be crushed by their own stars).
 *
 * Retune these constants when the calibration report shows one rating version
 * or era eating the leaderboard. Do not change the OVR formula to chase a row.
 */
export const ELITE_RATING_DISTRIBUTION = {
	"1.0": { mean: 1.07, sd: 0.07 },
	"2.0": { mean: 1.11, sd: 0.11 },
} as const;

export const OVR_Z_INTERCEPT = 78;
export const OVR_Z_SLOPE = 7;
export const RATING_OVR_MIN = 55;
export const RATING_OVR_MAX = 97;

export const ACCOLADE_CAP = 5;
export const FINAL_OVR_MIN = 40;
export const FINAL_OVR_MAX = 99;

export type RatingVersion = keyof typeof ELITE_RATING_DISTRIBUTION;
