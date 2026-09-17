import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import {
	FEATURED_CLUTCH_RATES,
	featuredClutchWindow,
	planFeaturedClutch,
	remainingRoundsInWindow,
	shouldShowFeaturedClutch,
} from "./clutch";
import type { HighlightEvent } from "./types";

describe("planFeaturedClutch", () => {
	it("never features past the per-map cap", () => {
		expect(planFeaturedClutch([1, 10, 20], 0, createRng(1), 24)).toEqual({ intent: "none" });
		expect(planFeaturedClutch([2, 11, 18, 22], 1, createRng(2), 26)).toEqual({
			intent: "none",
		});
	});

	it("blocks a second featured clutch in the same window", () => {
		expect(planFeaturedClutch([3], 0, createRng(1), 7)).toEqual({ intent: "none" });
		expect(planFeaturedClutch([12], 0, createRng(1), 15)).toEqual({ intent: "none" });
		expect(planFeaturedClutch([19], 0, createRng(1), 22)).toEqual({ intent: "none" });
	});

	it("only stages denials on 1v3 or larger so the clutcher can still frag", () => {
		for (let seed = 0; seed < 400; seed += 1) {
			const plan = planFeaturedClutch([], 1, createRng(seed), 8);
			if (plan.intent !== "none") expect(plan.against).toBeGreaterThanOrEqual(3);
		}
	});

	it("features only the player's side from the already-decided winner", () => {
		const won = planFeaturedClutch([], 0, createRng(3), 8);
		const lost = planFeaturedClutch([], 1, createRng(3), 8);
		expect(won.intent === "none" || won.intent === "win").toBe(true);
		expect(lost.intent === "none" || lost.intent === "lose").toBe(true);
		if (won.intent !== "none" && lost.intent !== "none") {
			expect(won.against).toBe(lost.against);
		}
	});

	it("does not favor the first round of a window", () => {
		const samples = 8_000;
		let first = 0;
		let last = 0;
		for (let seed = 0; seed < samples; seed += 1) {
			if (planFeaturedClutch([], 0, createRng(seed), 1).intent !== "none") first += 1;
			if (planFeaturedClutch([], 0, createRng(seed), 8).intent !== "none") last += 1;
		}
		expect(first / samples).toBeGreaterThan(0.06);
		expect(first / samples).toBeLessThan(0.16);
		expect(last / samples).toBeGreaterThan(first / samples);
	});

	it("offers 1v2 most often and 1v5 least, close to the published rates", () => {
		const counts = { 2: 0, 3: 0, 4: 0, 5: 0, none: 0 };
		const samples = 8_000;
		for (let seed = 0; seed < samples; seed += 1) {
			const plan = planFeaturedClutch([], 0, createRng(seed), 8);
			if (plan.intent === "none") counts.none += 1;
			else counts[plan.against] += 1;
		}
		expect(counts[5] / samples).toBeGreaterThan(FEATURED_CLUTCH_RATES[5] - 0.02);
		expect(counts[5] / samples).toBeLessThan(FEATURED_CLUTCH_RATES[5] + 0.02);
		expect(counts[2]).toBeGreaterThan(counts[4]);
		expect(counts[3]).toBeGreaterThan(counts[4]);
		expect(counts[4]).toBeGreaterThan(counts[5]);
		expect(counts.none).toBeGreaterThan(samples * 0.12);
	});
});

function sequence(round: number): HighlightEvent {
	return {
		type: "clutch-sequence",
		round,
		team: 0,
		playerId: "donk",
		against: 2,
		startKillIndex: 6,
		won: true,
	};
}

describe("shouldShowFeaturedClutch", () => {
	it("keeps only the first three sequences on a map", () => {
		const maps = [
			{ highlights: [sequence(3), sequence(10), sequence(18), sequence(22)] },
			{ highlights: [sequence(2)] },
		];
		expect(shouldShowFeaturedClutch(maps, 0, 3)).toBe(true);
		expect(shouldShowFeaturedClutch(maps, 0, 10)).toBe(true);
		expect(shouldShowFeaturedClutch(maps, 0, 18)).toBe(true);
		expect(shouldShowFeaturedClutch(maps, 0, 22)).toBe(false);
		expect(shouldShowFeaturedClutch(maps, 1, 2)).toBe(true);
	});
});

describe("featuredClutchWindow", () => {
	it("splits regulation into early, mid, and late thirds", () => {
		expect(featuredClutchWindow(1)).toBe(0);
		expect(featuredClutchWindow(8)).toBe(0);
		expect(featuredClutchWindow(9)).toBe(1);
		expect(featuredClutchWindow(16)).toBe(1);
		expect(featuredClutchWindow(17)).toBe(2);
		expect(featuredClutchWindow(30)).toBe(2);
	});
});

describe("remainingRoundsInWindow", () => {
	it("counts down inside each stretch, then holds a modest overtime leftover", () => {
		expect(remainingRoundsInWindow(1)).toBe(8);
		expect(remainingRoundsInWindow(8)).toBe(1);
		expect(remainingRoundsInWindow(9)).toBe(8);
		expect(remainingRoundsInWindow(16)).toBe(1);
		expect(remainingRoundsInWindow(17)).toBe(8);
		expect(remainingRoundsInWindow(24)).toBe(1);
		expect(remainingRoundsInWindow(25)).toBe(6);
	});
});
