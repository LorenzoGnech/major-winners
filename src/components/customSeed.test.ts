import { describe, expect, it } from "vitest";
import { parseCustomSeed } from "./customSeed";

describe("parseCustomSeed", () => {
	it("keeps uint32 values numeric", () => {
		expect(parseCustomSeed("0")).toBe(0);
		expect(parseCustomSeed("  42 ")).toBe(42);
		expect(parseCustomSeed("4294967295")).toBe(4294967295);
	});

	it("hashes oversized numbers and share codes as strings", () => {
		expect(parseCustomSeed("4294967296")).toBe("4294967296");
		expect(parseCustomSeed("my-share-code")).toBe("my-share-code");
	});

	it("rejects empty and oversized seeds", () => {
		expect(parseCustomSeed("")).toBeNull();
		expect(parseCustomSeed("   ")).toBeNull();
		expect(parseCustomSeed("x".repeat(65))).toBeNull();
	});
});
