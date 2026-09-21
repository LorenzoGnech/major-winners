import { describe, expect, it } from "vitest";
import type { PublishedRunSnapshot } from "../community";
import { formatSavedAt, rankedDailyRuns } from "./HomeLeaderboards";

describe("formatSavedAt", () => {
	it("renders a UTC calendar date", () => {
		expect(formatSavedAt("2026-09-18T15:41:00.000Z")).toBe("18 Sep 2026");
		expect(formatSavedAt("not-a-date")).toBe("");
	});
});

describe("rankedDailyRuns", () => {
	it("keeps non-title Daily finishes for that seed", () => {
		const roster = {
			awp: "a",
			igl: "b",
			entry: "c",
			support: "d",
			lurker: "e",
		};
		const run = (id: string, wins: number, seed: number): PublishedRunSnapshot => ({
			id,
			team: {
				id,
				userId: null,
				authorName: "Anon",
				teamName: id,
				seed,
				roster,
				coachId: "coach",
				traits: {},
				createdAt: "2026-09-21T00:00:00.000Z",
			},
			mode: "daily",
			wins,
			losses: 3,
			mapsWon: wins,
			mapsLost: 3,
			roundsWon: wins * 13,
			roundsLost: 39,
			finish: "Legends Swiss",
			perfect: false,
			fingerprint: id,
			createdAt: "2026-09-21T00:00:00.000Z",
		});
		expect(
			rankedDailyRuns([run("low", 2, 7), run("high", 5, 7), run("other", 8, 8)], 7).map(
				(row) => row.id,
			),
		).toEqual(["high", "low"]);
	});
});
