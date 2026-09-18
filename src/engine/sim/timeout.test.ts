import { describe, expect, it } from "vitest";
import {
	shouldCallTimeout,
	TIMEOUT_CALL_THRESHOLD,
	type TimeoutCallContext,
	timeoutCallValue,
} from "./timeout";

function context(overrides: Partial<TimeoutCallContext> = {}): TimeoutCallContext {
	return {
		score: [4, 7],
		phase: "regulation",
		upcomingRound: 12,
		winners: [1, 1, 1],
		morale: 36,
		ourBuy: "full-buy",
		theirBuy: "full-buy",
		pistol: false,
		coachJudgment: 75,
		...overrides,
	};
}

describe("shouldCallTimeout", () => {
	it("never calls on a pistol or the opening round", () => {
		expect(shouldCallTimeout(context({ pistol: true, upcomingRound: 13 }))).toBe(false);
		expect(shouldCallTimeout(context({ upcomingRound: 1, pistol: false }))).toBe(false);
	});

	it("lets a strong coach take a trailing rifle streak", () => {
		const strong = context({ coachJudgment: 80 });
		expect(timeoutCallValue(strong)).toBeGreaterThanOrEqual(TIMEOUT_CALL_THRESHOLD);
		expect(shouldCallTimeout(strong)).toBe(true);
	});

	it("saves a strong coach's timeout after a single early loss", () => {
		const early = context({
			score: [0, 1],
			upcomingRound: 2,
			winners: [1],
			morale: 48,
			ourBuy: "force",
			theirBuy: "full-buy",
			coachJudgment: 80,
		});
		expect(shouldCallTimeout(early)).toBe(false);
	});

	it("lets a weak coach panic earlier than a strong one", () => {
		const shaky = context({
			score: [3, 4],
			upcomingRound: 8,
			winners: [1, 1],
			morale: 44,
			ourBuy: "eco",
			theirBuy: "full-buy",
			coachJudgment: 28,
		});
		const strong = { ...shaky, coachJudgment: 82 };
		expect(shouldCallTimeout(shaky)).toBe(true);
		expect(shouldCallTimeout(strong)).toBe(false);
		expect(timeoutCallValue(shaky)).toBeGreaterThan(timeoutCallValue(strong));
	});

	it("does not waste a strong coach timeout while comfortably ahead", () => {
		expect(
			shouldCallTimeout(
				context({
					score: [9, 4],
					upcomingRound: 14,
					winners: [0, 0, 1],
					morale: 74,
					coachJudgment: 80,
				}),
			),
		).toBe(false);
	});
});
