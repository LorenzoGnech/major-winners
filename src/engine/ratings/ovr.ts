import type { PlayerSeason } from "../../data/schema";
import { clamp, roundInt } from "../math";
import { accoladeBonus } from "./accolades";
import {
	ELITE_RATING_DISTRIBUTION,
	FINAL_OVR_MAX,
	FINAL_OVR_MIN,
	OVR_Z_INTERCEPT,
	OVR_Z_SLOPE,
	RATING_OVR_MAX,
	RATING_OVR_MIN,
	type RatingVersion,
} from "./reference";

export type OvrBreakdown = {
	fromRating: number | null;
	fromCurated: number | null;
	fromAccolades: number;
	zScore: number | null;
};

export function zScore(rating: number, version: RatingVersion): number {
	const { mean, sd } = ELITE_RATING_DISTRIBUTION[version];
	return (rating - mean) / sd;
}

export function ovrFromZ(z: number): number {
	return clamp(OVR_Z_INTERCEPT + OVR_Z_SLOPE * z, RATING_OVR_MIN, RATING_OVR_MAX);
}

export function rateOvr(season: PlayerSeason): { ovr: number; breakdown: OvrBreakdown } {
	if (season.dataRegime === "none" || season.dataRegime === "fallback") {
		const fromCurated = season.curated?.ovr;
		if (fromCurated === undefined) {
			throw new Error(`curated player ${season.id} is missing curated.ovr`);
		}
		return {
			ovr: roundInt(clamp(fromCurated, FINAL_OVR_MIN, FINAL_OVR_MAX)),
			breakdown: {
				fromRating: null,
				fromCurated,
				fromAccolades: 0,
				zScore: null,
			},
		};
	}

	const stats = season.stats;
	if (!stats) {
		throw new Error(`statted player ${season.id} is missing stats`);
	}

	const z = zScore(stats.rating, stats.ratingVersion);
	const fromRating = ovrFromZ(z);
	const fromAccolades = accoladeBonus(season);
	const ovr = roundInt(clamp(fromRating + fromAccolades, FINAL_OVR_MIN, FINAL_OVR_MAX));

	return {
		ovr,
		breakdown: {
			fromRating,
			fromCurated: null,
			fromAccolades,
			zScore: z,
		},
	};
}
