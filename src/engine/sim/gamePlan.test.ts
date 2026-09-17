import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { applyGamePlan, DEFAULT_GAME_PLAN, gamePlanById } from "./gamePlan";
import {
	needsGamePlan,
	playRound,
	simulateSeries,
	skipRemaining,
	startLiveSeries,
	startNextMap,
} from "./live";

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
		playerId: `${prefix}-player-${index}`,
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
			chemistry: {
				score: 70,
				sharedOrgYearPairs: 5,
				sharedTeamPairs: 5,
				sharedNationalityPairs: 10,
				bonus: 20,
			},
			communication: {
				score: 90,
				playerPairCompatibility: 90,
				coachCompatibility: 90,
				languageScore: 90,
				iglAbility: 80,
				heuristic: "language-family-and-igl",
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

const teams = [profile("a"), profile("b")] as const;

describe("game plans", () => {
	it("leaves the profile unchanged for standard defaults", () => {
		const team = teams[0];
		expect(applyGamePlan(team, DEFAULT_GAME_PLAN)).toBe(team);
		expect(applyGamePlan(team, undefined)).toBe(team);
	});

	it("shifts tempo and calling attributes for named plans", () => {
		const rush = applyGamePlan(teams[0], "rush");
		const late = applyGamePlan(teams[0], "late-execute");
		const anti = applyGamePlan(teams[0], "anti-strat");
		expect(rush.attributes.entry).toBeGreaterThan(teams[0].attributes.entry);
		expect(rush.details.coaching.economyDiscipline).toBeLessThan(
			teams[0].details.coaching.economyDiscipline,
		);
		expect(late.attributes.utility).toBeGreaterThan(teams[0].attributes.utility);
		expect(late.details.coaching.economyDiscipline).toBeGreaterThan(
			teams[0].details.coaching.economyDiscipline,
		);
		expect(anti.details.coaching.antiStrat).toBeGreaterThan(teams[0].details.coaching.antiStrat);
		expect(anti.attributes.aim).toBeLessThan(teams[0].attributes.aim);
	});

	it("keeps simulateSeries on the standard plan identical to an omitted plan", () => {
		const input = { teams, seed: 44, format: "BO1" as const, playerMapId: "mirage" };
		expect(simulateSeries(input)).toEqual(simulateSeries({ ...input, gamePlan: "standard" }));
	});

	it("changes the opening-round odds when the plan is not standard", () => {
		const input = { teams, seed: 19, format: "BO1" as const, playerMapId: "dust2" };
		const standard = playRound(startLiveSeries(input));
		const rush = playRound(startLiveSeries({ ...input, gamePlan: "rush" }));
		expect(standard.ok && rush.ok).toBe(true);
		if (!standard.ok || !rush.ok) return;
		expect(standard.value.current?.gamePlan).toBe("standard");
		expect(rush.value.current?.gamePlan).toBe("rush");
		expect(rush.value.current?.rounds[0]?.winProbabilityTeamA).not.toBe(
			standard.value.current?.rounds[0]?.winProbabilityTeamA,
		);
	});

	it("pauses a BO3 after map 1 until the next plan is chosen", () => {
		let live = startLiveSeries({
			teams,
			seed: 3,
			format: "BO3",
			playerMapId: "mirage",
			gamePlan: "rush",
		});
		for (let step = 0; step < 80 && live.current; step += 1) {
			const played = playRound(live);
			expect(played.ok).toBe(true);
			if (!played.ok) return;
			live = played.value;
		}
		expect(live.complete).toBe(false);
		expect(live.maps).toHaveLength(1);
		expect(live.maps[0]?.gamePlan).toBe("rush");
		expect(needsGamePlan(live)).toBe(true);
		const blocked = playRound(live);
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.error.code).toBe("NEED_GAME_PLAN");
		const next = startNextMap(live, "anti-strat");
		expect(next.ok).toBe(true);
		if (!next.ok) return;
		expect(next.value.current?.gamePlan).toBe("anti-strat");
		expect(next.value.current?.mapContext?.homePick).toBe(false);
		expect(gamePlanById(next.value.current?.gamePlan).label).toBe("Anti-strat");
	});

	it("uses standard defaults for leftover maps when skipping", () => {
		const started = startLiveSeries({
			teams,
			seed: 12,
			format: "BO3",
			playerMapId: "nuke",
			gamePlan: "late-execute",
		});
		const done = skipRemaining(started);
		expect(done.complete).toBe(true);
		expect(done.maps[0]?.gamePlan).toBe("late-execute");
		expect(done.maps.slice(1).every((map) => map.gamePlan === "standard")).toBe(true);
		expect(done).toEqual(
			skipRemaining(
				startLiveSeries({
					teams,
					seed: 12,
					format: "BO3",
					playerMapId: "nuke",
					gamePlan: "late-execute",
				}),
			),
		);
	});
});
