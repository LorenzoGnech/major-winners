import type { PlayerSeason } from "../../data/schema";
import { clamp, roundInt, scaleStat } from "../math";

export type Attributes = {
	aim: number;
	entry: number;
	clutch: number;
	utility: number;
	consistency: number;
	igl: number;
};

const ATTR_MIN = 35;
const ATTR_MAX = 99;

function finish(value: number): number {
	return roundInt(clamp(value, ATTR_MIN, ATTR_MAX));
}

function overlay(derived: Attributes, curated: Partial<Attributes> | undefined): Attributes {
	if (!curated) {
		return derived;
	}
	return {
		aim: curated.aim ?? derived.aim,
		entry: curated.entry ?? derived.entry,
		clutch: curated.clutch ?? derived.clutch,
		utility: curated.utility ?? derived.utility,
		consistency: curated.consistency ?? derived.consistency,
		igl: curated.igl ?? derived.igl,
	};
}

function deriveFromStats(season: PlayerSeason, ovr: number): Attributes {
	const stats = season.stats;
	if (!stats) {
		throw new Error(`statted player ${season.id} is missing stats`);
	}

	const aimFromRating = scaleStat(stats.rating, 0.92, 1.28);
	const aim =
		stats.adr !== undefined
			? roundInt((scaleStat(stats.adr, 66, 90) + aimFromRating) / 2)
			: aimFromRating;

	const entry =
		stats.openingKpr !== undefined
			? scaleStat(stats.openingKpr, 0.08, 0.18)
			: season.primaryRole === "entry"
				? ovr
				: season.roles.includes("entry")
					? ovr - 6
					: ovr - 14;

	const clutch =
		stats.clutchRate !== undefined
			? scaleStat(stats.clutchRate, 0.2, 0.38)
			: scaleStat(1 - stats.dpr, 0.32, 0.44);

	const kastOrOvr = stats.kast !== undefined ? scaleStat(stats.kast, 66, 76) : ovr - 4;
	const utility =
		season.primaryRole === "support"
			? Math.max(kastOrOvr, ovr - 2)
			: season.primaryRole === "awp"
				? kastOrOvr - 8
				: kastOrOvr;

	const consistency =
		stats.kast !== undefined ? scaleStat(stats.kast, 66, 76) : scaleStat(1 - stats.dpr, 0.32, 0.44);

	const igl =
		season.primaryRole === "igl"
			? clamp(ovr + 8, 72, 96)
			: season.roles.includes("igl")
				? ovr - 8
				: 32 + (ovr - 70) * 0.25;

	return {
		aim: finish(aim),
		entry: finish(entry),
		clutch: finish(clutch),
		utility: finish(utility),
		consistency: finish(consistency),
		igl: finish(igl),
	};
}

function deriveFromCurated(season: PlayerSeason, ovr: number): Attributes {
	const fallback: Attributes = {
		aim: ovr,
		entry: season.primaryRole === "entry" ? ovr : ovr - 8,
		clutch: ovr - 4,
		utility: season.primaryRole === "support" ? ovr : ovr - 6,
		consistency: ovr - 2,
		igl: season.primaryRole === "igl" ? clamp(ovr + 6, 72, 96) : 36,
	};
	return overlay(fallback, season.curated?.attributes);
}

export function rateAttributes(season: PlayerSeason, ovr: number): Attributes {
	const derived =
		season.dataRegime === "none" || season.dataRegime === "fallback"
			? deriveFromCurated(season, ovr)
			: deriveFromStats(season, ovr);
	return overlay(derived, season.curated?.attributes);
}
