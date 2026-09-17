import { clamp } from "../math";
import type { TeamProfile } from "../team";

export const TIMEOUT_MORALE = 10;
export const WIN_MORALE = 4;
export const LOSS_MORALE = 5;
export const WIN_STREAK_STEP = 3;
export const LOSS_STREAK_STEP = 3.5;
export const STREAK_CAP = 6;
export const CLUTCH_CONVERT = 8;
export const CLUTCH_DENY = 7;
export const CLUTCH_AGAINST_STEP = 3;
export const CLUTCH_RIVAL_SHARE = 0.5;

export type MoraleClutch = {
	team: 0 | 1;
	against: 2 | 3 | 4 | 5;
	won: boolean;
};

export function initialMorale(team: TeamProfile): number {
	return clamp(
		50 +
			(team.details.chemistry.score - 50) * 0.25 +
			(team.details.coaching.comebackResilience - 50) * 0.2,
		0,
		100,
	);
}

export function bumpMorale(current: number, delta: number): number {
	return clamp(current + delta, 0, 100);
}

export function trailingStreak(
	winners: readonly (0 | 1)[],
	team: 0 | 1,
): { won: boolean; length: number } {
	if (winners.length === 0) return { won: true, length: 0 };
	const won = winners[winners.length - 1] === team;
	let length = 0;
	for (let index = winners.length - 1; index >= 0; index -= 1) {
		if ((winners[index] === team) !== won) break;
		length += 1;
	}
	return { won, length };
}

export function streakMoraleDelta(won: boolean, streakLength: number): number {
	const length = Math.min(STREAK_CAP, Math.max(1, streakLength));
	if (won) return WIN_MORALE + (length - 1) * WIN_STREAK_STEP;
	return -(LOSS_MORALE + (length - 1) * LOSS_STREAK_STEP);
}

export function clutchMoraleDelta(against: 2 | 3 | 4 | 5, converted: boolean): number {
	const extra = (against - 2) * CLUTCH_AGAINST_STEP;
	return converted ? CLUTCH_CONVERT + extra : -(CLUTCH_DENY + extra);
}

export function applyTimeoutMorale(
	morale: readonly [number, number],
	team: 0 | 1 | undefined,
): [number, number] {
	if (team === undefined) return [morale[0], morale[1]];
	const next: [number, number] = [morale[0], morale[1]];
	next[team] = bumpMorale(next[team], TIMEOUT_MORALE);
	return next;
}

function other(team: 0 | 1): 0 | 1 {
	return team === 0 ? 1 : 0;
}

function winScale(team: TeamProfile | undefined): number {
	if (!team) return 1;
	return clamp(1 + (team.details.chemistry.score - 50) * 0.004, 0.8, 1.2);
}

function lossScale(team: TeamProfile | undefined): number {
	if (!team) return 1;
	return clamp(1 - (team.details.coaching.comebackResilience - 50) * 0.005, 0.75, 1.25);
}

export function resolveRoundMorale(input: {
	morale: readonly [number, number];
	winner: 0 | 1;
	priorWinners: readonly (0 | 1)[];
	clutches?: readonly MoraleClutch[];
	teams?: readonly [TeamProfile, TeamProfile];
}): [number, number] {
	const winners = [...input.priorWinners, input.winner];
	const next: [number, number] = [input.morale[0], input.morale[1]];
	for (const team of [0, 1] as const) {
		const streak = trailingStreak(winners, team);
		const profile = input.teams?.[team];
		const scale = streak.won ? winScale(profile) : lossScale(profile);
		next[team] = bumpMorale(next[team], streakMoraleDelta(streak.won, streak.length) * scale);
	}
	for (const clutch of input.clutches ?? []) {
		const delta = clutchMoraleDelta(clutch.against, clutch.won);
		next[clutch.team] = bumpMorale(next[clutch.team], delta);
		next[other(clutch.team)] = bumpMorale(next[other(clutch.team)], -delta * CLUTCH_RIVAL_SHARE);
	}
	return next;
}
