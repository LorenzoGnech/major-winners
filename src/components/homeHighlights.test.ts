import { describe, expect, it } from "vitest";
import {
	firstPlayableHighlightIndex,
	HOME_HIGHLIGHTS,
	nextHighlightIndex,
	nextPlayableHighlightIndex,
	randomHighlightStart,
	remainingToSwap,
	shouldPlayHighlights,
} from "./homeHighlights";

describe("HOME_HIGHLIGHTS", () => {
	it("lists the six committed home clips in order", () => {
		expect(HOME_HIGHLIGHTS).toEqual([
			"/home/video1.mp4",
			"/home/video2.mp4",
			"/home/video3.mp4",
			"/home/video4.mp4",
			"/home/video5.mp4",
			"/home/video6.mp4",
		]);
	});
});

describe("randomHighlightStart", () => {
	it("maps a unit pick into a clip index", () => {
		expect(randomHighlightStart(6, () => 0)).toBe(0);
		expect(randomHighlightStart(6, () => 0.5)).toBe(3);
		expect(randomHighlightStart(6, () => 0.999)).toBe(5);
		expect(randomHighlightStart(0, () => 0.4)).toBe(0);
	});
});

describe("nextHighlightIndex", () => {
	it("advances and wraps the playlist", () => {
		expect(nextHighlightIndex(0, 6)).toBe(1);
		expect(nextHighlightIndex(5, 6)).toBe(0);
		expect(nextHighlightIndex(0, 1)).toBe(0);
		expect(nextHighlightIndex(0, 0)).toBe(0);
	});
});

describe("playable highlight indexes", () => {
	it("starts at the first non-failed clip", () => {
		expect(firstPlayableHighlightIndex(0, 3)).toBe(0);
		expect(firstPlayableHighlightIndex(0, 3, new Set([0]))).toBe(1);
		expect(firstPlayableHighlightIndex(2, 3, new Set([2]))).toBe(0);
		expect(firstPlayableHighlightIndex(0, 3, new Set([0, 1, 2]))).toBeNull();
	});

	it("skips failed clips when wrapping", () => {
		expect(nextPlayableHighlightIndex(2, 3)).toBe(0);
		expect(nextPlayableHighlightIndex(0, 3, new Set([1]))).toBe(2);
		expect(nextPlayableHighlightIndex(1, 3, new Set([2, 0]))).toBe(1);
		expect(nextPlayableHighlightIndex(0, 0)).toBeNull();
	});
});

describe("shouldPlayHighlights", () => {
	it("requires motion and at least one clip", () => {
		expect(shouldPlayHighlights(false, 6)).toBe(true);
		expect(shouldPlayHighlights(true, 6)).toBe(false);
		expect(shouldPlayHighlights(false, 0)).toBe(false);
	});
});

describe("remainingToSwap", () => {
	it("is true only near the end of a known duration", () => {
		expect(remainingToSwap(10, 9.9)).toBe(true);
		expect(remainingToSwap(10, 9)).toBe(false);
		expect(remainingToSwap(Number.NaN, 1)).toBe(false);
		expect(remainingToSwap(0, 0)).toBe(false);
	});
});
