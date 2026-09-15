import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { chooseBuy, INITIAL_ECONOMY, resolveEconomyRound } from "./economy";
import { simulateSeries } from "./simulate";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function profile(prefix: string, overall = 80): TeamProfile {
	const slots = ["awp", "igl", "entry", "support", "lurker"] as const;
	const members: TeamMemberProfile[] = slots.map((slot, index) => ({
		id: `${prefix}-player-${index}`,
		nick: `${prefix}${index}`,
		nationality: "DK",
		orgId: prefix,
		year: 2020,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: overall,
		effectiveOvr: overall,
		attributes,
	}));
	return {
		seed: 1,
		overall,
		components: {
			baseStrength: overall,
			chemistry: 70,
			communication: 90,
			structure: 90,
			coaching: 60,
		},
		details: {
			chemistry: { score: 70, sharedOrgYearPairs: 5, bonus: 20 },
			communication: {
				score: 90,
				playerPairCompatibility: 90,
				coachCompatibility: 90,
				heuristic: "conservative-language-family",
			},
			structure: {
				score: 90,
				naturalRoleCount: 5,
				secondaryRoleCount: 0,
				offRoleCount: 0,
				iglFit: "primary",
				primaryAwpCount: 1,
			},
			coaching: {
				score: 60,
				overallImpact: 0.5,
				comebackResilience: 80,
				economyDiscipline: 80,
				antiStrat: 80,
			},
		},
		attributes,
		members,
		coach: { id: `${prefix}-coach`, nick: `${prefix} coach` },
		strengths: [],
		weaknesses: [],
	};
}

const equalTeams = [profile("alpha"), profile("bravo")] as const;

describe("simulateSeries", () => {
	it("is deeply deterministic for the same inputs", () => {
		const input = { teams: equalTeams, seed: "stable", format: "BO3" as const };
		expect(simulateSeries(input)).toEqual(simulateSeries(input));
	});

	it("ends regulation at 13 wins or reaches a 12-12 overtime", () => {
		for (let seed = 0; seed < 100; seed += 1) {
			const map = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
			expect(map).toBeDefined();
			if ((map?.overtimeBlocks ?? 0) === 0) {
				expect(Math.max(...(map?.score ?? [0, 0]))).toBe(13);
				expect(map?.rounds.length).toBeLessThanOrEqual(24);
			} else {
				expect(map?.regulationScore).toEqual([12, 12]);
			}
		}
	});

	it("can enter overtime and always terminates", () => {
		let overtimeMap = simulateSeries({ teams: equalTeams, seed: 0, format: "BO1" }).maps[0];
		for (let seed = 1; seed < 2_000 && overtimeMap?.overtimeBlocks === 0; seed += 1) {
			overtimeMap = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
		}
		expect(overtimeMap?.regulationScore).toEqual([12, 12]);
		expect(overtimeMap?.overtimeBlocks).toBeGreaterThan(0);
		expect(overtimeMap?.overtimeBlocks).toBeLessThanOrEqual(12);
		expect(overtimeMap?.score[0]).not.toBe(overtimeMap?.score[1]);
		expect(overtimeMap?.rounds.length).toBeLessThanOrEqual(97);
	});

	it("stops a BO3 as soon as one team wins two maps", () => {
		const result = simulateSeries({ teams: equalTeams, seed: 77, format: "BO3" });
		expect(result.score[result.winner]).toBe(2);
		expect(result.maps.length).toBeGreaterThanOrEqual(2);
		expect(result.maps.length).toBeLessThanOrEqual(3);
		if (result.maps.length === 3) expect(result.score).toContain(1);
	});

	it("is symmetric for equal teams across many seeds", () => {
		let winsA = 0;
		const samples = 600;
		for (let seed = 0; seed < samples; seed += 1) {
			winsA += simulateSeries({ teams: equalTeams, seed, format: "BO1" }).winner === 0 ? 1 : 0;
		}
		expect(winsA / samples).toBeGreaterThan(0.45);
		expect(winsA / samples).toBeLessThan(0.55);
	});

	it("gives a ten-OVR stronger team a clear but non-certain advantage", () => {
		const teams = [profile("strong", 90), profile("weak", 80)] as const;
		let wins = 0;
		const samples = 500;
		for (let seed = 0; seed < samples; seed += 1) {
			wins += simulateSeries({ teams, seed, format: "BO1" }).winner === 0 ? 1 : 0;
		}
		expect(wins / samples).toBeGreaterThan(0.62);
		expect(wins / samples).toBeLessThan(0.93);
	});

	it("keeps scoreboard kills and deaths consistent with actual events", () => {
		const map = simulateSeries({ teams: equalTeams, seed: 123, format: "BO1" }).maps[0];
		expect(map).toBeDefined();
		const kills = map?.scoreboard.map((team) =>
			team.reduce((total, player) => total + player.kills, 0),
		);
		const deaths = map?.scoreboard.map((team) =>
			team.reduce((total, player) => total + player.deaths, 0),
		);
		expect(kills?.[0]).toBe(deaths?.[1]);
		expect(kills?.[1]).toBe(deaths?.[0]);
		for (const team of map?.scoreboard ?? []) {
			expect(team).toHaveLength(5);
			for (const player of team) {
				expect(player.kast).toBeGreaterThanOrEqual(0);
				expect(player.kast).toBeLessThanOrEqual(100);
				expect(player.adr).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it("only emits highlights for valid rounds, players, and coaches", () => {
		const map = simulateSeries({ teams: equalTeams, seed: 456, format: "BO3" }).maps[0];
		const playerIds = new Set(
			equalTeams.flatMap((team) => team.members.map((member) => member.id)),
		);
		const coachIds = new Set(equalTeams.map((team) => team.coach.id));
		for (const highlight of map?.highlights ?? []) {
			expect(highlight.round).toBeGreaterThanOrEqual(1);
			expect(highlight.round).toBeLessThanOrEqual(map?.rounds.length ?? 0);
			if ("playerId" in highlight) expect(playerIds.has(highlight.playerId)).toBe(true);
			if (highlight.type === "opening-duel") expect(playerIds.has(highlight.victimId)).toBe(true);
			if (highlight.type === "coach-timeout") expect(coachIds.has(highlight.coachId)).toBe(true);
		}
	});

	it("accepts and preserves map context", () => {
		const context = { mapId: "de_placeholder", label: "Placeholder", futureBias: 0 };
		const map = simulateSeries({
			teams: equalTeams,
			seed: 9,
			format: "BO1",
			mapContext: context,
		}).maps[0];
		expect(map?.mapContext).toEqual(context);
		expect(map?.label).toBe("Placeholder");
	});
});

describe("economy", () => {
	it("progresses loss bonus and resets it after a win", () => {
		const firstLoss = resolveEconomyRound(INITIAL_ECONOMY, "pistol", false);
		expect(firstLoss.state.lossBonus).toBe(1_900);
		expect(firstLoss.state.bank).toBe(2_200);
		expect(chooseBuy(firstLoss.state, { pistol: false, economyDiscipline: 80 })).toBe("eco");
		const secondLoss = resolveEconomyRound(firstLoss.state, "eco", false);
		expect(secondLoss.state.lossBonus).toBe(2_400);
		const win = resolveEconomyRound(secondLoss.state, "force", true);
		expect(win.state.lossBonus).toBe(1_400);
		expect(win.state.losses).toBe(0);
	});
});
