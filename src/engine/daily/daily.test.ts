import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { startDraft } from "../draft";
import {
	type DailyResult,
	dailyIdentity,
	EMPTY_DAILY_STATS,
	formatDailyShare,
	parseDailyStats,
	recordDailyResult,
	summarizeDailyStats,
} from ".";

const result = (day: string): DailyResult => ({
	day,
	status: "eliminated",
	stage: "legends",
	wins: 4,
	losses: 3,
	matches: [
		{ stage: "challengers", won: true },
		{ stage: "challengers", won: false },
		{ stage: "legends", won: false },
	],
});
describe("daily challenge", () => {
	it("uses UTC identity and a deterministic draft", () => {
		const dataset = loadDataset();
		const first = dailyIdentity(new Date("2026-09-15T00:00:01Z"));
		const last = dailyIdentity(new Date("2026-09-15T23:59:59Z"));
		expect(first).toEqual(last);
		expect(startDraft(dataset, first.seed)).toEqual(startDraft(dataset, last.seed));
	});
	it("calculates month/year streaks and gaps", () => {
		let stats = EMPTY_DAILY_STATS;
		for (const day of ["2025-12-31", "2026-01-01", "2026-01-02", "2026-01-04"])
			stats = recordDailyResult(stats, result(day));
		expect(summarizeDailyStats(stats, "2026-01-04")).toMatchObject({
			currentStreak: 1,
			maxStreak: 3,
		});
	});
	it("ignores duplicate results and corrupt storage", () => {
		const once = recordDailyResult(EMPTY_DAILY_STATS, result("2026-09-15"));
		expect(recordDailyResult(once, { ...result("2026-09-15"), wins: 9 }).results).toEqual(
			once.results,
		);
		expect(parseDailyStats("{bad")).toEqual(EMPTY_DAILY_STATS);
		expect(parseDailyStats('{"version":99}')).toEqual(EMPTY_DAILY_STATS);
	});
	it("groups share grids without spoilers", () => {
		const share = formatDailyShare(result("2026-09-15"), "https://example.test/");
		expect(share).toContain("Challengers 🟩🟥");
		expect(share).toContain("Legends 🟥");
		expect(share).not.toMatch(/s1mple|NAVI|opponent/i);
	});
});
