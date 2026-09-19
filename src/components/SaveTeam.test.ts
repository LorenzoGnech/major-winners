import { describe, expect, it } from "vitest";
import { DEFAULT_AUTHOR_NAME } from "../community";
import { saveAuthorHint } from "./SaveTeam";

describe("saveAuthorHint", () => {
	it("uses the profile username when signed in", () => {
		expect(saveAuthorHint(true, "lore")).toBe("Saves as lore.");
	});

	it("points signed-in players without a username at their profile", () => {
		expect(saveAuthorHint(true, DEFAULT_AUTHOR_NAME)).toBe(
			`Saves as ${DEFAULT_AUTHOR_NAME}. Pick a username on your profile to attach your name.`,
		);
	});

	it("keeps anonymous saves available without a session", () => {
		expect(saveAuthorHint(false, DEFAULT_AUTHOR_NAME)).toBe(
			`Saves as ${DEFAULT_AUTHOR_NAME}. Sign in from Home to use your username.`,
		);
	});
});
