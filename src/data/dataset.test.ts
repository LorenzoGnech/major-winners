import { describe, expect, it } from "vitest";
import { loadDataset } from "./index";
import { playerSeasonSchema } from "./schema";
import { assertValidDataset, collectDatasetIssues, DatasetValidationError } from "./validate";

describe("complete Major dataset", () => {
	it("loads every played Major roster across all four rating regimes", () => {
		const dataset = loadDataset();
		expect(dataset.majors).toHaveLength(24);
		expect(dataset.orgYears.filter((roster) => roster.kind === "major")).toHaveLength(511);
		expect(dataset.playerSeasons.length).toBeGreaterThan(2_000);
		expect(dataset.orgYears.filter((roster) => roster.kind === "legacy")).toHaveLength(2);
		expect(new Set(dataset.playerSeasons.map((season) => season.dataRegime))).toEqual(
			new Set(["full", "partial", "none", "fallback"]),
		);
	});

	it("resolves every Major and roster relationship", () => {
		const dataset = loadDataset();
		expect(collectDatasetIssues(dataset)).toEqual([]);
		for (const major of dataset.majors) {
			const rosters = dataset.orgYears.filter((roster) => roster.majorId === major.id);
			expect(rosters, major.id).toHaveLength(major.teamCount);
			expect(
				rosters.every((roster) => roster.note === undefined),
				`${major.id} placement coverage`,
			).toBe(true);
			expect(major.sources[0]?.revision, major.id).toMatch(/^\d+$/);
		}
		for (const legacy of dataset.orgYears.filter((roster) => roster.kind === "legacy")) {
			expect(legacy.majorId).toBeUndefined();
		}
		const zeroCoaches = dataset.coaches.filter(
			(coach) =>
				coach.modifiers.comeback + coach.modifiers.economy + coach.modifiers.antistrat === 0,
		);
		expect(zeroCoaches.map((coach) => coach.id)).toEqual([]);
		expect(dataset.coaches.find((coach) => coach.id === "zonic-2018")?.modifiers).toEqual({
			comeback: 2,
			economy: 2,
			antistrat: 2,
		});
		expect(dataset.coaches.find((coach) => coach.id === "jabich")).toMatchObject({
			nick: "jab jabich",
			tier: "legendary",
			modifiers: { comeback: 2, economy: 2, antistrat: 2 },
		});
	});

	it("keeps known AWPers and IGLs after role inference", () => {
		const dataset = loadDataset();
		const byId = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
		expect(byId.get("s1mple-2018-navi")).toMatchObject({
			primaryRole: "awp",
			roleProvenance: { kind: "curated" },
		});
		expect(byId.get("gla1ve-2018-astralis")?.primaryRole).toBe("igl");
		expect(byId.get("zywoo-2019-vitality")?.primaryRole).toBe("awp");
		expect(byId.get("device-2016-astralis")?.primaryRole).toBe("awp");
		const karrigan = dataset.playerSeasons.filter((season) => season.playerId === "karrigan");
		expect(karrigan.length).toBeGreaterThan(0);
		expect(karrigan.every((season) => season.primaryRole === "igl")).toBe(true);
	});

	it("keeps shared nicks on separate careers", () => {
		const dataset = loadDataset();
		const kazakh = dataset.playerSeasons.filter((season) => season.playerId === "adren");
		const american = dataset.playerSeasons.filter((season) => season.playerId === "adren_american");
		const bosnian = dataset.playerSeasons.filter((season) => season.playerId === "niko");
		const danish = dataset.playerSeasons.filter((season) => season.playerId === "niko_danish");
		expect(kazakh.length).toBeGreaterThan(0);
		expect(american.map((season) => season.id).sort()).toEqual([
			"adren_american-2013-team-ibuypower",
			"adren_american-2014-team-ibuypower",
			"adren_american-2015-liquid",
			"adren_american-2016-liquid",
		]);
		expect(kazakh.every((season) => season.nationality === "KZ")).toBe(true);
		expect(american.every((season) => season.nationality === "US")).toBe(true);
		expect(american.every((season) => season.displayNick === "adreN (US)")).toBe(true);
		expect(bosnian.every((season) => season.nationality === "BA")).toBe(true);
		expect(danish.map((season) => season.id).sort()).toEqual([
			"niko_danish-2018-north",
			"niko_danish-2023-og",
		]);
		expect(danish.every((season) => season.nationality === "DK")).toBe(true);
		expect(danish.every((season) => season.displayNick === "niko (DK)")).toBe(true);
		expect(
			dataset.playerSeasons
				.filter((season) => season.playerId === "alex_spanish")
				.map((season) => season.id),
		).toEqual(["alex_spanish-2021-movistar-riders"]);
		expect(
			dataset.playerSeasons
				.filter((season) => season.playerId === "lucky_danish")
				.map((season) => season.id),
		).toEqual(["lucky_danish-2021-astralis"]);
		expect(
			dataset.coaches
				.filter((coach) => coach.id.startsWith("adren_american-"))
				.every((coach) => coach.nationality === "US"),
		).toBe(true);
	});

	it("does not assign three or more primary AWPs on one roster", () => {
		const dataset = loadDataset();
		const seasonById = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
		const crowded = dataset.orgYears.filter((roster) => {
			const awps = roster.playerSeasonIds.filter((id) => seasonById.get(id)?.primaryRole === "awp");
			return awps.length >= 3;
		});
		expect(crowded.map((roster) => roster.id)).toEqual([]);
	});
});

describe("dataset validation", () => {
	it("rejects a none-regime row without curated fields", () => {
		const result = playerSeasonSchema.safeParse({
			id: "heaton-2003-sk",
			playerId: "heaton",
			nick: "HeatoN",
			realName: "Emil Christensen",
			nationality: "SE",
			year: 2003,
			orgId: "sk",
			game: "cs16",
			roles: ["awp"],
			primaryRole: "awp",
			dataRegime: "none",
			ratingProvenance: { kind: "curated-legend" },
			accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
		});
		expect(result.success).toBe(false);
	});

	it("flags a player-season that does not belong to its org-year", () => {
		const dataset = loadDataset();
		const broken = {
			...dataset,
			orgYears: dataset.orgYears.map((orgYear) =>
				orgYear.id === "nip-dreamhack-winter-2013"
					? {
							...orgYear,
							playerSeasonIds: orgYear.playerSeasonIds.slice(0, 4).concat("pronax-2015-fnatic"),
						}
					: orgYear,
			),
		};
		const issues = collectDatasetIssues(broken);
		expect(issues.some((issue) => issue.message.includes("does not match org-year"))).toBe(true);
		expect(() => assertValidDataset(broken)).toThrow(DatasetValidationError);
	});
});
