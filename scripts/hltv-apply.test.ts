import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "../src/data";
import { applyHltvRow, ignMatches, openingKprOf } from "./hltv-apply";

const fallback: PlayerSeason = {
	id: "acilion-2014-myxmg",
	playerId: "acilion",
	nick: "AcilioN",
	realName: "AcilioN",
	nationality: "DK",
	year: 2014,
	orgId: "myxmg",
	game: "csgo",
	roles: ["entry"],
	primaryRole: "entry",
	roleProvenance: { kind: "teamcard-slot" },
	dataRegime: "fallback",
	ratingProvenance: { kind: "curated-fallback", source: "placement" },
	curated: { ovr: 81, attributes: {}, rationale: "fallback" },
	accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
};

const fullFallback: PlayerSeason = {
	...fallback,
	id: "s1mple-2018-navi",
	playerId: "s1mple",
	nick: "s1mple",
	realName: "Oleksandr Kostyliev",
	nationality: "UA",
	year: 2018,
	orgId: "navi",
	roles: ["awp", "entry"],
	primaryRole: "awp",
};

const options = { minMaps: 10, searchAliases: { forest: "f0rest" } };

describe("applyHltvRow", () => {
	it("promotes 2014 rows to partial when rating, kpr, and dpr exist", () => {
		const result = applyHltvRow(
			fallback,
			{
				playerSeasonIds: [fallback.id],
				nick: "AcilioN",
				ign: "AcilioN",
				year: 2014,
				rating: 1.01,
				ratingVersion: "1.0",
				kpr: 0.68,
				dpr: 0.66,
				mapsPlayed: 40,
				sourceUrl: "https://www.hltv.org/stats/players/1/acilion",
			},
			options,
		);
		expect(result).toMatchObject({
			ok: true,
			season: {
				dataRegime: "partial",
				stats: { rating: 1.01, ratingVersion: "1.0", kpr: 0.68, dpr: 0.66 },
				ratingProvenance: { kind: "verified-stats" },
			},
		});
		if (result.ok) expect(result.season.curated).toBeUndefined();
	});

	it("promotes 2018 rows to full when ADR, KAST, and impact exist", () => {
		const result = applyHltvRow(
			fullFallback,
			{
				playerSeasonIds: [fullFallback.id],
				nick: "s1mple",
				ign: "s1mple",
				year: 2018,
				rating: 1.33,
				ratingVersion: "2.0",
				kpr: 0.86,
				dpr: 0.57,
				adr: 87.5,
				kast: 75.9,
				impact: 1.41,
				openingKills: 200,
				roundsPlayed: 4000,
				mapsPlayed: 173,
				sourceUrl: "https://www.hltv.org/stats/players/7998/s1mple",
			},
			options,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.season.dataRegime).toBe("full");
			expect(result.season.stats?.openingKpr).toBeCloseTo(0.05);
			expect(result.season.primaryRole).toBe("awp");
			expect(result.season.roles).toEqual(["awp", "entry"]);
			expect(result.season.roleProvenance.kind).toBe("teamcard-slot");
		}
	});

	it("leaves verified and thin samples unchanged", () => {
		expect(applyHltvRow({ ...fullFallback, dataRegime: "full" }, undefined, options)).toMatchObject(
			{
				ok: false,
				reason: "not-fallback",
			},
		);
		expect(
			applyHltvRow(
				fallback,
				{
					playerSeasonIds: [fallback.id],
					nick: "AcilioN",
					ign: "AcilioN",
					year: 2014,
					rating: 1.01,
					kpr: 0.68,
					dpr: 0.66,
					mapsPlayed: 2,
					sourceUrl: "https://example.test",
				},
				options,
			),
		).toMatchObject({ ok: false, reason: "thin-sample" });
	});

	it("keeps an imported stats headshot when promoting stats", () => {
		const result = applyHltvRow(
			{ ...fallback, photo: "/photos/players/acilion/2014.jpg" },
			{
				playerSeasonIds: [fallback.id],
				nick: "AcilioN",
				ign: "AcilioN",
				year: 2014,
				rating: 1.01,
				ratingVersion: "1.0",
				kpr: 0.68,
				dpr: 0.66,
				mapsPlayed: 40,
				sourceUrl: "https://www.hltv.org/stats/players/1/acilion",
			},
			options,
		);
		expect(result).toMatchObject({
			ok: true,
			season: { photo: "/photos/players/acilion/2014.jpg", dataRegime: "partial" },
		});
	});
});

describe("ignMatches", () => {
	it("accepts documented aliases", () => {
		expect(
			ignMatches(
				{ ...fallback, playerId: "forest", nick: "f0rest" },
				{
					playerSeasonIds: [],
					nick: "f0rest",
					ign: "f0rest",
					year: 2014,
					sourceUrl: "https://example.test",
				},
				{ forest: "f0rest" },
			),
		).toBe(true);
	});
	it("rejects a different IGN", () => {
		expect(
			ignMatches(fallback, {
				playerSeasonIds: [],
				nick: "AcilioN",
				ign: "device",
				year: 2014,
				sourceUrl: "https://example.test",
			}),
		).toBe(false);
	});
});

describe("openingKprOf", () => {
	it("divides opening kills by rounds", () => {
		expect(
			openingKprOf({
				playerSeasonIds: [],
				nick: "x",
				year: 2018,
				openingKills: 17,
				roundsPlayed: 100,
				sourceUrl: "https://example.test",
			}),
		).toBe(0.17);
	});
});
