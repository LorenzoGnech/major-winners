import { describe, expect, it } from "vitest";
import { loadDataset, ROLES } from "../data";
import { ratePlayers } from "../engine";
import { completedDraftFromSnapshot } from "./draft";
import { eloDelta, nextElo, parseDisplayName, rankedSearchWindow, rankedWinRate } from "./elo";
import { buildCommunityOpponents, mergeOpponentPools } from "./opponents";
import {
	compareBestRuns,
	compareHighestRated,
	topPublishedRuns,
	uniqueBestPublishedRuns,
	uniqueTeamsByRoster,
} from "./ranking";
import {
	authorNameFromProfile,
	DEFAULT_AUTHOR_NAME,
	type PublishedRunSnapshot,
	parseAuthorName,
	parseSiteStats,
	runFingerprint,
	type SavedTeamSnapshot,
	teamFingerprint,
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
	it("parses homepage site totals from snake_case or camelCase", () => {
		expect(parseSiteStats({ games_played: "12", saved_teams: "8", wins: "47" })).toEqual({
			gamesPlayed: 12,
			savedTeams: 8,
			wins: 47,
		});
		expect(parseSiteStats([{ gamesPlayed: 1, savedTeams: 2, wins: 3 }])).toEqual({
			gamesPlayed: 1,
			savedTeams: 2,
			wins: 3,
		});
		expect(parseSiteStats({ gamesPlayed: -1, savedTeams: 0, wins: 0 })).toBeNull();
	});

	it("defaults blank authors to Anonymous", () => {
		expect(parseAuthorName("")).toBe(DEFAULT_AUTHOR_NAME);
		expect(parseAuthorName("   ")).toBe(DEFAULT_AUTHOR_NAME);
		expect(parseAuthorName("Lore")).toBe("Lore");
		expect(authorNameFromProfile(undefined)).toBe(DEFAULT_AUTHOR_NAME);
		expect(authorNameFromProfile("lore")).toBe("lore");
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

	it("fingerprints a saved roster with a mode tag", () => {
		const team = snapshot();
		expect(
			teamFingerprint({ roster: team.roster, coachId: team.coachId, tag: "duel:K7M2QX" }),
		).toBe(
			`${team.roster.awp},${team.roster.igl},${team.roster.entry},${team.roster.support},${team.roster.lurker}|${team.coachId}|duel:K7M2QX`,
		);
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

	it("keeps the top published runs by result", () => {
		const team = snapshot();
		const run = (id: string, wins: number, losses: number): PublishedRunSnapshot => ({
			id,
			team,
			mode: "free",
			wins,
			losses,
			mapsWon: wins,
			mapsLost: losses,
			roundsWon: wins * 13,
			roundsLost: losses * 13,
			finish: wins === 9 ? "Champion" : "Legends Swiss",
			perfect: wins === 9 && losses === 0,
			fingerprint: id,
			createdAt: "2026-01-01T00:00:00.000Z",
		});
		expect(
			topPublishedRuns([run("a", 3, 3), run("b", 9, 0), run("c", 8, 1), run("d", 6, 3)], 3).map(
				(row) => row.id,
			),
		).toEqual(["b", "c", "d"]);
		const other = snapshot({
			id: "team-2",
			roster: { ...team.roster, awp: team.roster.entry },
		});
		expect(
			uniqueBestPublishedRuns(
				[run("b", 9, 0), { ...run("c", 8, 1), team: other }, run("dup", 7, 2)],
				3,
			).map((row) => row.id),
		).toEqual(["b", "c"]);
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

describe("ranked elo", () => {
	it("moves 16 points between equal ratings", () => {
		expect(nextElo(1000, 1000, true)).toBe(1016);
		expect(nextElo(1000, 1000, false)).toBe(984);
		expect(eloDelta(1000, 1000, true)).toBe(16);
	});

	it("rewards an underdog more than a favorite", () => {
		expect(nextElo(1000, 1200, true)).toBe(1024);
		expect(nextElo(1200, 1000, true)).toBe(1208);
		expect(nextElo(1200, 1000, false)).toBe(1176);
	});

	it("floors at 100", () => {
		expect(nextElo(100, 2000, false)).toBe(100);
	});

	it("widens the search window with wait time", () => {
		expect(rankedSearchWindow(0)).toBe(100);
		expect(rankedSearchWindow(4999)).toBe(100);
		expect(rankedSearchWindow(5000)).toBe(150);
		expect(rankedSearchWindow(60_000)).toBe(400);
	});

	it("accepts a 3–16 character handle", () => {
		expect(parseDisplayName("ab")).toBeNull();
		expect(parseDisplayName("lore")).toBe("lore");
		expect(parseDisplayName("Lore_2018")).toBe("Lore_2018");
		expect(parseDisplayName("not a name")).toBeNull();
	});

	it("computes ranked win rate only after a match", () => {
		expect(rankedWinRate(0, 0)).toBeNull();
		expect(rankedWinRate(1, 1)).toBe(50);
		expect(rankedWinRate(2, 1)).toBe(67);
	});
});
