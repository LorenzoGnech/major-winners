import { describe, expect, it } from "vitest";
import { loadDataset } from "./index";
import { playerSeasonSchema, ROLES } from "./schema";
import { assertValidDataset, collectDatasetIssues, DatasetValidationError } from "./validate";

describe("seed dataset", () => {
	it("loads 8 org-years and 40 player-seasons across all three regimes", () => {
		const dataset = loadDataset();
		expect(dataset.orgYears).toHaveLength(8);
		expect(dataset.playerSeasons).toHaveLength(40);
		expect(new Set(dataset.playerSeasons.map((season) => season.dataRegime))).toEqual(
			new Set(["full", "partial", "none"]),
		);
	});

	it("can fill every role on every org-year", () => {
		const dataset = loadDataset();
		expect(collectDatasetIssues(dataset)).toEqual([]);
		for (const orgYear of dataset.orgYears) {
			const fillable = new Set(
				orgYear.playerSeasonIds.flatMap((id) => {
					const season = dataset.playerSeasons.find((row) => row.id === id);
					return season?.roles ?? [];
				}),
			);
			for (const role of ROLES) {
				expect(fillable, orgYear.id).toContain(role);
			}
		}
	});
});

describe("dataset validation", () => {
	it("rejects a none-regime row without curated fields", () => {
		const result = playerSeasonSchema.safeParse({
			id: "heaton-2003",
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
			accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
		});
		expect(result.success).toBe(false);
	});

	it("flags a player-season that does not belong to its org-year", () => {
		const dataset = loadDataset();
		const broken = {
			...dataset,
			orgYears: dataset.orgYears.map((orgYear) =>
				orgYear.id === "nip-2013"
					? {
							...orgYear,
							playerSeasonIds: orgYear.playerSeasonIds.slice(0, 4).concat("pronax-2015"),
						}
					: orgYear,
			),
		};
		const issues = collectDatasetIssues(broken);
		expect(issues.some((issue) => issue.message.includes("does not match org-year"))).toBe(true);
		expect(() => assertValidDataset(broken)).toThrow(DatasetValidationError);
	});
});
