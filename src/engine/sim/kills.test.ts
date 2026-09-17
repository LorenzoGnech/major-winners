import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import { createRng } from "../rng";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { makeKills } from "./kills";
import type { WeaponId } from "./types";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function profile(prefix: string): TeamProfile {
	const slots = ["awp", "igl", "entry", "support", "lurker"] as const;
	const members: TeamMemberProfile[] = slots.map((slot, index) => ({
		id: `${prefix}-${index}`,
		playerId: `${prefix}-${index}`,
		nick: `${prefix}${index}`,
		nationality: "DK",
		orgId: prefix,
		year: 2020,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: 80,
		effectiveOvr: 80,
		attributes,
	}));
	return {
		seed: 1,
		overall: 80,
		components: {
			baseStrength: 80,
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
const loadouts = new Map<string, WeaponId>(
	teams.flatMap((team) => team.members.map((member) => [member.id, "ak47" as const])),
);

describe("makeKills clutch intent", () => {
	it("stages no clutch sequence when intent is none", () => {
		const { sequences } = makeKills(teams, 0, createRng(3), loadouts, "none");
		expect(sequences).toEqual([]);
	});

	it("stages a won 1vX for the round winner", () => {
		const { kills, sequences } = makeKills(teams, 0, createRng(8), loadouts, "win");
		expect(sequences).toHaveLength(1);
		expect(sequences[0]).toMatchObject({ team: 0, won: true });
		const against = sequences[0]?.against ?? 0;
		expect(against).toBeGreaterThanOrEqual(2);
		const setup = kills.slice(0, sequences[0]?.startKillIndex ?? 0);
		const alive = new Set(teams[0].members.map((member) => member.id));
		const enemies = new Set(teams[1].members.map((member) => member.id));
		for (const kill of setup) {
			alive.delete(kill.victimId);
			enemies.delete(kill.victimId);
		}
		expect(alive.size).toBe(1);
		expect(enemies.size).toBe(against);
	});

	it("stages a denied 1vX for the losing side", () => {
		const { sequences } = makeKills(teams, 0, createRng(4), loadouts, "lose");
		expect(sequences).toHaveLength(1);
		expect(sequences[0]).toMatchObject({ team: 1, won: false });
	});

	it("stages the requested against-count for a won player clutch", () => {
		for (const against of [2, 3, 4, 5] as const) {
			const { kills, sequences } = makeKills(
				teams,
				0,
				createRng(against),
				loadouts,
				"win",
				against,
			);
			expect(sequences).toEqual([expect.objectContaining({ team: 0, against, won: true })]);
			const start = sequences[0]?.startKillIndex ?? 0;
			const alive = new Set(teams[0].members.map((member) => member.id));
			const enemies = new Set(teams[1].members.map((member) => member.id));
			for (const kill of kills.slice(0, start)) {
				alive.delete(kill.victimId);
				enemies.delete(kill.victimId);
			}
			expect(alive.size).toBe(1);
			expect(enemies.size).toBe(against);
			expect(kills.slice(start).every((kill) => kill.killerTeam === 0)).toBe(true);
		}
	});

	it("stages the requested against-count for a denied player clutch", () => {
		const { kills, sequences } = makeKills(teams, 1, createRng(9), loadouts, "lose", 3);
		expect(sequences).toEqual([expect.objectContaining({ team: 0, against: 3, won: false })]);
		const start = sequences[0]?.startKillIndex ?? 0;
		const alive = new Set(teams[0].members.map((member) => member.id));
		const enemies = new Set(teams[1].members.map((member) => member.id));
		for (const kill of kills.slice(0, start)) {
			alive.delete(kill.victimId);
			enemies.delete(kill.victimId);
		}
		expect(alive.size).toBe(1);
		expect(enemies.size).toBe(3);
		expect(kills.at(-1)?.victimTeam).toBe(0);
	});
});
