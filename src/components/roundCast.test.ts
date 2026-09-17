import { describe, expect, it } from "vitest";
import type { KillEvent, RoundResult } from "../engine";
import { lineupDeadIds, liveCastLines, openingCastLine } from "./roundCast";

function round(overrides: Partial<RoundResult> & { economyBuys?: [string, string] }): RoundResult {
	const [buyA, buyB] = overrides.economyBuys ?? ["full-buy", "full-buy"];
	return {
		round: 4,
		phase: "regulation",
		sides: ["CT", "T"],
		winner: 0,
		winProbabilityTeamA: 0.5,
		scoreAfter: [3, 1],
		economy: [
			{
				buy: buyA as RoundResult["economy"][0]["buy"],
				bankBefore: 4000,
				bankAfter: 1400,
				lossBonusBefore: 1400,
				lossBonusAfter: 1400,
			},
			{
				buy: buyB as RoundResult["economy"][1]["buy"],
				bankBefore: 800,
				bankAfter: 1900,
				lossBonusBefore: 1400,
				lossBonusAfter: 1900,
			},
		],
		kills: [],
		moraleAfter: [50, 50],
		timeout: false,
		summary: { kind: "default", team: 0 },
		...overrides,
	};
}

const labels = ["Fnatic", "NaVi"] as const;

describe("openingCastLine", () => {
	it("calls out an eco", () => {
		expect(openingCastLine(round({ economyBuys: ["eco", "full-buy"] }), labels)).toBe(
			"Fnatic is forced to eco.",
		);
		expect(openingCastLine(round({ economyBuys: ["full-buy", "eco"] }), labels)).toBe(
			"NaVi is forced to eco.",
		);
	});

	it("opens a pistol on the starting side", () => {
		expect(openingCastLine(round({ economyBuys: ["pistol", "pistol"] }), labels)).toBe(
			"Pistol round. Fnatic start on CT.",
		);
	});

	it("stays quiet on an even gun round", () => {
		expect(
			openingCastLine(round({ economyBuys: ["full-buy", "full-buy"] }), labels),
		).toBeUndefined();
	});
});

describe("lineupDeadIds", () => {
	const kills: KillEvent[] = [
		{ killerTeam: 1, killerId: "n1", victimTeam: 0, victimId: "f1", weapon: "ak47" },
		{ killerTeam: 1, killerId: "n1", victimTeam: 0, victimId: "f2", weapon: "ak47" },
		{ killerTeam: 0, killerId: "f3", victimTeam: 1, victimId: "n2", weapon: "m4a1s" },
		{ killerTeam: 1, killerId: "n1", victimTeam: 0, victimId: "f3", weapon: "ak47" },
	];

	it("freezes deaths at the clutch start so later kills do not grey the board", () => {
		expect([...lineupDeadIds(kills, 2)].toSorted()).toEqual(["f1", "f2"]);
		expect([...lineupDeadIds(kills, undefined)].toSorted()).toEqual(["f1", "f2", "f3", "n2"]);
	});
});

describe("liveCastLines", () => {
	it("starts with the buy and follows the opening kill", () => {
		const lines = liveCastLines({
			round: round({ economyBuys: ["eco", "full-buy"] }),
			kills: [
				{ killerTeam: 1, killerId: "simple", victimTeam: 0, victimId: "olof", weapon: "ak47" },
			],
			teamLabels: labels,
			playerName: (id) => (id === "simple" ? "s1mple" : "olofmeister"),
		});
		expect(lines[0]).toBe("Fnatic is forced to eco.");
		expect(lines[1]).toBe("s1mple opens on olofmeister.");
	});

	it("ignores ordinary trades and calls a double", () => {
		const names: Record<string, string> = {
			simple: "s1mple",
			olof: "olofmeister",
			jw: "JW",
			electronic: "electronic",
			flamie: "flamie",
		};
		const trade = liveCastLines({
			round: round({ economyBuys: ["full-buy", "full-buy"] }),
			kills: [
				{ killerTeam: 1, killerId: "simple", victimTeam: 0, victimId: "olof", weapon: "ak47" },
				{ killerTeam: 0, killerId: "jw", victimTeam: 1, victimId: "electronic", weapon: "awp" },
			],
			teamLabels: labels,
			playerName: (id) => names[id] ?? id,
		});
		expect(trade).toEqual(["s1mple opens on olofmeister."]);

		const double = liveCastLines({
			round: round({ economyBuys: ["full-buy", "full-buy"] }),
			kills: [
				{ killerTeam: 1, killerId: "simple", victimTeam: 0, victimId: "olof", weapon: "ak47" },
				{ killerTeam: 1, killerId: "simple", victimTeam: 0, victimId: "jw", weapon: "ak47" },
			],
			teamLabels: labels,
			playerName: (id) => names[id] ?? id,
		});
		expect(double).toEqual(["s1mple opens on olofmeister.", "s1mple with the double."]);
	});
});
