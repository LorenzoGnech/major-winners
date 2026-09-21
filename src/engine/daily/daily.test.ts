import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { startDraft } from "../draft";
import {
	type DailyResult,
	dailyDayLocked,
	dailyIdentity,
	EMPTY_DAILY_STATS,
	formatDailyShare,
	markDailyPlayed,
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
			totalWins: 16,
			completedRuns: 4,
			mostUsedPlayer: "—",
		});
	});
	it("counts the most used player across completed rosters", () => {
		const seasons = new Map([
			["s1mple-2018-navi", { playerId: "s1mple", nick: "s1mple" }],
			["s1mple-2021-navi", { playerId: "s1mple", nick: "s1mple" }],
			["device-2018-astralis", { playerId: "device", nick: "device" }],
			["zywoo-2023-vitality", { playerId: "zywoo", nick: "ZywOo" }],
		]);
		const roster = (awp: string, igl: string, entry: string, support: string, lurker: string) => ({
			awp,
			igl,
			entry,
			support,
			lurker,
		});
		let stats = recordDailyResult(EMPTY_DAILY_STATS, {
			...result("2026-09-15"),
			roster: roster(
				"s1mple-2018-navi",
				"device-2018-astralis",
				"zywoo-2023-vitality",
				"device-2018-astralis",
				"device-2018-astralis",
			),
		});
		stats = recordDailyResult(stats, {
			...result("2026-09-16"),
			roster: roster(
				"s1mple-2021-navi",
				"device-2018-astralis",
				"zywoo-2023-vitality",
				"device-2018-astralis",
				"zywoo-2023-vitality",
			),
		});
		expect(summarizeDailyStats(stats, "2026-09-16", seasons).mostUsedPlayer).toBe("device");
	});
	it("ignores duplicate results and corrupt storage", () => {
		const once = recordDailyResult(EMPTY_DAILY_STATS, result("2026-09-15"));
		expect(recordDailyResult(once, { ...result("2026-09-15"), wins: 9 }).results).toEqual(
			once.results,
		);
		expect(parseDailyStats("{bad")).toEqual(EMPTY_DAILY_STATS);
		expect(parseDailyStats('{"version":99}')).toEqual(EMPTY_DAILY_STATS);
	});
	it("locks a UTC day after the Daily is started or finished", () => {
		expect(dailyDayLocked(EMPTY_DAILY_STATS, "2026-09-21")).toBe(false);
		expect(dailyDayLocked(markDailyPlayed(EMPTY_DAILY_STATS, "2026-09-21"), "2026-09-21")).toBe(
			true,
		);
		expect(
			dailyDayLocked(recordDailyResult(EMPTY_DAILY_STATS, result("2026-09-21")), "2026-09-21"),
		).toBe(true);
		expect(dailyDayLocked(markDailyPlayed(EMPTY_DAILY_STATS, "2026-09-21"), "nope")).toBe(false);
	});
	it("groups share grids without spoilers", () => {
		const share = formatDailyShare(result("2026-09-15"), "https://example.test/");
		expect(share).toContain("Challengers 🟩🟥");
		expect(share).toContain("Legends 🟥");
		expect(share).not.toMatch(/s1mple|NAVI|opponent/i);
	});
});
