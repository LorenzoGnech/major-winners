import { describe, expect, it } from "vitest";
import { parseInfoboxRoles } from "./liquipediaRole";

describe("parseInfoboxRoles", () => {
	it("maps AWPer and in-game leader", () => {
		expect(parseInfoboxRoles("|role=AWPer").tags).toEqual({ awp: true });
		expect(parseInfoboxRoles("|role=In-game leader").tags).toEqual({ igl: true });
		expect(parseInfoboxRoles("|role=Rifler").tags).toEqual({ rifle: true });
	});

	it("accepts combined role lines", () => {
		expect(parseInfoboxRoles("|role=AWPer, In-game leader").tags).toEqual({ awp: true, igl: true });
	});

	it("ignores missing or unknown roles", () => {
		expect(parseInfoboxRoles("|nationality=Denmark").tags).toEqual({});
		expect(parseInfoboxRoles("|role=Coach").tags).toEqual({});
	});
});
