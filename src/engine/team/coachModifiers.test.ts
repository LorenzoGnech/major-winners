import { describe, expect, it } from "vitest";
import type { Coach } from "../../data/schema";
import {
	bestCoachPlacement,
	fillCoachModifiers,
	modifiersFromPlacement,
	modifiersFromPoints,
	modifierTotal,
	placementModifierPoints,
} from "./coachModifiers";

const zonic: Coach = {
	id: "zonic-2018",
	nick: "zonic",
	realName: "Danny Sørensen",
	nationality: "DK",
	year: 2018,
	orgId: "astralis",
	modifiers: { comeback: 2, economy: 2, antistrat: 2 },
};

const blank: Coach = {
	id: "blank-2018-navi",
	nick: "blank",
	realName: "blank",
	nationality: "UA",
	year: 2018,
	orgId: "navi",
	modifiers: { comeback: 0, economy: 0, antistrat: 0 },
};

describe("placementModifierPoints", () => {
	it("gives every finish at least two bonus points", () => {
		expect(placementModifierPoints(1)).toBe(5);
		expect(placementModifierPoints(2)).toBe(4);
		expect(placementModifierPoints(3)).toBe(3);
		expect(placementModifierPoints(4)).toBe(3);
		expect(placementModifierPoints(5)).toBe(3);
		expect(placementModifierPoints(8)).toBe(3);
		expect(placementModifierPoints(9)).toBe(2);
		expect(placementModifierPoints(32)).toBe(2);
	});
});

describe("modifiersFromPlacement", () => {
	it("spreads champion points without exceeding 2 per axis", () => {
		const modifiers = modifiersFromPlacement(1, "champion");
		expect(modifierTotal(modifiers)).toBe(5);
		expect(
			Math.max(modifiers.comeback, modifiers.economy, modifiers.antistrat),
		).toBeLessThanOrEqual(2);
		expect(
			Math.min(modifiers.comeback, modifiers.economy, modifiers.antistrat),
		).toBeGreaterThanOrEqual(1);
	});

	it("always grants at least two points, even for a field-floor finish", () => {
		const modifiers = modifiersFromPlacement(24, "cult-coach");
		expect(modifierTotal(modifiers)).toBe(2);
		expect(
			[modifiers.comeback, modifiers.economy, modifiers.antistrat].filter((value) => value === 1),
		).toHaveLength(2);
	});

	it("is stable for a coach id and can rotate the leftover axis", () => {
		expect(modifiersFromPlacement(16, "alpha")).toEqual(modifiersFromPlacement(16, "alpha"));
		const leftoverAxes = new Set(
			["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].map((salt) => {
				const modifiers = modifiersFromPlacement(16, salt);
				return `${modifiers.comeback}:${modifiers.economy}:${modifiers.antistrat}`;
			}),
		);
		expect(leftoverAxes.size).toBeGreaterThan(1);
	});
});

describe("fillCoachModifiers", () => {
	it("keeps hand-tuned positives and fills zeros from best placement", () => {
		const filled = fillCoachModifiers(
			[zonic, blank],
			[
				{ coachId: zonic.id, placement: 1 },
				{ coachId: blank.id, placement: 5 },
				{ coachId: blank.id, placement: 12 },
			],
		);
		expect(filled[0]?.modifiers).toEqual(zonic.modifiers);
		expect(filled[1]?.modifiers).toEqual(modifiersFromPlacement(5, blank.id));
		expect(bestCoachPlacement(blank.id, [{ coachId: blank.id, placement: 12 }])).toBe(12);
	});

	it("re-derives auto-filled modifiers when the roster placement changes", () => {
		const stale: Coach = {
			...blank,
			modifiers: modifiersFromPlacement(3, blank.id),
		};
		const filled = fillCoachModifiers([stale, zonic], [{ coachId: stale.id, placement: 12 }]);
		expect(filled[0]?.modifiers).toEqual(modifiersFromPlacement(12, stale.id));
		expect(filled[1]?.modifiers).toEqual(zonic.modifiers);
	});

	it("re-derives pre-baseline one-point rows instead of treating them as hand-tuned", () => {
		const stale: Coach = {
			...blank,
			modifiers: modifiersFromPoints(1, blank.id),
		};
		const filled = fillCoachModifiers([stale, zonic], [{ coachId: stale.id, placement: 16 }]);
		expect(filled[0]?.modifiers).toEqual(modifiersFromPlacement(16, stale.id));
		expect(modifierTotal(filled[0]?.modifiers ?? stale.modifiers)).toBe(2);
		expect(filled[1]?.modifiers).toEqual(zonic.modifiers);
	});
});
