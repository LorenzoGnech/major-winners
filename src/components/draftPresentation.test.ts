import { describe, expect, it } from "vitest";
import {
	flagEmoji,
	heatColor,
	heatT,
	ovrTone,
	playerCardStats,
	playerPanelTone,
} from "./draftPresentation";

function hue(color: string): number {
	const match = color.match(/^hsl\(([0-9.]+) /);
	return Number(match?.[1]);
}

describe("draft board presentation", () => {
	it("is stable for a given player id and differs across players", () => {
		expect(playerPanelTone("device")).toEqual(playerPanelTone("device"));
		expect(playerPanelTone("device")).not.toEqual(playerPanelTone("karrigan"));
	});

	it("maps the pool band from red through amber to green", () => {
		expect(heatT(0.93, { lo: 0.93, hi: 1.16 })).toBe(0);
		expect(heatT(1.16, { lo: 0.93, hi: 1.16 })).toBe(1);
		expect(heatT(0.71, { lo: 0.61, hi: 0.71, invert: true })).toBe(0);
		expect(heatT(0.61, { lo: 0.61, hi: 0.71, invert: true })).toBe(1);
		expect(hue(heatColor(0))).toBeLessThan(hue(heatColor(0.5)));
		expect(hue(heatColor(0.5))).toBeLessThan(hue(heatColor(1)));
		expect(hue(ovrTone(90))).toBeGreaterThan(hue(ovrTone(70)));
		expect(hue(ovrTone(70))).toBeGreaterThan(hue(ovrTone(55)));
	});

	it("splits KPR and DPR and only lists HLTV extras that exist", () => {
		expect(
			playerCardStats(
				{
					stats: {
						rating: 1.33,
						ratingVersion: "2.0",
						kpr: 0.84,
						dpr: 0.58,
						adr: 88.2,
						kast: 74,
						impact: 1.42,
					},
				},
				{ aim: 90, clutch: 80 },
			).map(({ label, value }) => [label, value]),
		).toEqual([
			["Rating", "1.33"],
			["KPR", "0.84"],
			["DPR", "0.58"],
			["ADR", "88.2"],
			["KAST", "74%"],
			["Impact", "1.42"],
		]);
		expect(
			playerCardStats(
				{ stats: { rating: 1.05, ratingVersion: "1.0", kpr: 0.71, dpr: 0.66 } },
				{ aim: 70, clutch: 70 },
			).map(({ label, value }) => [label, value]),
		).toEqual([
			["Rating", "1.05"],
			["KPR", "0.71"],
			["DPR", "0.66"],
		]);
		expect(
			playerCardStats({ stats: undefined }, { aim: 82, clutch: 77 }).map(({ label, value }) => [
				label,
				value,
			]),
		).toEqual([
			["Aim", "82"],
			["Clutch", "77"],
		]);
	});

	it("colors each stat on its own pool scale, not the card OVR", () => {
		const rows = playerCardStats(
			{
				stats: {
					rating: 1.2,
					ratingVersion: "2.0",
					kpr: 0.6,
					dpr: 0.7,
					adr: 80,
					kast: 68,
					impact: 1.18,
				},
			},
			{ aim: 70, clutch: 70 },
		);
		const byLabel = Object.fromEntries(rows.map((row) => [row.label, hue(row.color)]));
		expect(byLabel.Rating).toBeGreaterThan(byLabel.KPR);
		expect(byLabel.DPR).toBeLessThan(byLabel.ADR);
		expect(byLabel.Impact).toBeGreaterThan(byLabel.KAST);
	});

	it("turns ISO country codes into flags and leaves unknown values alone", () => {
		expect(flagEmoji("DK")).toBe("🇩🇰");
		expect(flagEmoji("us")).toBe("🇺🇸");
		expect(flagEmoji("UKR")).toBe("UKR");
	});
});
