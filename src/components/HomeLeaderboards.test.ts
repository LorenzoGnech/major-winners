import { describe, expect, it } from "vitest";
import { formatSavedAt } from "./HomeLeaderboards";

describe("formatSavedAt", () => {
	it("renders a UTC calendar date", () => {
		expect(formatSavedAt("2026-09-18T15:41:00.000Z")).toBe("18 Sep 2026");
		expect(formatSavedAt("not-a-date")).toBe("");
	});
});
