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
		icon: `/bonuses/${id}.svg`,
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
		"+1.8% round win chance for the rest of the map",
		[{ kind: "win-prob", amount: 0.018 }],
		{ type: "map" },
	),
	def(
		"professor",
		"bonus",
		"The Professor",
		"+1.8% round win chance for the rest of the map",
		[{ kind: "win-prob", amount: 0.018 }],
		{ type: "map" },
	),
	def("red-bull", "bonus", "Red Bull", "Doubles this player's power this round", [
		{ kind: "combat", scale: 2 },
	]),
	def("trashtalk", "bonus", "Trashtalk", "Opponent morale −20", [
		{ kind: "morale", opponent: -20 },
	]),
	def("x-god", "bonus", "X-God", "Team morale +20", [{ kind: "morale", self: 20 }]),
	def("olofboost", "bonus", "Olofboost", "Big steal chance on eco or force this round", [
		{ kind: "win-prob", amount: 0.08, when: "eco-force" },
	]),
	def(
		"clutch-minister",
		"bonus",
		"Clutch Minister",
		"Much more likely to be last alive this round",
		[{ kind: "clutch", scale: 2.5 }],
	),
	def("god-cs", "bonus", "God CS", "Doubles this player's power this round", [
		{ kind: "combat", scale: 2 },
	]),
	def("inhuman-reactions", "bonus", "Inhuman Reactions", "Opens the round and clutches harder", [
		{ kind: "opener", scale: 3 },
		{ kind: "clutch", scale: 2 },
		{ kind: "win-prob", amount: 0.02 },
	]),
	def("one-tap-master", "bonus", "One Tap Master", "Doubles power; pistols hit even harder", [
		{ kind: "combat", scale: 2 },
		{ kind: "win-prob", amount: 0.05, when: "pistol" },
	]),
	def("brother", "bonus", "You're not my friend, you're my brother my friend", "Team morale +30", [
		{ kind: "morale", self: 30 },
	]),
	def("god-denis", "bonus", "God Denis", "Doubles this player's power this round", [
		{ kind: "combat", scale: 2 },
	]),
	def("ez4ence", "bonus", "EZ4ENCE", "Team morale +20", [{ kind: "morale", self: 20 }]),
	def(
		"guardian-flick",
		"bonus",
		"I remember a Guardian flick",
		"Always an AWP, opens the round, doubles power",
		[{ kind: "force-awp" }, { kind: "opener", scale: 3 }, { kind: "combat", scale: 2 }],
	),
	def("choke", "malus", "Choke", "Much weaker this round, and the round is slipperier", [
		{ kind: "combat", scale: 0.4 },
		{ kind: "clutch", scale: 0.2 },
		{ kind: "win-prob", amount: -0.03 },
	]),
	def("in-jail", "malus", "In jail", "Halves this player's power this round", [
		{ kind: "combat", scale: 0.5 },
	]),
	def("pregnant", "malus", "Pregnant", "Halves this player's power this round", [
		{ kind: "combat", scale: 0.5 },
	]),
	def(
		"vac-ban",
		"malus",
		"VAC ban",
		"This player is at 25% power for the rest of the map",
		[{ kind: "combat", scale: 0.25 }],
		{ type: "map" },
	),
	def("save", "malus", "Save", "This player does not take a fight this round", [
		{ kind: "combat", scale: 0.05 },
		{ kind: "exclude-killer" },
	]),
	def(
		"tactical-genius",
		"bonus",
		"Tactical Genius",
		"+1.5% round win chance for the rest of the map, +10 morale",
		[
			{ kind: "win-prob", amount: 0.015 },
			{ kind: "morale", self: 10 },
		],
		{ type: "map" },
	),
	def("na-player", "malus", "The North American Player", "Halves this player's power this round", [
		{ kind: "combat", scale: 0.5 },
	]),
	def("jacked", "bonus", "Jacked", "+50% power this round", [{ kind: "combat", scale: 1.5 }]),
	def("one-more-star", "malus", "Just one more star", "Team morale −20", [
		{ kind: "morale", self: -20 },
	]),
	def(
		"new-porsche",
		"malus",
		"New Porsche",
		"Halves this player's power this round; he's busy trying out the new Porsche",
		[{ kind: "combat", scale: 0.5 }],
	),
	def("duk", "malus", "Duk", "Too many chickens. Team morale −10", [{ kind: "morale", self: -10 }]),
];

const byId = new Map(BONUS_CATALOG.map((row) => [row.id, row]));

export function isBonusId(value: string): value is BonusId {
	return byId.has(value as BonusId);
}

export function bonusById(id: BonusId): BonusDefinition {
	const row = byId.get(id);
	if (!row) throw new Error(`unknown bonus "${id}"`);
	return row;
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

export function resolveTraitRound(input: {
	lingering: readonly LingeringBonus[];
	hits: readonly { member: TraitHolder; bonusId: BonusId }[];
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
		const linger = bonusById(procHit.bonusId).linger;
		if (linger?.type === "map") {
			lingering.push({
				bonusId: procHit.bonusId,
				seasonId: procHit.member.id,
				until: { type: "map" },
			});
		} else if (linger?.type === "rounds") {
			lingering.push({
				bonusId: procHit.bonusId,
				seasonId: procHit.member.id,
				until: { type: "rounds", remaining: linger.count },
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
	) => {
		applyEffectsToModifiers(definition.effects, seasonId, {
			combatScale,
			clutchScale,
			openerScale,
			excludeKillers,
			forceAwp,
		});
		for (const effect of definition.effects) {
			if (effect.kind === "win-prob") {
				const when = effect.when ?? "always";
				const matches =
					when === "always" ||
					(when === "pistol" && input.pistol) ||
					(when === "eco-force" && (input.buy === "eco" || input.buy === "force"));
				if (matches) winProb += effect.amount;
			}
			if (includeInstant && effect.kind === "morale") {
				moraleSelf += effect.self ?? 0;
				moraleOpponent += effect.opponent ?? 0;
			}
		}
	};

	for (const row of lingering) {
		const includeInstant = proc?.bonusId === row.bonusId && proc.seasonId === row.seasonId;
		applyDefinition(bonusById(row.bonusId), row.seasonId, includeInstant);
	}
	if (procHit && !bonusById(procHit.bonusId).linger) {
		applyDefinition(bonusById(procHit.bonusId), procHit.member.id, true);
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

export function pickTraitHits(
	holders: readonly { member: TraitHolder; bonusId: BonusId }[],
	rng: { next(): number; nextInt(maxExclusive: number): number },
): { member: TraitHolder; bonusId: BonusId }[] {
	const hits = holders.filter(() => rng.next() < TRAIT_PROC_CHANCE);
	if (hits.length <= 1) return hits;
	const chosen = hits[rng.nextInt(hits.length)];
	return chosen ? [chosen] : [];
}
