import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import type { PlayerSeason } from "../../data/schema";
import { accoladeBonus } from "./accolades";
import { ovrFromZ, rateOvr, zScore } from "./ovr";
import { ratePlayer, ratePlayers } from "./rate";
import { ELITE_RATING_DISTRIBUTION } from "./reference";

function seasonById(id: string): PlayerSeason {
	const season = loadDataset().playerSeasons.find((row) => row.id === id);
	if (!season) {
		throw new Error(`missing seed row ${id}`);
	}
	return season;
}

describe("z-score mapping", () => {
	it("puts an elite-mean rating at the intercept", () => {
		expect(zScore(ELITE_RATING_DISTRIBUTION["2.0"].mean, "2.0")).toBeCloseTo(0);
		expect(ovrFromZ(0)).toBe(78);
	});

	it("does not treat Rating 1.0 and 2.0 as the same scale", () => {
		const from1 = ovrFromZ(zScore(1.16, "1.0"));
		const from2 = ovrFromZ(zScore(1.16, "2.0"));
		expect(from1).toBeGreaterThan(from2);
	});
});

describe("accolades", () => {
	it("caps at 5 even on a two-Major MVP season", () => {
		expect(accoladeBonus(seasonById("coldzera-2016-sk"))).toBe(5);
	});
});

describe("ratePlayer", () => {
	const rated = ratePlayers(loadDataset().playerSeasons);
	const byId = Object.fromEntries(rated.map((row) => [row.id, row]));

	it("keeps 2018 s1mple, 2015 olofmeister, and 2003 HeatoN in legend territory", () => {
		expect(byId["s1mple-2018-navi"].ovr).toBeGreaterThanOrEqual(95);
		expect(byId["olofmeister-2015-fnatic"].ovr).toBeGreaterThanOrEqual(90);
		expect(byId["heaton-2003-sk"].ovr).toBe(94);
	});

	it("does not double-count trophies on regime none", () => {
		expect(byId["heaton-2003-sk"].breakdown.fromAccolades).toBe(0);
		expect(byId["heaton-2003-sk"].breakdown.fromCurated).toBe(94);
	});

	it("ranks s1mple above a low-frag IGL even after Major bonuses", () => {
		expect(byId["s1mple-2018-navi"].ovr).toBeGreaterThan(byId["karrigan-2022-faze"].ovr);
		expect(byId["s1mple-2018-navi"].ovr).toBeGreaterThan(byId["gla1ve-2018-astralis"].ovr);
	});

	it("always fills every attribute", () => {
		for (const row of rated) {
			for (const value of Object.values(row.attributes)) {
				expect(value).toBeGreaterThanOrEqual(35);
				expect(value).toBeLessThanOrEqual(99);
			}
		}
	});

	it("gives IGLs high igl and stars high aim", () => {
		expect(byId["gla1ve-2018-astralis"].attributes.igl).toBeGreaterThan(
			byId["s1mple-2018-navi"].attributes.igl,
		);
		expect(byId["s1mple-2018-navi"].attributes.aim).toBeGreaterThan(
			byId["gla1ve-2018-astralis"].attributes.aim,
		);
	});
});

describe("rateOvr errors", () => {
	it("throws when a none-regime row lost its curated OVR", () => {
		const heaton = seasonById("heaton-2003-sk");
		expect(() => rateOvr({ ...heaton, curated: undefined })).toThrow(/curated.ovr/);
	});
});

describe("ratePlayer identity", () => {
	it("is deterministic", () => {
		const first = loadDataset().playerSeasons[0];
		if (!first) {
			throw new Error("seed dataset is empty");
		}
		expect(ratePlayer(first)).toEqual(ratePlayer(first));
	});
});
