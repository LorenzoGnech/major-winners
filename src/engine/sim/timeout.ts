import { clamp } from "../math";
import type { TeamProfile } from "../team";
import { chooseBuy } from "./economy";
import { applyGamePlan, resolveGamePlan } from "./gamePlan";
import { applyTimeoutMorale, trailingStreak } from "./morale";
import type { BuyType, LiveMapState, RoundPhase } from "./types";

export const TIMEOUT_CALL_THRESHOLD = 54;

export type TimeoutCallContext = {
	score: readonly [number, number];
	phase: RoundPhase;
	upcomingRound: number;
	winners: readonly (0 | 1)[];
	morale: number;
	ourBuy: BuyType;
	theirBuy: BuyType;
	pistol: boolean;
	coachJudgment: number;
};

export function coachTimeoutJudgment(team: TeamProfile): number {
	const coaching = team.details.coaching;
	return clamp(coaching.score * 0.7 + coaching.comebackResilience * 0.3, 0, 100);
}

function coachBlend(judgment: number): number {
	return clamp((judgment - 20) / 60, 0, 1);
}

function lossStreak(winners: readonly (0 | 1)[]): number {
	const streak = trailingStreak(winners, 0);
	return streak.won ? 0 : streak.length;
}

function expertValue(ctx: TimeoutCallContext): number {
	let value = 0;
	const deficit = ctx.score[1] - ctx.score[0];
	const losses = lossStreak(ctx.winners);

	if (losses >= 2) value += 16 + (losses - 2) * 11;
	else if (losses === 1) value += 3;

	if (deficit >= 2) value += Math.min(22, deficit * 5);
	else if (deficit <= -3) value -= 28;
	else if (deficit <= -1) value -= 10;

	if (ctx.ourBuy === "full-buy" && ctx.theirBuy === "full-buy") value += 18;
	else if (ctx.ourBuy === "force" && ctx.theirBuy === "full-buy") value += 10;
	else if (ctx.ourBuy === "eco" || ctx.ourBuy === "pistol") value -= 16;
	else if (ctx.theirBuy === "eco") value -= 10;

	if (ctx.score[0] >= 10 || ctx.score[1] >= 10) value += 10;
	if (ctx.score[1] >= 11 && ctx.score[0] < ctx.score[1]) value += 12;
	if (ctx.phase === "overtime") value += 14;

	if (ctx.morale < 38) value += 10;
	else if (ctx.morale > 72 && deficit < 2) value -= 8;

	if (ctx.upcomingRound <= 4 && deficit < 3) value -= 18;
	if (ctx.upcomingRound === 14 && losses < 3) value -= 6;

	return value;
}

function noviceValue(ctx: TimeoutCallContext): number {
	let value = 0;
	const deficit = ctx.score[1] - ctx.score[0];
	const losses = lossStreak(ctx.winners);

	if (losses >= 1) value += 20 + losses * 8;
	if (deficit >= 1) value += 16;
	if (ctx.upcomingRound <= 6) value += 12;
	if (ctx.morale < 50) value += 6;
	if (ctx.phase === "overtime") value += 4;
	if (ctx.ourBuy === "full-buy") value += 4;
	if (ctx.ourBuy === "eco") value += 12;
	return value;
}

function lateness(ctx: TimeoutCallContext): number {
	if (ctx.phase === "overtime") return 22;
	const leader = Math.max(ctx.score[0], ctx.score[1]);
	if (leader >= 11) return 18;
	if (ctx.upcomingRound >= 20) return 16;
	if (ctx.upcomingRound >= 13) return 8;
	return 0;
}

export function timeoutCallValue(ctx: TimeoutCallContext): number {
	const blend = coachBlend(ctx.coachJudgment);
	return noviceValue(ctx) * (1 - blend) + expertValue(ctx) * blend + lateness(ctx);
}

export function shouldCallTimeout(ctx: TimeoutCallContext): boolean {
	if (ctx.pistol || ctx.upcomingRound <= 1) return false;
	if (ctx.score[0] >= 13 || ctx.score[1] >= 13) return false;
	return timeoutCallValue(ctx) >= TIMEOUT_CALL_THRESHOLD;
}

export function timeoutContextFromMap(
	current: LiveMapState,
	teams: readonly [TeamProfile, TeamProfile],
): TimeoutCallContext {
	const upcomingRound = current.rounds.length + 1;
	const pistol = current.phase === "regulation" && (upcomingRound === 1 || upcomingRound === 13);
	const planned = applyGamePlan(teams[0], resolveGamePlan(current.gamePlan));
	const ourBuy = chooseBuy(current.economies[0], {
		pistol,
		economyDiscipline: planned.details.coaching.economyDiscipline,
	});
	const theirBuy = chooseBuy(current.economies[1], {
		pistol,
		economyDiscipline: teams[1].details.coaching.economyDiscipline,
	});
	return {
		score: current.score,
		phase: current.phase,
		upcomingRound,
		winners: current.rounds.map((round) => round.winner),
		morale: current.morale[0],
		ourBuy,
		theirBuy,
		pistol,
		coachJudgment: coachTimeoutJudgment(teams[0]),
	};
}

export function maybeQueueAutoTimeout(
	current: LiveMapState,
	teams: readonly [TeamProfile, TeamProfile],
): LiveMapState {
	if (current.complete || current.pendingTimeout || current.timeoutsRemaining <= 0) {
		return current;
	}
	if (!shouldCallTimeout(timeoutContextFromMap(current, teams))) return current;
	return {
		...current,
		pendingTimeout: true,
		timeoutsRemaining: current.timeoutsRemaining - 1,
		morale: applyTimeoutMorale(current.morale, 0),
	};
}
