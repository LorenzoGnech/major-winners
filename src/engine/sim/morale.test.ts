import { describe, expect, it } from "vitest";
import {
	applyTimeoutMorale,
	clutchMoraleDelta,
	LOSS_MORALE,
	resolveRoundMorale,
	streakMoraleDelta,
	TIMEOUT_MORALE,
	trailingStreak,
	WIN_MORALE,
} from "./morale";

describe("trailingStreak", () => {
	it("counts consecutive wins or losses including this round", () => {
		expect(trailingStreak([0, 0, 1, 1, 1], 1)).toEqual({ won: true, length: 3 });
		expect(trailingStreak([0, 0, 1, 1, 1], 0)).toEqual({ won: false, length: 3 });
		expect(trailingStreak([1], 0)).toEqual({ won: false, length: 1 });
		expect(trailingStreak([], 0)).toEqual({ won: true, length: 0 });
	});
});

describe("streakMoraleDelta", () => {
	it("drops harder on each consecutive loss and grows harder on each consecutive win", () => {
		expect(streakMoraleDelta(false, 1)).toBe(-LOSS_MORALE);
		expect(streakMoraleDelta(false, 2)).toBeLessThan(streakMoraleDelta(false, 1));
		expect(streakMoraleDelta(false, 4)).toBeLessThan(streakMoraleDelta(false, 2));
		expect(streakMoraleDelta(true, 1)).toBe(WIN_MORALE);
		expect(streakMoraleDelta(true, 2)).toBeGreaterThan(streakMoraleDelta(true, 1));
		expect(streakMoraleDelta(true, 4)).toBeGreaterThan(streakMoraleDelta(true, 2));
	});
});

describe("resolveRoundMorale", () => {
	it("recovers on a win after losses and snowballs a win streak", () => {
		const afterLosses = resolveRoundMorale({
			morale: [60, 60],
			winner: 1,
			priorWinners: [1, 1],
		});
		expect(afterLosses[0]).toBeLessThan(60);
		const recovered = resolveRoundMorale({
			morale: afterLosses,
			winner: 0,
			priorWinners: [1, 1, 1],
		});
		expect(recovered[0]).toBeGreaterThan(afterLosses[0]);
		const streak = resolveRoundMorale({
			morale: recovered,
			winner: 0,
			priorWinners: [1, 1, 1, 0],
		});
		const third = resolveRoundMorale({
			morale: streak,
			winner: 0,
			priorWinners: [1, 1, 1, 0, 0],
		});
		expect(streak[0] - recovered[0]).toBeGreaterThan(recovered[0] - afterLosses[0]);
		expect(third[0] - streak[0]).toBeGreaterThan(streak[0] - recovered[0]);
	});

	it("moves more on a clutch than on a standard round", () => {
		const standard = resolveRoundMorale({
			morale: [50, 50],
			winner: 0,
			priorWinners: [],
		});
		const clutched = resolveRoundMorale({
			morale: [50, 50],
			winner: 0,
			priorWinners: [],
			clutches: [{ team: 0, against: 3, won: true }],
		});
		expect(clutched[0] - 50).toBeGreaterThan(standard[0] - 50);
		expect(clutched[0] - standard[0]).toBe(clutchMoraleDelta(3, true));
		const denied = resolveRoundMorale({
			morale: [50, 50],
			winner: 1,
			priorWinners: [],
			clutches: [{ team: 0, against: 3, won: false }],
		});
		const standardLoss = resolveRoundMorale({
			morale: [50, 50],
			winner: 1,
			priorWinners: [],
		});
		expect(denied[0]).toBeLessThan(standardLoss[0]);
	});

	it("applies a timeout bump when the timeout is called", () => {
		expect(applyTimeoutMorale([40, 50], 0)).toEqual([40 + TIMEOUT_MORALE, 50]);
		expect(applyTimeoutMorale([40, 50], undefined)).toEqual([40, 50]);
	});
});
