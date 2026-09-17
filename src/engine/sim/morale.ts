import { clamp } from "../math";
import type { TeamProfile } from "../team";

export function initialMorale(team: TeamProfile): number {
	return clamp(
		50 +
			(team.details.chemistry.score - 50) * 0.25 +
			(team.details.coaching.comebackResilience - 50) * 0.2,
		0,
		100,
	);
}

export function decayMorale(current: number): number {
	return clamp(current + (50 - current) * 0.2, 0, 100);
}

export function bumpMorale(current: number, delta: number): number {
	return clamp(current + delta, 0, 100);
}
