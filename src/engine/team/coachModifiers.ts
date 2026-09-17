import type { Coach, OrgYear } from "../../data/schema";
import { hashStringToSeed } from "../rng";

export type CoachModifiers = Coach["modifiers"];

const AXES = [
	"antistrat",
	"economy",
	"comeback",
] as const satisfies readonly (keyof CoachModifiers)[];

export function modifierTotal(modifiers: CoachModifiers): number {
	return modifiers.comeback + modifiers.economy + modifiers.antistrat;
}

/** Integer bonus budget from that roster's finish. Everyone gets at least one point. */
export function placementModifierPoints(placement: number): number {
	if (placement <= 1) return 4;
	if (placement <= 2) return 3;
	if (placement <= 4) return 2;
	return 1;
}

/**
 * Spread placement points across the three tactical axes, max 2 each.
 * The starting axis rotates from a stable hash of `salt` so last-place cards
 * are not all +1 anti-strat.
 */
export function modifiersFromPlacement(placement: number, salt: string): CoachModifiers {
	const points = placementModifierPoints(placement);
	const start = hashStringToSeed(salt) % AXES.length;
	const order = AXES.map((_, index) => AXES[(start + index) % AXES.length] ?? "antistrat");
	const modifiers: CoachModifiers = { comeback: 0, economy: 0, antistrat: 0 };
	let remaining = points;
	for (const pass of [1, 2]) {
		for (const axis of order) {
			if (remaining <= 0) return modifiers;
			if (modifiers[axis] < pass) {
				modifiers[axis] += 1;
				remaining -= 1;
			}
		}
	}
	return modifiers;
}

export function bestCoachPlacement(
	coachId: string,
	orgYears: readonly Pick<OrgYear, "coachId" | "placement">[],
): number | undefined {
	let best: number | undefined;
	for (const orgYear of orgYears) {
		if (orgYear.coachId !== coachId) continue;
		if (best === undefined || orgYear.placement < best) best = orgYear.placement;
	}
	return best;
}

function matchesPlacementFormula(modifiers: CoachModifiers, salt: string): boolean {
	return [1, 2, 3, 5].some((placement) => {
		const derived = modifiersFromPlacement(placement, salt);
		return (
			derived.comeback === modifiers.comeback &&
			derived.economy === modifiers.economy &&
			derived.antistrat === modifiers.antistrat
		);
	});
}

/** Keep hand-tuned rows. Re-derive auto-filled (and zero) rows from best roster placement. */
export function fillCoachModifiers(
	coaches: readonly Coach[],
	orgYears: readonly Pick<OrgYear, "coachId" | "placement">[],
): Coach[] {
	return coaches.map((coach) => {
		const placement = bestCoachPlacement(coach.id, orgYears) ?? Number.POSITIVE_INFINITY;
		if (modifierTotal(coach.modifiers) > 0 && !matchesPlacementFormula(coach.modifiers, coach.id)) {
			return coach;
		}
		return { ...coach, modifiers: modifiersFromPlacement(placement, coach.id) };
	});
}
