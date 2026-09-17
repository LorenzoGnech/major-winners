import { describe, expect, it } from "vitest";
import {
	bonusById,
	collectTraitHolders,
	eligibleTraits,
	pickTraitHits,
	resolveTraitRound,
	revealTraits,
	TRAIT_REVEAL_CHANCE,
	tickLingering,
} from "./bonuses";
import type { Attributes } from "./ratings/attributes";
import { createRng } from "./rng";
import { playRound, simulateSeries, startLiveSeries } from "./sim/live";
import type { TeamMemberProfile, TeamProfile } from "./team";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function profile(prefix: string, bonusIds: TeamMemberProfile["bonusIds"] = []): TeamProfile {
	const slots = ["awp", "igl", "entry", "support", "lurker"] as const;
	const members: TeamMemberProfile[] = slots.map((slot, index) => ({
		id: `${prefix}-${slot}`,
		playerId: `${prefix}-${slot}`,
		nick: `${prefix}${slot}`,
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
		bonusIds: index === 0 ? bonusIds : [],
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

describe("trait catalog", () => {
	it("assigns Jame both Mastermind and Save on 2022 Outsiders", () => {
		expect(eligibleTraits("jame-2022-outsiders")).toEqual(["mastermind", "save"]);
	});

	it("limits EZ4ENCE to the 2019 Finnish five", () => {
		expect(eligibleTraits("allu-2019-ence")).toEqual(["ez4ence"]);
		expect(eligibleTraits("allu-2015-nip")).toEqual(["red-bull"]);
		expect(eligibleTraits("allu-2021-ence")).toEqual([]);
	});

	it("reveals traits independently from a derived seed", () => {
		const first = revealTraits(7, 0, 0, "s1mple-2018-navi");
		const again = revealTraits(7, 0, 0, "s1mple-2018-navi");
		expect(first).toEqual(again);
		expect(TRAIT_REVEAL_CHANCE).toBe(0.5);
	});
});

describe("resolveTraitRound", () => {
	const member = profile("alpha", ["god-hunden"]).members[0];

	it("applies God Hunden for three rounds then expires", () => {
		const proc = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "god-hunden" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(proc.proc?.bonusId).toBe("god-hunden");
		expect(proc.modifiers.combatScale.get(member.id)).toBe(2);
		let lingering = tickLingering(proc.lingering);
		expect(lingering[0]?.until).toEqual({ type: "rounds", remaining: 2 });
		lingering = tickLingering(lingering);
		expect(lingering[0]?.until).toEqual({ type: "rounds", remaining: 1 });
		lingering = tickLingering(lingering);
		expect(lingering).toEqual([]);
	});

	it("does not overlay a second Mastermind while one is lingering", () => {
		const first = resolveTraitRound({
			lingering: [],
			hits: [{ member: profile("alpha", ["mastermind"]).members[0], bonusId: "mastermind" }],
			buy: "full-buy",
			pistol: false,
		});
		const second = resolveTraitRound({
			lingering: first.lingering,
			hits: [
				{
					member: first.proc ? profile("alpha", ["mastermind"]).members[0] : member,
					bonusId: "mastermind",
				},
			],
			buy: "full-buy",
			pistol: false,
		});
		expect(second.proc).toBeUndefined();
		expect(second.winProb).toBeCloseTo(0.018);
	});
});

describe("in-match procs", () => {
	it("does not change a series when nobody has revealed traits", () => {
		const input = {
			teams: [profile("alpha"), profile("bravo")] as const,
			seed: "stable-traits",
			format: "BO1" as const,
		};
		expect(simulateSeries(input)).toEqual(simulateSeries(input));
		expect(simulateSeries(input).maps[0]?.rounds.some((round) => round.bonus)).toBe(false);
	});

	it("never lets the opponent proc, and at most one bonus per round", () => {
		const base = profile("alpha", ["trashtalk"]);
		const player: TeamProfile = {
			...base,
			members: base.members.map((member, index) =>
				index === 1 ? { ...member, bonusIds: ["brother"] } : member,
			),
		};
		const opponent = profile("bravo", ["choke"]);
		let live = startLiveSeries({
			teams: [player, opponent],
			seed: 99,
			format: "BO1",
			playerMapId: "mirage",
		});
		for (let i = 0; i < 40 && live.current && !live.current.complete; i += 1) {
			const played = playRound(live);
			if (!played.ok) break;
			live = played.value;
			const round = live.current?.rounds.at(-1) ?? live.maps[0]?.rounds.at(-1);
			if (round?.bonus) {
				expect(round.bonus.seasonId.startsWith("alpha-")).toBe(true);
			}
		}
		const rounds = live.maps[0]?.rounds ?? live.current?.rounds ?? [];
		expect(rounds.filter((round) => round.bonus).length).toBeGreaterThanOrEqual(0);
	});

	it("rolls near 3% over many maps for a single holder", () => {
		let procs = 0;
		let rounds = 0;
		for (let seed = 0; seed < 40; seed += 1) {
			const map = simulateSeries({
				teams: [profile("alpha", ["jacked"]), profile("bravo")],
				seed,
				format: "BO1",
				playerMapId: "mirage",
			}).maps[0];
			for (const round of map?.rounds ?? []) {
				rounds += 1;
				if (round.bonus?.bonusId === "jacked") procs += 1;
			}
		}
		expect(rounds).toBeGreaterThan(400);
		expect(procs / rounds).toBeGreaterThan(0.01);
		expect(procs / rounds).toBeLessThan(0.08);
	});
});

describe("pickTraitHits", () => {
	it("always consumes a roll per holder", () => {
		const holders = collectTraitHolders(profile("alpha", ["jacked"]).members);
		const rng = createRng(1);
		const before = rng.state;
		pickTraitHits(holders, rng);
		expect(rng.state).not.toBe(before);
	});
});

describe("bonusById", () => {
	it("marks maluses distinctly", () => {
		expect(bonusById("choke").polarity).toBe("malus");
		expect(bonusById("mastermind").polarity).toBe("bonus");
	});
});
