import { describe, expect, it } from "vitest";
import type { KillEvent, RoundResult, TeamMemberProfile } from "../engine";
import {
	clutchBeatLine,
	clutchHeadline,
	clutchMomentLines,
	clutchMomentStartIndex,
	clutchOpponents,
	isCrucialRound,
	scoreBefore,
} from "./clutchNarrative";

const baseRound = {
	round: 12,
	phase: "regulation",
	sides: ["CT", "T"],
	winner: 0,
	winProbabilityTeamA: 0.5,
	scoreAfter: [12, 11],
	economy: [
		{
			buy: "full-buy",
			bankBefore: 4000,
			bankAfter: 1400,
			lossBonusBefore: 1400,
			lossBonusAfter: 1400,
		},
		{
			buy: "full-buy",
			bankBefore: 4000,
			bankAfter: 1400,
			lossBonusBefore: 1400,
			lossBonusAfter: 1400,
		},
	],
	kills: [],
	moraleAfter: [50, 50],
	timeout: false,
	summary: { kind: "default", team: 0 },
} as RoundResult;

describe("clutchNarrative", () => {
	it("treats match point, pistols, ecos, overtime, and deciders as crucial", () => {
		expect(
			isCrucialRound({ round: baseRound, format: "BO1", mapIndex: 0, seriesScore: [0, 0] }),
		).toBe(true);
		expect(
			isCrucialRound({
				round: {
					...baseRound,
					scoreAfter: [6, 5],
					economy: [{ ...baseRound.economy[0], buy: "pistol" }, baseRound.economy[1]],
				},
				format: "BO1",
				mapIndex: 0,
				seriesScore: [0, 0],
			}),
		).toBe(true);
		expect(
			isCrucialRound({
				round: { ...baseRound, phase: "overtime", scoreAfter: [15, 15] },
				format: "BO1",
				mapIndex: 0,
				seriesScore: [0, 0],
			}),
		).toBe(true);
		expect(
			isCrucialRound({
				round: { ...baseRound, scoreAfter: [4, 3] },
				format: "BO3",
				mapIndex: 2,
				seriesScore: [1, 1],
			}),
		).toBe(true);
	});

	it("names the 1vX and resolves the last beat", () => {
		expect(clutchHeadline("s1mple", 3)).toBe("s1mple · 1 vs 3");
		expect(scoreBefore(baseRound)).toEqual([11, 11]);
		expect(
			clutchBeatLine({
				player: "s1mple",
				against: 2,
				won: true,
				killIndex: 6,
				startKillIndex: 5,
				remainingAfter: 0,
				weapon: "awp",
			}),
		).toBe("s1mple takes the round.");
		expect(
			clutchBeatLine({
				player: "s1mple",
				against: 4,
				won: true,
				killIndex: 6,
				startKillIndex: 5,
				remainingAfter: 3,
				weapon: "awp",
			}),
		).toBe("Still a 1 vs 3.");
	});

	it("opens the overlay on the setup kill and narrates each remaining duel", () => {
		expect(clutchMomentStartIndex(6)).toBe(5);
		const kills: KillEvent[] = [
			{ killerTeam: 1, killerId: "electronic", victimTeam: 0, victimId: "olof", weapon: "ak47" },
			{ killerTeam: 1, killerId: "s1mple", victimTeam: 0, victimId: "jw", weapon: "awp" },
			{ killerTeam: 1, killerId: "s1mple", victimTeam: 0, victimId: "flusha", weapon: "awp" },
			{ killerTeam: 0, killerId: "krimz", victimTeam: 1, victimId: "flamie", weapon: "m4a1s" },
			{ killerTeam: 1, killerId: "electronic", victimTeam: 0, victimId: "dennis", weapon: "ak47" },
			{ killerTeam: 0, killerId: "krimz", victimTeam: 1, victimId: "edward", weapon: "m4a1s" },
			{ killerTeam: 0, killerId: "krimz", victimTeam: 1, victimId: "s1mple", weapon: "m4a1s" },
			{ killerTeam: 0, killerId: "krimz", victimTeam: 1, victimId: "electronic", weapon: "m4a1s" },
		];
		const names: Record<string, string> = {
			krimz: "KRIMZ",
			s1mple: "s1mple",
			electronic: "electronic",
			edward: "Edward",
		};
		expect(
			clutchMomentLines({
				player: "KRIMZ",
				playerId: "krimz",
				clutchTeam: 0,
				against: 2,
				won: true,
				startKillIndex: 6,
				kills,
				revealedCount: 6,
				nameOf: (id) => names[id] ?? id,
			}),
		).toEqual(["KRIMZ is left 1 vs 2 with the M4A1-S."]);
		expect(
			clutchMomentLines({
				player: "KRIMZ",
				playerId: "krimz",
				clutchTeam: 0,
				against: 2,
				won: true,
				startKillIndex: 6,
				kills,
				revealedCount: 8,
				nameOf: (id) => names[id] ?? id,
			}),
		).toEqual([
			"KRIMZ is left 1 vs 2 with the M4A1-S.",
			"KRIMZ finds s1mple. One left.",
			"KRIMZ takes electronic and the round.",
		]);
		const opponents = [
			{ id: "s1mple", nick: "s1mple" },
			{ id: "electronic", nick: "electronic" },
			{ id: "flamie", nick: "flamie" },
			{ id: "edward", nick: "Edward" },
		].map((row) => ({ ...row, playerId: row.id }) as TeamMemberProfile);
		expect(
			clutchOpponents(opponents, kills, 6, 7)
				.filter((row) => !row.dead)
				.map((row) => row.member.nick),
		).toEqual(["electronic"]);
	});
});
