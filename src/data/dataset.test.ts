import { describe, expect, it } from "vitest";
import { loadDataset } from "./index";
import { playerSeasonSchema } from "./schema";
import { assertValidDataset, collectDatasetIssues, DatasetValidationError } from "./validate";

describe("seed dataset", () => {
	it("loads Major and Legacy rosters across all three rating regimes", () => {
		const dataset = loadDataset();
		expect(dataset.majors).toHaveLength(5);
		expect(dataset.orgYears).toHaveLength(8);
		expect(dataset.playerSeasons).toHaveLength(40);
		expect(dataset.orgYears.filter((roster) => roster.kind === "legacy")).toHaveLength(2);
		expect(new Set(dataset.playerSeasons.map((season) => season.dataRegime))).toEqual(
			new Set(["full", "partial", "none"]),
		);
	});

	it("resolves every Major and roster relationship", () => {
		const dataset = loadDataset();
		expect(collectDatasetIssues(dataset)).toEqual([]);
		for (const orgYear of dataset.orgYears) {
			if (orgYear.kind === "major") {
				expect(dataset.majors.some((major) => major.id === orgYear.majorId)).toBe(true);
			} else {
				expect(orgYear.majorId).toBeUndefined();
			}
		}
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
