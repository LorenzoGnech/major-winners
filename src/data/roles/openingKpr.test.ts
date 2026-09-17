import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "../schema";
import { fillOpeningKpr, openingKprFrom } from "./openingKpr";

const season: PlayerSeason = {
	id: "s1mple-2018-navi",
	playerId: "s1mple",
	nick: "s1mple",
	realName: "Oleksandr Kostyliev",
	nationality: "UA",
	year: 2018,
	orgId: "navi",
	game: "csgo",
	roles: ["awp", "entry"],
	primaryRole: "awp",
	roleProvenance: { kind: "curated" },
	dataRegime: "full",
	ratingProvenance: { kind: "verified-stats" },
	stats: {
		rating: 1.33,
		ratingVersion: "2.0",
		kpr: 0.88,
		dpr: 0.6,
		adr: 87.5,
		kast: 75.9,
		impact: 1.41,
	},
	accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
};

describe("fillOpeningKpr", () => {
	it("divides opening kills by rounds", () => {
		expect(openingKprFrom({ playerSeasonIds: [], openingKills: 17, roundsPlayed: 100 })).toBe(0.17);
	});

	it("fills only missing openingKpr and leaves ratings untouched", () => {
		const stats = season.stats;
		if (!stats) throw new Error("expected stats on the verified fixture");
		const { seasons, filled } = fillOpeningKpr(
			[season, { ...season, id: "already", stats: { ...stats, openingKpr: 0.12 } }],
			[
				{
					playerSeasonIds: ["s1mple-2018-navi", "already"],
					openingKills: 221,
					roundsPlayed: 4416,
				},
			],
		);
		expect(filled).toBe(1);
		expect(seasons[0]?.stats?.openingKpr).toBeCloseTo(0.05, 3);
		expect(seasons[0]?.stats?.rating).toBe(1.33);
		expect(seasons[1]?.stats?.openingKpr).toBe(0.12);
	});

	it("skips rows without stats", () => {
		const fallback: PlayerSeason = { ...season, id: "x", stats: undefined, dataRegime: "fallback" };
		expect(
			fillOpeningKpr([fallback], [{ playerSeasonIds: ["x"], openingKills: 10, roundsPlayed: 100 }])
				.filled,
		).toBe(0);
	});
});
