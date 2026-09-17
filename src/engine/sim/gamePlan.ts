import { clamp } from "../math";
import type { Attributes } from "../ratings/attributes";
import type { TeamMemberProfile, TeamProfile } from "../team";
import type { MapStyle } from "./maps";
import type { RoundPhase } from "./types";

export const GAME_PLAN_IDS = [
	"standard",
	"rush",
	"late-execute",
	"pick-heavy",
	"executes",
	"anti-strat",
	"contact",
] as const;

export type GamePlanId = (typeof GAME_PLAN_IDS)[number];
export const DEFAULT_GAME_PLAN: GamePlanId = "standard";

export function isGamePlanId(value: unknown): value is GamePlanId {
	return typeof value === "string" && (GAME_PLAN_IDS as readonly string[]).includes(value);
}

export function resolveGamePlan(value: GamePlanId | undefined): GamePlanId {
	return value && isGamePlanId(value) ? value : DEFAULT_GAME_PLAN;
}

export type GamePlanDefinition = {
	id: GamePlanId;
	label: string;
	tSide: string;
	ctSide: string;
	hint: string;
	favoredStyles: readonly MapStyle[];
	attributes: Partial<Attributes>;
	antiStrat: number;
	economyDiscipline: number;
	chemistry: number;
	pistolBias: number;
	earlyRoundBias: number;
};

export const GAME_PLANS: readonly GamePlanDefinition[] = [
	{
		id: "standard",
		label: "Standard defaults",
		tSide: "Mid control, rotate, hit when the space is there.",
		ctSide: "Hold, trade, rotate on information.",
		hint: "Safe on every map.",
		favoredStyles: [],
		attributes: {},
		antiStrat: 0,
		economyDiscipline: 0,
		chemistry: 0,
		pistolBias: 0,
		earlyRoundBias: 0,
	},
	{
		id: "rush",
		label: "Rush",
		tSide: "Take space now. Fast hits, empty utility.",
		ctSide: "Re-aggress, peek for info, fight mid early.",
		hint: "Hungry on aim maps.",
		favoredStyles: ["aim"],
		attributes: { entry: 8, aim: 6, utility: -6, igl: -6, clutch: -5 },
		antiStrat: -4,
		economyDiscipline: -10,
		chemistry: 0,
		pistolBias: 0.012,
		earlyRoundBias: 0.018,
	},
	{
		id: "late-execute",
		label: "Late execute",
		tSide: "Default until late, then dump utility on the site.",
		ctSide: "Stack, delay, play for the retake.",
		hint: "Fits tactical maps.",
		favoredStyles: ["tactical"],
		attributes: { utility: 7, igl: 6, clutch: 5, consistency: 4, entry: -8 },
		antiStrat: 2,
		economyDiscipline: 10,
		chemistry: 0,
		pistolBias: -0.008,
		earlyRoundBias: -0.006,
	},
	{
		id: "pick-heavy",
		label: "Pick-heavy",
		tSide: "Win the opening, then play the man advantage.",
		ctSide: "Hold angles. Do not re-peek.",
		hint: "Best on aim maps.",
		favoredStyles: ["aim", "hybrid"],
		attributes: { aim: 8, consistency: 6, entry: -6, utility: -6 },
		antiStrat: 0,
		economyDiscipline: 2,
		chemistry: 0,
		pistolBias: 0.004,
		earlyRoundBias: 0,
	},
	{
		id: "executes",
		label: "Executes",
		tSide: "The site is the plan. Smoke, flash, go together.",
		ctSide: "Utility to break the hit, then trade the site.",
		hint: "Works on tactical and hybrid maps.",
		favoredStyles: ["tactical", "hybrid"],
		attributes: { utility: 6, entry: 6, igl: 3, aim: -6 },
		antiStrat: -8,
		economyDiscipline: 0,
		chemistry: 0,
		pistolBias: 0,
		earlyRoundBias: 0.006,
	},
	{
		id: "anti-strat",
		label: "Anti-strat",
		tSide: "Play their book, not yours.",
		ctSide: "Break their defaults. Weaker own setups.",
		hint: "Gamble on tactical maps vs a famous five.",
		favoredStyles: ["tactical"],
		attributes: { igl: 8, aim: -7, entry: -7 },
		antiStrat: 12,
		economyDiscipline: 0,
		chemistry: 0,
		pistolBias: 0,
		earlyRoundBias: 0,
	},
	{
		id: "contact",
		label: "Contact",
		tSide: "Play as a pack. Few nades, fight together.",
		ctSide: "Trade everything. No hero peeks.",
		hint: "Pays off when the five know each other.",
		favoredStyles: ["hybrid", "aim"],
		attributes: { consistency: 8, utility: -6 },
		antiStrat: -8,
		economyDiscipline: 0,
		chemistry: 6,
		pistolBias: 0,
		earlyRoundBias: 0,
	},
] as const;

const GAME_PLAN_BY_ID = new Map(GAME_PLANS.map((plan) => [plan.id, plan]));

export function gamePlanById(id: GamePlanId | undefined): GamePlanDefinition {
	const plan = GAME_PLAN_BY_ID.get(resolveGamePlan(id));
	if (!plan) {
		throw new Error(`unknown game plan "${String(id)}"`);
	}
	return plan;
}

function shiftAttribute(
	value: number,
	delta: number | undefined,
	min: number,
	max: number,
): number {
	return clamp(value + (delta ?? 0), min, max);
}

function shiftAttributes(
	base: Attributes,
	delta: Partial<Attributes>,
	min: number,
	max: number,
): Attributes {
	return {
		aim: shiftAttribute(base.aim, delta.aim, min, max),
		entry: shiftAttribute(base.entry, delta.entry, min, max),
		clutch: shiftAttribute(base.clutch, delta.clutch, min, max),
		utility: shiftAttribute(base.utility, delta.utility, min, max),
		consistency: shiftAttribute(base.consistency, delta.consistency, min, max),
		igl: shiftAttribute(base.igl, delta.igl, min, max),
	};
}

function shiftMember(member: TeamMemberProfile, delta: Partial<Attributes>): TeamMemberProfile {
	if (Object.keys(delta).length === 0) return member;
	return { ...member, attributes: shiftAttributes(member.attributes, delta, 35, 99) };
}

export function applyGamePlan(team: TeamProfile, id: GamePlanId | undefined): TeamProfile {
	const plan = gamePlanById(id);
	if (plan.id === DEFAULT_GAME_PLAN) return team;
	return {
		...team,
		attributes: shiftAttributes(team.attributes, plan.attributes, 0, 100),
		members: team.members.map((member) => shiftMember(member, plan.attributes)),
		details: {
			...team.details,
			chemistry: {
				...team.details.chemistry,
				score: clamp(team.details.chemistry.score + plan.chemistry, 0, 100),
			},
			coaching: {
				...team.details.coaching,
				antiStrat: clamp(team.details.coaching.antiStrat + plan.antiStrat, 0, 100),
				economyDiscipline: clamp(
					team.details.coaching.economyDiscipline + plan.economyDiscipline,
					0,
					100,
				),
			},
		},
	};
}

export function isEarlyRegulationRound(roundNumber: number, phase: RoundPhase): boolean {
	if (phase !== "regulation") return false;
	return (roundNumber >= 1 && roundNumber <= 4) || (roundNumber >= 13 && roundNumber <= 16);
}
