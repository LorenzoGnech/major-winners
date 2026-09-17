import { describe, expect, it } from "vitest";
import { loadDataset } from "./index";
import { majorInitials, majorLogoSrc } from "./majorLogo";

describe("major crests", () => {
	it("gives every Major an imported Liquipedia logo", () => {
		const dataset = loadDataset();
		const withoutLogo = dataset.majors.filter((major) => !majorLogoSrc(major));
		expect(withoutLogo.map((major) => major.id)).toEqual([]);
		expect(majorLogoSrc({ logo: "/logos/majors/ems-one-katowice-2014.jpg" })).toBe(
			"/logos/majors/ems-one-katowice-2014.jpg",
		);
	});

	it("falls back to initials when a Major has no logo file", () => {
		expect(majorLogoSrc({ logo: undefined })).toBeUndefined();
		expect(majorInitials("Katowice 2014")).toBe("KA");
		expect(majorInitials("Legacy wildcard")).toBe("LW");
		expect(majorInitials("IEM Cologne 2026")).toBe("IC");
	});
});
