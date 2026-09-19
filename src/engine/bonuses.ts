import playerBonusesJson from "../data/json/player-bonuses.json" with { type: "json" };
import { ROLES, type Role } from "../data/schema";
import { createRng } from "./rng";

export const BONUS_IDS = [
	"mastermind",
	"professor",
	"red-bull",
	"trashtalk",
	"x-god",
	"olofboost",
	"clutch-minister",
	"god-cs",
	"inhuman-reactions",
	"one-tap-master",
	"brother",
	"god-denis",
	"ez4ence",
	"guardian-flick",
	"choke",
	"in-jail",
	"pregnant",
	"vac-ban",
	"save",
	"tactical-genius",
	"na-player",
	"jacked",
	"one-more-star",
	"new-porsche",
	"duk",
] as const;

export type BonusId = (typeof BONUS_IDS)[number];
export type BonusPolarity = "bonus" | "malus";

export type BonusEffect =
	| { kind: "win-prob"; amount: number; when?: "always" | "eco-force" | "pistol" }
	| { kind: "morale"; self?: number; opponent?: number }
	| { kind: "combat"; scale: number }
	| { kind: "clutch"; scale: number }
	| { kind: "opener"; scale: number }
	| { kind: "exclude-killer" }
	| { kind: "force-awp" };

export type BonusLinger = { type: "map" } | { type: "rounds"; remaining: number };

export type BonusDefinition = {
	id: BonusId;
	polarity: BonusPolarity;
	name: string;
	blurb: string;
	icon: string;
	art: string;
	effects: readonly BonusEffect[];
	linger?: { type: "map" } | { type: "rounds"; count: number };
};

export const TRAIT_REVEAL_CHANCE = 0.5;
export const TRAIT_PROC_CHANCE = 0.02;
/** Combat scale 2.0 is about a timeout-sized round swing; 0.25 (VAC) is −3.4% per remaining round. */
export const COMBAT_WIN_PROB_WEIGHT = 0.045;
export const MIN_TRAIT_LINGER_ROUNDS = 3;
const ROUND_LINGER = { type: "rounds", count: MIN_TRAIT_LINGER_ROUNDS } as const;

export function combatWinProb(scale: number): number {
	return (scale - 1) * COMBAT_WIN_PROB_WEIGHT;
}

function def(
	id: BonusId,
	polarity: BonusPolarity,
	name: string,
	blurb: string,
	effects: readonly BonusEffect[],
	linger?: BonusDefinition["linger"],
): BonusDefinition {
	return {
		id,
		polarity,
		name,
		blurb,
		icon: polarity === "malus" ? "/bonuses/malus.svg" : "/bonuses/bonus.svg",
		art: `/bonuses/art/${id}.webp`,
		effects,
		linger,
	};
}

export const BONUS_CATALOG: readonly BonusDefinition[] = [
	def(
		"mastermind",
		"bonus",
		"Mastermind",
		"Enter the mind of the enemy and out-call them for the rest of the map",
		[{ kind: "win-prob", amount: 0.035 }],
		{ type: "map" },
	),
	def(
		"professor",
		"bonus",
		"The Professor",
		"Read the enemy plays like a textbook for the rest of the map",
		[{ kind: "win-prob", amount: 0.035 }],
		{ type: "map" },
	),
	def("red-bull", "bonus", "Red Bull", "Go nuclear and swing the next three rounds our way", [
		{ kind: "combat", scale: 2 },
	]),
	def(
		"trashtalk",
		"bonus",
		"Trashtalk",
		"Trashtalk the enemy into a mistake and reduce their morale for three rounds",
		[
			{ kind: "win-prob", amount: 0.03 },
			{ kind: "morale", opponent: -20 },
		],
	),
	def(
		"x-god",
		"bonus",
		"X-God",
		"The X God boosts the squad morale with his looks for three rounds",
		[
			{ kind: "win-prob", amount: 0.03 },
			{ kind: "morale", self: 20 },
		],
	),
	def("olofboost", "bonus", "Olofboost", "Eco or force buys are stronger for three rounds", [
		{ kind: "win-prob", amount: 0.12, when: "eco-force" },
	]),
	def(
		"clutch-minister",
		"bonus",
		"Clutch Minister",
		"Higher probability of a clutch win for three rounds",
		[
			{ kind: "win-prob", amount: 0.03 },
			{ kind: "clutch", scale: 2.5 },
		],
	),
	def("god-cs", "bonus", "God CS", "The gods of CS are on your side for three rounds", [
		{ kind: "combat", scale: 2 },
	]),
	def(
		"inhuman-reactions",
		"bonus",
		"Inhuman Reactions",
		"Faster reactions and better clutching for three rounds",
		[
			{ kind: "opener", scale: 3 },
			{ kind: "clutch", scale: 2 },
			{ kind: "win-prob", amount: 0.045 },
		],
	),
	def("one-tap-master", "bonus", "One Tap Master", "One-tap everyone for three rounds", [
		{ kind: "combat", scale: 2 },
		{ kind: "win-prob", amount: 0.08, when: "pistol" },
	]),
	def(
		"brother",
		"bonus",
		"You're not my friend, you're my brother my friend",
		"The team are not brothers for three rounds, improving morale",
		[
			{ kind: "win-prob", amount: 0.04 },
			{ kind: "morale", self: 30 },
		],
	),
	def("god-denis", "bonus", "God Denis", "The_denis is on your side for three rounds", [
		{ kind: "combat", scale: 2 },
	]),
	def("ez4ence", "bonus", "EZ4ENCE", "The next three rounds are EZ4ENCE", [
		{ kind: "win-prob", amount: 0.03 },
		{ kind: "morale", self: 20 },
	]),
	def(
		"guardian-flick",
		"bonus",
		"I remember a Guardian flick",
		"Flicks will be smoother for three rounds",
		[{ kind: "force-awp" }, { kind: "opener", scale: 3 }, { kind: "combat", scale: 2 }],
	),
	def(
		"choke",
		"malus",
		"Choke",
		"A failed deagle shot from behind will hunt you for three rounds",
		[
			{ kind: "combat", scale: 0.4 },
			{ kind: "clutch", scale: 0.2 },
			{ kind: "win-prob", amount: -0.03 },
		],
	),
	def("in-jail", "malus", "In jail", "Check HLTV, for three round he's stuck in jail", [
		{ kind: "combat", scale: 0.5 },
	]),
	def(
		"pregnant",
		"malus",
		"Pregnant",
		"Check HLTV, performance will be affected for three rounds",
		[{ kind: "combat", scale: 0.5 }],
	),
	def(
		"vac-ban",
		"malus",
		"VAC ban",
		"The rest of the map will be played at a quarter strength, if he can access the server",
		[{ kind: "combat", scale: 0.25 }],
		{ type: "map" },
	),
	def(
		"save",
		"malus",
		"Save",
		"Save time for the next three round, but at least he'll keep the AWP",
		[{ kind: "combat", scale: 0.05 }, { kind: "exclude-killer" }],
	),
	def(
		"tactical-genius",
		"bonus",
		"Tactical Genius",
		"It's time for the signature tactic go A, but then go B",
		[
			{ kind: "win-prob", amount: 0.03 },
			{ kind: "morale", self: 15 },
		],
		{ type: "map" },
	),
	def("na-player", "malus", "The North American Player", "But Titan he's the french star", [
		{ kind: "combat", scale: 0.5 },
	]),
	def("jacked", "bonus", "Jacked", "U wouldnt say this shit to him at lan", [
		{ kind: "combat", scale: 1.5 },
	]),
	def(
		"one-more-star",
		"malus",
		"Just one more star",
		"Since you're short of one more superstar, morale is down",
		[
			{ kind: "win-prob", amount: -0.04 },
			{ kind: "morale", self: -20 },
		],
	),
	def(
		"new-porsche",
		"malus",
		"New Porsche",
		"The new Porsche distracts him from the game, he's playing at half strength for three rounds",
		[{ kind: "combat", scale: 0.5 }],
	),
	def("duk", "malus", "Duk", "We have a chicken problem here", [
		{ kind: "win-prob", amount: -0.025 },
		{ kind: "morale", self: -10 },
	]),
];

export function traitDraftHint(blurb: string): string {
	const rest = /^[A-Za-z]/.test(blurb) ? blurb.charAt(0).toLowerCase() + blurb.slice(1) : blurb;
	return `Each round has a small chance to ${rest}`;
}

const byId = new Map(BONUS_CATALOG.map((row) => [row.id, row]));

export function isBonusId(value: string): value is BonusId {
	return byId.has(value as BonusId);
}

export function bonusById(id: BonusId): BonusDefinition {
	const row = byId.get(id);
	if (!row) throw new Error(`unknown bonus "${id}"`);
	return row;
}

export function traitLingerSpec(id: BonusId): { type: "map" } | { type: "rounds"; count: number } {
	return bonusById(id).linger ?? ROUND_LINGER;
}

export type TraitAura = {
	seasonId: string;
	playerId: string;
	bonusId: BonusId;
	polarity: BonusPolarity;
};

export function activeTraitAuras(
	rounds: readonly { round: number; bonus?: RoundBonus }[],
	roundNumber: number,
): ReadonlyMap<string, TraitAura> {
	const bySeason = new Map<string, TraitAura>();
	if (roundNumber <= 0) return bySeason;
	for (const round of rounds) {
		const bonus = round.bonus;
		if (!bonus || round.round > roundNumber) continue;
		const spec = traitLingerSpec(bonus.bonusId);
		const active = spec.type === "map" ? true : roundNumber < round.round + spec.count;
		if (!active) continue;
		const definition = bonusById(bonus.bonusId);
		bySeason.set(bonus.seasonId, {
			seasonId: bonus.seasonId,
			playerId: bonus.playerId,
			bonusId: bonus.bonusId,
			polarity: definition.polarity,
		});
	}
	return bySeason;
}

function asBonusIds(value: unknown): BonusId[] {
	const raw = Array.isArray(value) ? value : [value];
	return raw.filter((id): id is BonusId => typeof id === "string" && isBonusId(id));
}

const assignments = new Map<string, readonly BonusId[]>();
for (const [seasonId, value] of Object.entries(playerBonusesJson)) {
	assignments.set(seasonId, asBonusIds(value));
}

export function eligibleTraits(seasonId: string): readonly BonusId[] {
	return assignments.get(seasonId) ?? [];
}

export function revealTraits(
	seed: number,
	round: number,
	rerollIndex: number,
	seasonId: string,
	ids: readonly BonusId[] = eligibleTraits(seasonId),
): BonusId[] {
	return ids.filter((id) => {
		const rng = createRng(`${seed}:trait-reveal:${round}:${rerollIndex}:${seasonId}:${id}`);
		return rng.next() < TRAIT_REVEAL_CHANCE;
	});
}

export type LingeringBonus = {
	bonusId: BonusId;
	seasonId: string;
	until: BonusLinger;
	team?: 0 | 1;
};

export type RoundBonus = {
	playerId: string;
	seasonId: string;
	bonusId: BonusId;
};

export type TraitHolder = {
	id: string;
	playerId: string;
	slot: Role;
	bonusIds?: readonly BonusId[];
};

export type KillModifiers = {
	combatScale: ReadonlyMap<string, number>;
	clutchScale: ReadonlyMap<string, number>;
	openerScale: ReadonlyMap<string, number>;
	excludeKillers: ReadonlySet<string>;
	forceAwp: ReadonlySet<string>;
};

const EMPTY_MODIFIERS: KillModifiers = {
	combatScale: new Map(),
	clutchScale: new Map(),
	openerScale: new Map(),
	excludeKillers: new Set(),
	forceAwp: new Set(),
};

function scaleMap(map: Map<string, number>, seasonId: string, scale: number): void {
	map.set(seasonId, (map.get(seasonId) ?? 1) * scale);
}

export function collectTraitHolders(
	members: readonly TraitHolder[],
): { member: TraitHolder; bonusId: BonusId }[] {
	const holders: { member: TraitHolder; bonusId: BonusId }[] = [];
	for (const slot of ROLES) {
		const member = members.find((row) => row.slot === slot);
		if (!member) continue;
		for (const bonusId of member.bonusIds ?? []) {
			holders.push({ member, bonusId });
		}
	}
	return holders;
}

export function isLingeringNoop(lingering: readonly LingeringBonus[], bonusId: BonusId): boolean {
	return lingering.some((row) => row.bonusId === bonusId);
}

function applyEffectsToModifiers(
	effects: readonly BonusEffect[],
	seasonId: string,
	modifiers: {
		combatScale: Map<string, number>;
		clutchScale: Map<string, number>;
		openerScale: Map<string, number>;
		excludeKillers: Set<string>;
		forceAwp: Set<string>;
	},
): void {
	for (const effect of effects) {
		if (effect.kind === "combat") scaleMap(modifiers.combatScale, seasonId, effect.scale);
		if (effect.kind === "clutch") scaleMap(modifiers.clutchScale, seasonId, effect.scale);
		if (effect.kind === "opener") scaleMap(modifiers.openerScale, seasonId, effect.scale);
		if (effect.kind === "exclude-killer") modifiers.excludeKillers.add(seasonId);
		if (effect.kind === "force-awp") modifiers.forceAwp.add(seasonId);
	}
}

export type TraitHit = {
	member: TraitHolder;
	bonusId: BonusId;
	team?: 0 | 1;
};

export function resolveTraitRound(input: {
	lingering: readonly LingeringBonus[];
	hits: readonly TraitHit[];
	buy: "pistol" | "full-buy" | "force" | "eco";
	pistol: boolean;
}): {
	proc: RoundBonus | undefined;
	lingering: LingeringBonus[];
	winProb: number;
	moraleSelf: number;
	moraleOpponent: number;
	modifiers: KillModifiers;
} {
	const usableHits = input.hits.filter((hit) => !isLingeringNoop(input.lingering, hit.bonusId));
	const procHit = usableHits[0];
	const proc: RoundBonus | undefined = procHit
		? {
				playerId: procHit.member.playerId,
				seasonId: procHit.member.id,
				bonusId: procHit.bonusId,
			}
		: undefined;

	const lingering: LingeringBonus[] = input.lingering.map((row) =>
		row.until.type === "rounds"
			? { ...row, until: { type: "rounds", remaining: row.until.remaining } }
			: { ...row },
	);
	if (procHit) {
		const linger = traitLingerSpec(procHit.bonusId);
		const teamField = procHit.team === 1 ? ({ team: 1 } as const) : {};
		if (linger.type === "map") {
			lingering.push({
				bonusId: procHit.bonusId,
				seasonId: procHit.member.id,
				until: { type: "map" },
				...teamField,
			});
		} else {
			lingering.push({
				bonusId: procHit.bonusId,
				seasonId: procHit.member.id,
				until: { type: "rounds", remaining: linger.count },
				...teamField,
			});
		}
	}

	const combatScale = new Map<string, number>();
	const clutchScale = new Map<string, number>();
	const openerScale = new Map<string, number>();
	const excludeKillers = new Set<string>();
	const forceAwp = new Set<string>();
	let winProb = 0;
	let moraleSelf = 0;
	let moraleOpponent = 0;

	const applyDefinition = (
		definition: BonusDefinition,
		seasonId: string,
		includeInstant: boolean,
		team: 0 | 1 = 0,
	) => {
		applyEffectsToModifiers(definition.effects, seasonId, {
			combatScale,
			clutchScale,
			openerScale,
			excludeKillers,
			forceAwp,
		});
		const sign = team === 1 ? -1 : 1;
		for (const effect of definition.effects) {
			if (effect.kind === "combat") {
				winProb += combatWinProb(effect.scale) * sign;
			}
			if (effect.kind === "win-prob") {
				const when = effect.when ?? "always";
				const matches =
					when === "always" ||
					(when === "pistol" && input.pistol) ||
					(when === "eco-force" && (input.buy === "eco" || input.buy === "force"));
				if (matches) winProb += effect.amount * sign;
			}
			if (includeInstant && effect.kind === "morale") {
				if (team === 1) {
					moraleSelf += effect.opponent ?? 0;
					moraleOpponent += effect.self ?? 0;
				} else {
					moraleSelf += effect.self ?? 0;
					moraleOpponent += effect.opponent ?? 0;
				}
			}
		}
	};

	for (const row of lingering) {
		const includeInstant = proc?.bonusId === row.bonusId && proc.seasonId === row.seasonId;
		applyDefinition(bonusById(row.bonusId), row.seasonId, includeInstant, row.team ?? 0);
	}

	return {
		proc,
		lingering,
		winProb,
		moraleSelf,
		moraleOpponent,
		modifiers:
			combatScale.size === 0 &&
			clutchScale.size === 0 &&
			openerScale.size === 0 &&
			excludeKillers.size === 0 &&
			forceAwp.size === 0
				? EMPTY_MODIFIERS
				: { combatScale, clutchScale, openerScale, excludeKillers, forceAwp },
	};
}

export function tickLingering(lingering: readonly LingeringBonus[]): LingeringBonus[] {
	const next: LingeringBonus[] = [];
	for (const row of lingering) {
		if (row.until.type === "map") {
			next.push(row);
			continue;
		}
		const remaining = row.until.remaining - 1;
		if (remaining > 0) {
			next.push({ ...row, until: { type: "rounds", remaining } });
		}
	}
	return next;
}

export function pickTraitHits<T extends { member: TraitHolder; bonusId: BonusId }>(
	holders: readonly T[],
	rng: { next(): number; nextInt(maxExclusive: number): number },
): T[] {
	const hits = holders.filter(() => rng.next() < TRAIT_PROC_CHANCE);
	if (hits.length <= 1) return hits;
	const chosen = hits[rng.nextInt(hits.length)];
	return chosen ? [chosen] : [];
}
