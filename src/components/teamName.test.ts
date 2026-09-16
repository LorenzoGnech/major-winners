import { describe, expect, it } from "vitest";
import { parseTeamName } from "./teamName";

describe("parseTeamName", () => {
	it("trims and collapses whitespace", () => {
		expect(parseTeamName("  Copenhagen   Flames ")).toBe("Copenhagen Flames");
	});

	it("rejects empty and oversized names", () => {
		expect(parseTeamName("")).toBeNull();
		expect(parseTeamName("   ")).toBeNull();
		expect(parseTeamName("x".repeat(33))).toBeNull();
	});
});
