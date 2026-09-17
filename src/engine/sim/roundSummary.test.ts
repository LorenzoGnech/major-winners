import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { chooseRoundSummary, formatRoundSummary, resolveRoundSummary } from "./roundSummary";
import type { BuyType, KillEvent, Side } from "./types";

const labels = ["Fnatic", "NaVi"] as const;
const nick = (id: string) => (id === "dosia" ? "Dosia" : id);

function kill(killerTeam: 0 | 1, killerId: string, victimTeam: 0 | 1, victimId: string): KillEvent {
	return { killerTeam, killerId, victimTeam, victimId, weapon: "ak47" };
}

function summary(
	overrides: Partial<Parameters<typeof chooseRoundSummary>[0]> & {
		winner: 0 | 1;
		sides?: readonly [Side, Side];
		buys?: readonly [BuyType, BuyType];
	},
) {
	return chooseRoundSummary({
		sides: ["T", "CT"],
		buys: ["full-buy", "full-buy"],
		kills: [],
		sequences: [],
		timeout: false,
		pistol: false,
		phase: "regulation",
		mapId: "mirage",
		rng: createRng(1),
		...overrides,
	});
}

describe("chooseRoundSummary", () => {
	it("calls an eco steal against a full buy", () => {
		const picked = summary({
			winner: 0,
			buys: ["eco", "full-buy"],
		});
		expect(picked).toEqual({ kind: "eco-win", team: 0 });
		expect(formatRoundSummary(picked, labels, nick)).toBe(
			"An unexpected eco-round win for Fnatic.",
		);
	});

	it("credits a 3k to the player who stacked the round", () => {
		const picked = summary({
			winner: 0,
			kills: [
				kill(0, "dosia", 1, "a"),
				kill(0, "dosia", 1, "b"),
				kill(0, "dosia", 1, "c"),
				kill(1, "a", 0, "x"),
				kill(0, "y", 1, "d"),
				kill(0, "z", 1, "e"),
			],
		});
		expect(picked).toEqual({ kind: "multikill", team: 0, playerId: "dosia", kills: 3 });
		expect(formatRoundSummary(picked, labels, nick)).toBe(
			"Dosia 3 kills bring the round to Fnatic.",
		);
	});

	it("uses map-site execute flavor for a T-side gun round", () => {
		const picked = summary({
			winner: 0,
			sides: ["T", "CT"],
			kills: [
				kill(0, "a", 1, "v1"),
				kill(1, "v1", 0, "b"),
				kill(0, "c", 1, "v2"),
				kill(0, "d", 1, "v3"),
				kill(0, "e", 1, "v4"),
				kill(0, "a", 1, "v5"),
			],
			rng: createRng(2),
		});
		expect(picked.kind).toBe("execute");
		if (picked.kind !== "execute") return;
		expect(["A", "B", "mid"]).toContain(picked.site);
		expect(formatRoundSummary(picked, labels, nick)).toBe(
			`Great ${picked.site} execution by Fnatic, winning the round.`,
		);
	});

	it("uses a CT hold when the winners are on CT", () => {
		const picked = summary({
			winner: 1,
			sides: ["T", "CT"],
			kills: [
				kill(1, "a", 0, "v1"),
				kill(0, "v1", 1, "b"),
				kill(1, "c", 0, "v2"),
				kill(1, "d", 0, "v3"),
				kill(1, "e", 0, "v4"),
				kill(1, "a", 0, "v5"),
			],
		});
		expect(picked.kind).toBe("hold");
		if (picked.kind !== "hold") return;
		expect(formatRoundSummary(picked, labels, nick)).toContain("NaVi hold");
	});
});

describe("resolveRoundSummary", () => {
	it("rebuilds a pistol line when a persisted round has no summary", () => {
		const rebuilt = resolveRoundSummary({
			round: 1,
			phase: "regulation",
			sides: ["CT", "T"],
			winner: 0,
			winProbabilityTeamA: 0.5,
			scoreAfter: [1, 0],
			economy: [
				{
					buy: "pistol",
					bankBefore: 800,
					bankAfter: 1900,
					lossBonusBefore: 1400,
					lossBonusAfter: 1400,
				},
				{
					buy: "pistol",
					bankBefore: 800,
					bankAfter: 1400,
					lossBonusBefore: 1400,
					lossBonusAfter: 1900,
				},
			],
			kills: [],
			moraleAfter: [50, 50],
			timeout: false,
		} as unknown as import("./types").RoundResult);
		expect(rebuilt).toEqual({ kind: "pistol", team: 0, side: "CT" });
		expect(formatRoundSummary(rebuilt, labels, nick)).toBe("Fnatic win the CT pistol.");
	});
});
