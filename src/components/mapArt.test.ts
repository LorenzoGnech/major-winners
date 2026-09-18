import { describe, expect, it } from "vitest";
import { preloadMapArt } from "./mapArt";

describe("preloadMapArt", () => {
	it("is a no-op in Node where Image is undefined", () => {
		expect(() => preloadMapArt(["/maps/mirage.webp", "/maps/mirage.webp", ""])).not.toThrow();
	});
});
