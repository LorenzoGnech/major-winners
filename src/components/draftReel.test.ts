import { describe, expect, it } from "vitest";
import {
	buildReelStrip,
	LEGACY_MAJOR_LOGO,
	LEGACY_MAJOR_REEL_ID,
	majorReelPool,
	orgAppearanceReelPool,
	reelLoops,
	teamReelPool,
	teamReelSubtitle,
	visibleLabel,
	winnerMajorItem,
	winnerMajorReelId,
	withWinner,
} from "./draftReel";

const majors = [
	{ id: "katowice-2014", shortName: "Katowice 2014", location: "Katowice, Poland", year: 2014 },
	{ id: "cologne-2015", shortName: "Cologne 2015", location: "Cologne, Germany", year: 2015 },
	{ id: "atlanta-2017", shortName: "Atlanta 2017", location: "Atlanta, USA", year: 2017 },
] as const;

const orgs = new Map([
	["fnatic", { id: "fnatic", name: "fnatic" }],
	["navi", { id: "navi", name: "Natus Vincere" }],
	["sk", { id: "sk", name: "SK Gaming" }],
]);

const orgYears = [
	{
		id: "fnatic-cologne-2015",
		kind: "major" as const,
		majorId: "cologne-2015",
		orgId: "fnatic",
		year: 2015,
		tier: "legendary" as const,
		placement: 1,
	},
	{
		id: "navi-cologne-2015",
		kind: "major" as const,
		majorId: "cologne-2015",
		orgId: "navi",
		year: 2015,
		tier: "strong" as const,
		placement: 5,
	},
	{
		id: "fnatic-atlanta-2017",
		kind: "major" as const,
		majorId: "atlanta-2017",
		orgId: "fnatic",
		year: 2017,
		tier: "strong" as const,
		placement: 3,
	},
	{
		id: "sk-2003",
		kind: "legacy" as const,
		orgId: "sk",
		year: 2003,
		tier: "legendary" as const,
		placement: 1,
	},
];

describe("majorReelPool", () => {
	it("lists every Major then a Legacy wildcard", () => {
		const pool = majorReelPool(majors);
		expect(pool.map((item) => item.id)).toEqual([
			"katowice-2014",
			"cologne-2015",
			"atlanta-2017",
			LEGACY_MAJOR_REEL_ID,
		]);
		expect(pool.at(-1)).toMatchObject({
			title: "Legacy wildcard",
			logo: LEGACY_MAJOR_LOGO,
		});
	});
});

describe("winnerMajorReelId", () => {
	it("uses the synthetic Legacy id when the card has no Major", () => {
		expect(winnerMajorReelId("cologne-2015")).toBe("cologne-2015");
		expect(winnerMajorReelId(null)).toBe(LEGACY_MAJOR_REEL_ID);
		expect(winnerMajorItem(majors, null)).toMatchObject({
			title: "Legacy wildcard",
			logo: LEGACY_MAJOR_LOGO,
		});
	});
});

describe("teamReelPool", () => {
	it("keeps only that Major's rosters, ordered by placement", () => {
		const pool = teamReelPool(orgYears, orgs, "cologne-2015");
		expect(pool.map((item) => item.id)).toEqual(["fnatic-cologne-2015", "navi-cologne-2015"]);
		expect(pool[0]).toMatchObject({ name: "fnatic", year: 2015 });
	});

	it("uses Legacy-kind rosters when the card is a wildcard", () => {
		const pool = teamReelPool(orgYears, orgs, null);
		expect(pool).toEqual([
			expect.objectContaining({ id: "sk-2003", name: "SK Gaming", year: 2003 }),
		]);
	});
});

describe("orgAppearanceReelPool", () => {
	it("lists that org's Major appearances in year order", () => {
		const pool = orgAppearanceReelPool(orgYears, orgs, "fnatic");
		expect(pool.map((item) => item.id)).toEqual(["fnatic-cologne-2015", "fnatic-atlanta-2017"]);
	});
});

describe("buildReelStrip", () => {
	it("ends on the winner after several full passes", () => {
		const pool = majorReelPool(majors);
		const strip = buildReelStrip(pool, "cologne-2015", 3);
		expect(strip.at(-1)?.id).toBe("cologne-2015");
		expect(strip.length).toBeGreaterThan(pool.length * 3);
		expect(strip.filter((item) => item.id === "cologne-2015").length).toBeGreaterThan(1);
	});

	it("still travels when the pool is a single team", () => {
		const pool = [{ id: "only", name: "Only" }];
		const strip = buildReelStrip(pool, "only", 4);
		expect(strip).toHaveLength(4);
		expect(strip.every((item) => item.id === "only")).toBe(true);
	});

	it("returns an empty strip when the winner is missing", () => {
		expect(buildReelStrip([{ id: "a" }], "missing", 2)).toEqual([]);
	});
});

describe("reelLoops", () => {
	it("adds passes so a short pool still has a long runway", () => {
		expect(reelLoops(24)).toBe(3);
		expect(reelLoops(2)).toBe(18);
		expect(reelLoops(0)).toBe(0);
	});
});

describe("visibleLabel", () => {
	it("decodes numeric HTML entities and strips word joiners", () => {
		expect(visibleLabel("DreamHack Open Cluj&#8288;-&#8288;Napoca 2015")).toBe(
			"DreamHack Open Cluj-Napoca 2015",
		);
	});

	it("turns nbsp entities into single spaces", () => {
		expect(visibleLabel("Perfect World Shanghai&nbsp;&nbsp;2024")).toBe(
			"Perfect World Shanghai 2024",
		);
	});
});

describe("teamReelSubtitle", () => {
	it("hides year and placement until the appearance is safe to show", () => {
		const item = { year: 2018, placement: 2 };
		expect(teamReelSubtitle(item, false)).toBe("Team stays");
		expect(teamReelSubtitle(item, true)).toBe("2018 · placed #2");
	});

	it("omits placement when the card has none", () => {
		expect(teamReelSubtitle({ year: 2003, placement: 0 }, true)).toBe("2003");
	});
});

describe("withWinner", () => {
	it("appends a winner that is not already in the pool", () => {
		const winner = { id: "extra", title: "Extra", subtitle: "" };
		expect(withWinner([{ id: "a", title: "A", subtitle: "" }], winner)).toEqual([
			{ id: "a", title: "A", subtitle: "" },
			winner,
		]);
		expect(withWinner([winner], winner)).toEqual([winner]);
	});
});
