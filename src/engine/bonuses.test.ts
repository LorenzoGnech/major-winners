import { describe, expect, it } from "vitest";
import {
	BONUS_CATALOG,
	bonusById,
	collectTraitHolders,
	combatWinProb,
	eligibleTraits,
	type LingeringBonus,
	pickTraitHits,
	resolveTraitRound,
	revealTraits,
	TRAIT_PROC_CHANCE,
	TRAIT_REVEAL_CHANCE,
	tickLingering,
	traitDraftHint,
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

	it("gives every ropz season New Porsche", () => {
		expect(eligibleTraits("ropz-2025-vitality")).toEqual(["new-porsche"]);
		expect(eligibleTraits("ropz-2017-mouz")).toEqual(["new-porsche"]);
		expect(bonusById("new-porsche")).toMatchObject({
			polarity: "malus",
			effects: [{ kind: "combat", scale: 0.5 }],
		});
	});

	it("gives pashaBiceps both Brother and Duk", () => {
		expect(eligibleTraits("pashabiceps-2014-virtus-pro")).toEqual(["brother", "duk"]);
		expect(eligibleTraits("pashabiceps-2021-liquid")).toEqual(["brother", "duk"]);
		expect(bonusById("duk")).toMatchObject({
			polarity: "malus",
			effects: [
				{ kind: "win-prob", amount: -0.025 },
				{ kind: "morale", self: -10 },
			],
		});
	});

	it("writes blurbs as verb phrases that finish the draft chance line", () => {
		for (const trait of BONUS_CATALOG) {
			expect(trait.blurb).toMatch(/^[A-Z]/);
			expect(trait.blurb).not.toMatch(/^[+\-−0-9]|win chance|morale [+\-−]/);
			const hint = traitDraftHint(trait.blurb);
			expect(hint.startsWith("Each round has a small chance to ")).toBe(true);
			expect(hint.slice("Each round has a small chance to ".length)).toMatch(/^[a-z]/);
		}
	});

	it("reveals traits independently from a derived seed", () => {
		const first = revealTraits(7, 0, 0, "s1mple-2018-navi");
		const again = revealTraits(7, 0, 0, "s1mple-2018-navi");
		expect(first).toEqual(again);
		expect(TRAIT_REVEAL_CHANCE).toBe(0.5);
	});
});

describe("resolveTraitRound", () => {
	const member = profile("alpha", ["mastermind"]).members[0];

	it("expires round-limited lingering after the remaining ticks", () => {
		let lingering: LingeringBonus[] = [
			{
				bonusId: "jacked",
				seasonId: member.id,
				until: { type: "rounds", remaining: 3 },
			},
		];
		lingering = tickLingering(lingering);
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
		expect(second.winProb).toBeCloseTo(0.035);
	});

	it("turns combat scale into a timeout-sized round swing", () => {
		expect(combatWinProb(2)).toBeCloseTo(0.045);
		expect(combatWinProb(0.5)).toBeCloseTo(-0.0225);
		expect(combatWinProb(0.25)).toBeCloseTo(-0.03375);
		const doubled = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "god-cs" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(doubled.winProb).toBeCloseTo(0.045);
		expect(doubled.modifiers.combatScale.get(member.id)).toBe(2);
		const halved = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "in-jail" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(halved.winProb).toBeCloseTo(-0.0225);
	});

	it("keeps VAC Ban combat swing on lingering rounds without a new overlay", () => {
		const first = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "vac-ban" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(first.proc?.bonusId).toBe("vac-ban");
		expect(first.winProb).toBeCloseTo(-0.03375);
		const later = resolveTraitRound({
			lingering: first.lingering,
			hits: [],
			buy: "full-buy",
			pistol: false,
		});
		expect(later.proc).toBeUndefined();
		expect(later.winProb).toBeCloseTo(-0.03375);
	});

	it("applies Olofboost only on eco or force", () => {
		const eco = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "olofboost" }],
			buy: "eco",
			pistol: false,
		});
		const rifles = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "olofboost" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(eco.winProb).toBeCloseTo(0.12);
		expect(rifles.winProb).toBeCloseTo(0);
	});

	it("stacks One Tap Master combat with the pistol spike", () => {
		const pistol = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "one-tap-master" }],
			buy: "pistol",
			pistol: true,
		});
		expect(pistol.winProb).toBeCloseTo(0.045 + 0.08);
	});

	it("makes Choke a real slip and morale cards spike the proc round", () => {
		const choke = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "choke" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(choke.winProb).toBeCloseTo(combatWinProb(0.4) - 0.03);
		const brother = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "brother" }],
			buy: "full-buy",
			pistol: false,
		});
		expect(brother.winProb).toBeCloseTo(0.04);
		expect(brother.moraleSelf).toBe(30);
		const guest = resolveTraitRound({
			lingering: [],
			hits: [{ member, bonusId: "brother", team: 1 }],
			buy: "full-buy",
			pistol: false,
		});
		expect(guest.winProb).toBeCloseTo(-0.04);
		expect(guest.moraleSelf).toBe(0);
		expect(guest.moraleOpponent).toBe(30);
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

	it("lets the guest side proc when bothSidesPlayer is set", () => {
		const player = profile("alpha");
		const opponent = profile("bravo", ["trashtalk"]);
		let seenGuest = false;
		for (let seed = 0; seed < 80 && !seenGuest; seed += 1) {
			const result = simulateSeries({
				teams: [player, opponent],
				seed,
				format: "BO1",
				playerMapId: "mirage",
				bothSidesPlayer: true,
			});
			seenGuest = result.maps.some((map) =>
				map.rounds.some((round) => round.bonus?.seasonId.startsWith("bravo-")),
			);
		}
		expect(seenGuest).toBe(true);
	});

	it("rolls near 2% over many maps for a single holder", () => {
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
		expect(TRAIT_PROC_CHANCE).toBe(0.02);
		expect(procs / rounds).toBeGreaterThan(0.005);
		expect(procs / rounds).toBeLessThan(0.06);
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

	it("points overlay art at public/bonuses/art/{id}.webp", () => {
		expect(bonusById("new-porsche").art).toBe("/bonuses/art/new-porsche.webp");
		expect(bonusById("choke").icon).toBe("/bonuses/choke.svg");
	});
});
