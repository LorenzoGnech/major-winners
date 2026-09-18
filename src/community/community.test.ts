import { describe, expect, it } from "vitest";
import { loadDataset, ROLES } from "../data";
import { ratePlayers } from "../engine";
import { completedDraftFromSnapshot } from "./draft";
import { buildCommunityOpponents, mergeOpponentPools } from "./opponents";
import { compareBestRuns, compareHighestRated, uniqueTeamsByRoster } from "./ranking";
import {
	DEFAULT_AUTHOR_NAME,
	parseAuthorName,
	runFingerprint,
	type SavedTeamSnapshot,
} from "./schema";
import { rosterFromDraft } from "./snapshot";

const dataset = loadDataset();
const rated = ratePlayers(dataset.playerSeasons);
const orgYear = dataset.orgYears[0];
const coach = dataset.coaches[0];
if (!orgYear || !coach) throw new Error("dataset fixtures required");

function snapshot(overrides: Partial<SavedTeamSnapshot> = {}): SavedTeamSnapshot {
	const roster = {
		awp: orgYear.playerSeasonIds[0] ?? "",
		igl: orgYear.playerSeasonIds[1] ?? "",
		entry: orgYear.playerSeasonIds[2] ?? "",
		support: orgYear.playerSeasonIds[3] ?? "",
		lurker: orgYear.playerSeasonIds[4] ?? "",
	};
	return {
		id: "team-1",
		userId: null,
		authorName: "Lore",
		teamName: "Test Five",
		seed: 42,
		roster,
		coachId: coach.id,
		traits: {},
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("community schema", () => {
	it("defaults blank authors to Anonymous", () => {
		expect(parseAuthorName("")).toBe(DEFAULT_AUTHOR_NAME);
		expect(parseAuthorName("   ")).toBe(DEFAULT_AUTHOR_NAME);
		expect(parseAuthorName("Lore")).toBe("Lore");
	});

	it("fingerprints the roster and run tuple", () => {
		const team = snapshot();
		expect(
			runFingerprint({
				roster: team.roster,
				coachId: team.coachId,
				mode: "free",
				wins: 9,
				losses: 0,
				mapsWon: 9,
				mapsLost: 0,
				roundsWon: 117,
				roundsLost: 80,
			}),
		).toContain(team.roster.awp);
	});
});

describe("community ranking", () => {
	it("ranks more wins first, then fewer losses/maps/rounds", () => {
		const better = {
			wins: 9,
			losses: 0,
			mapsLost: 2,
			roundsLost: 80,
			mapsWon: 11,
			roundsWon: 140,
			createdAt: "2026-01-02T00:00:00.000Z",
		};
		const worse = {
			wins: 8,
			losses: 1,
			mapsLost: 1,
			roundsLost: 10,
			mapsWon: 20,
			roundsWon: 200,
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		expect(compareBestRuns(better, worse)).toBeLessThan(0);
		expect(
			compareBestRuns({ ...better, wins: 9, losses: 0, mapsLost: 1 }, { ...better, mapsLost: 2 }),
		).toBeLessThan(0);
	});

	it("ranks highest OVR then team name", () => {
		expect(
			compareHighestRated(
				{ overall: 90, teamName: "B", id: "1" },
				{ overall: 88, teamName: "A", id: "2" },
			),
		).toBeLessThan(0);
	});

	it("dedupes identical roster signatures", () => {
		expect(uniqueTeamsByRoster([snapshot(), snapshot({ id: "team-2" })])).toHaveLength(1);
	});
});

describe("community opponents", () => {
	it("builds a community opponent from a valid snapshot and skips broken ids", () => {
		const valid = snapshot();
		const broken = snapshot({
			id: "bad",
			roster: { ...valid.roster, awp: "missing-season" },
		});
		const built = buildCommunityOpponents([valid, broken], dataset, rated);
		expect(built).toHaveLength(1);
		expect(built[0]?.source).toBe("community");
		expect(built[0]?.org.name).toBe("Test Five");
		const draft = completedDraftFromSnapshot(valid, dataset);
		expect(draft).not.toBeNull();
		if (!draft) return;
		expect(rosterFromDraft(draft).awp).toBe(valid.roster.awp);
		expect(ROLES.every((role) => draft.roster[role].playerSeasonId === valid.roster[role])).toBe(
			true,
		);
	});

	it("merges community and historical pools by strength", () => {
		const community = buildCommunityOpponents([snapshot()], dataset, rated);
		const built = community[0];
		if (!built) throw new Error("expected a community opponent");
		const historical = [
			{
				id: "hist-low",
				label: "Low",
				source: "historical" as const,
				org: { id: "low", name: "Low" },
				profile: { ...built.profile, overall: 1 },
			},
			{
				id: "hist-high",
				label: "High",
				source: "historical" as const,
				org: { id: "high", name: "High" },
				profile: { ...built.profile, overall: 99 },
			},
		];
		const merged = mergeOpponentPools(community, historical);
		expect(merged.map((row) => row.id)).toEqual(["hist-low", built.id, "hist-high"]);
	});
});
