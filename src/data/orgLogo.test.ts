import { describe, expect, it } from "vitest";
import { loadDataset } from "./index";
import { orgCrestTone, orgInitials, orgLogoSrc } from "./orgLogo";

describe("org crests", () => {
	it("gives every org an imported Liquipedia logo", () => {
		const dataset = loadDataset();
		const withoutLogo = dataset.orgs.filter((org) => !orgLogoSrc(org));
		expect(withoutLogo.map((org) => org.id)).toEqual([]);
		expect(orgLogoSrc({ logo: "/logos/navi.png" })).toBe("/logos/navi.png");
	});

	it("falls back to initials when an org has no logo file", () => {
		expect(orgLogoSrc({ logo: undefined })).toBeUndefined();
		expect(orgInitials("Natus Vincere")).toBe("NV");
		expect(orgInitials("Team Liquid")).toBe("LI");
		expect(orgInitials("GamerLegion")).toBe("GA");
	});

	it("is stable for a given org id", () => {
		expect(orgCrestTone("navi")).toEqual(orgCrestTone("navi"));
		expect(orgCrestTone("navi")).not.toEqual(orgCrestTone("faze"));
	});
});
