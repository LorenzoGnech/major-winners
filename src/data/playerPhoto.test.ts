import { describe, expect, it } from "vitest";
import { playerCrestTone, playerInitials, playerPhotoSrc } from "./playerPhoto";

describe("player photos", () => {
	it("returns the committed stats headshot path when present", () => {
		expect(playerPhotoSrc({ photo: "/photos/players/s1mple/2018.jpg" })).toBe(
			"/photos/players/s1mple/2018.jpg",
		);
	});

	it("falls back to initials when a season has no photo file", () => {
		expect(playerPhotoSrc({ photo: undefined })).toBeUndefined();
		expect(playerInitials("s1mple")).toBe("S1");
		expect(playerInitials("device")).toBe("DE");
		expect(playerInitials("NiKo")).toBe("NI");
	});

	it("is stable for a given player id", () => {
		expect(playerCrestTone("s1mple")).toEqual(playerCrestTone("s1mple"));
		expect(playerCrestTone("s1mple")).not.toEqual(playerCrestTone("zywoo"));
	});
});
