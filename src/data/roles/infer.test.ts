import { describe, expect, it } from "vitest";
import type { OrgYear, PlayerSeason, Role } from "../schema";
import { inferPlayerRoles } from "./infer";
import { applyRoleOverrides } from "./overrides";

function season(
	partial: Partial<PlayerSeason> & Pick<PlayerSeason, "id" | "playerId">,
): PlayerSeason {
	return {
		nick: partial.playerId,
		realName: partial.playerId,
		nationality: "DK",
		year: 2018,
		orgId: "test",
		game: "csgo",
		roles: ["support"],
		primaryRole: "support",
		roleProvenance: { kind: "teamcard-slot" },
		dataRegime: "full",
		ratingProvenance: { kind: "verified-stats" },
		accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
		...partial,
	};
}

function roster(id: string, playerSeasonIds: string[]): OrgYear {
	return {
		id,
		kind: "major",
		majorId: "test-major",
		orgId: "test",
		year: 2018,
		game: "csgo",
		tier: "strong",
		placement: 1,
		playerSeasonIds,
		substituteSeasonIds: [],
		sources: [{ label: "test", url: "https://example.test", accessedAt: "2026-01-01" }],
	};
}

function byId(seasons: PlayerSeason[]): Record<string, PlayerSeason> {
	return Object.fromEntries(seasons.map((row) => [row.id, row]));
}

describe("inferPlayerRoles", () => {
	it("does not treat TeamCard p1 as IGL when that player is a career AWPer", () => {
		const seasons = [
			season({
				id: "kennys-2015-titan",
				playerId: "kennys",
				year: 2015,
				orgId: "titan",
				game: "csgo",
				roles: ["igl"],
				primaryRole: "igl",
				stats: { rating: 1.27, ratingVersion: "1.0", kpr: 0.84, dpr: 0.6 },
			}),
			season({ id: "rifle-a-2015-titan", playerId: "apex", year: 2015, orgId: "titan" }),
			season({ id: "rifle-b-2015-titan", playerId: "happy", year: 2015, orgId: "titan" }),
			season({ id: "rifle-c-2015-titan", playerId: "kioshima", year: 2015, orgId: "titan" }),
			season({ id: "rifle-d-2015-titan", playerId: "dupreeh", year: 2015, orgId: "titan" }),
		];
		const { seasons: next } = inferPlayerRoles({
			seasons,
			orgYears: [
				roster("titan-2015", [
					"kennys-2015-titan",
					"rifle-a-2015-titan",
					"rifle-b-2015-titan",
					"rifle-c-2015-titan",
					"rifle-d-2015-titan",
				]),
			],
			overrides: {},
		});
		const players = byId(next);
		expect(players["kennys-2015-titan"]?.primaryRole).toBe("awp");
		expect(players["kennys-2015-titan"]?.roleProvenance.kind).toBe("inferred");
		expect(
			Object.values(players)
				.filter((row) => row.primaryRole === "awp")
				.map((row) => row.id),
		).toEqual(["kennys-2015-titan"]);
	});

	it("gives the AWP slot to the higher-rated career AWPer", () => {
		const seasons = [
			season({
				id: "rpk-2019-vitality",
				playerId: "rpk",
				orgId: "vitality",
				year: 2019,
				roles: ["awp"],
				primaryRole: "awp",
				stats: {
					rating: 0.98,
					ratingVersion: "2.0",
					kpr: 0.64,
					dpr: 0.68,
					adr: 70,
					kast: 68,
					impact: 0.95,
				},
			}),
			season({
				id: "zywoo-2019-vitality",
				playerId: "zywoo",
				orgId: "vitality",
				year: 2019,
				roles: ["support"],
				primaryRole: "support",
				stats: {
					rating: 1.32,
					ratingVersion: "2.0",
					kpr: 0.86,
					dpr: 0.58,
					adr: 88,
					kast: 76,
					impact: 1.4,
				},
			}),
			season({ id: "apex-2019-vitality", playerId: "apex", orgId: "vitality", year: 2019 }),
			season({ id: "nbk-2019-vitality", playerId: "nbk", orgId: "vitality", year: 2019 }),
			season({ id: "alex-2019-vitality", playerId: "alex", orgId: "vitality", year: 2019 }),
		];
		const { seasons: next } = inferPlayerRoles({
			seasons,
			orgYears: [
				roster("vitality-2019", [
					"nbk-2019-vitality",
					"apex-2019-vitality",
					"rpk-2019-vitality",
					"zywoo-2019-vitality",
					"alex-2019-vitality",
				]),
			],
			overrides: {},
		});
		expect(byId(next)["zywoo-2019-vitality"]?.primaryRole).toBe("awp");
		expect(byId(next)["rpk-2019-vitality"]?.primaryRole).not.toBe("awp");
	});

	it("keeps curated overrides locked", () => {
		const seasons = [
			season({
				id: "s1mple-2018-navi",
				playerId: "s1mple",
				orgId: "navi",
				roles: ["lurker"],
				primaryRole: "lurker",
			}),
			season({ id: "electronic-2018-navi", playerId: "electronic", orgId: "navi" }),
			season({ id: "edward-2018-navi", playerId: "edward", orgId: "navi" }),
			season({ id: "flamie-2018-navi", playerId: "flamie", orgId: "navi" }),
			season({ id: "zeus-2018-navi", playerId: "zeus", orgId: "navi" }),
		];
		const overrides = {
			"s1mple-2018-navi": { primaryRole: "awp" as const, roles: ["awp", "entry"] as Role[] },
		};
		const { seasons: next } = inferPlayerRoles({
			seasons,
			orgYears: [
				roster("navi-2018", [
					"zeus-2018-navi",
					"electronic-2018-navi",
					"edward-2018-navi",
					"flamie-2018-navi",
					"s1mple-2018-navi",
				]),
			],
			overrides,
		});
		const s1mple = byId(next)["s1mple-2018-navi"];
		expect(s1mple?.primaryRole).toBe("awp");
		expect(s1mple?.roles).toEqual(["awp", "entry"]);
		expect(s1mple?.roleProvenance.kind).toBe("curated");
		expect(byId(next)["zeus-2018-navi"]?.primaryRole).toBe("igl");
	});

	it("gives dual IGL/AWPers IGL primary when no other IGL is tagged", () => {
		const seasons = [
			season({ id: "fallen-2016-sk", playerId: "fallen", orgId: "sk", year: 2016 }),
			season({ id: "fer-2016-sk", playerId: "fer", orgId: "sk", year: 2016 }),
			season({ id: "coldzera-2016-sk", playerId: "coldzera", orgId: "sk", year: 2016 }),
			season({ id: "taco-2016-sk", playerId: "taco", orgId: "sk", year: 2016 }),
			season({ id: "fnx-2016-sk", playerId: "fnx", orgId: "sk", year: 2016 }),
		];
		const { seasons: next } = inferPlayerRoles({
			seasons,
			orgYears: [
				roster("sk-2016", [
					"fallen-2016-sk",
					"fer-2016-sk",
					"coldzera-2016-sk",
					"taco-2016-sk",
					"fnx-2016-sk",
				]),
			],
			overrides: {},
		});
		const fallen = byId(next)["fallen-2016-sk"];
		expect(fallen?.primaryRole).toBe("igl");
		expect(fallen?.roles).toEqual(["igl", "awp"]);
	});

	it("fills leftover roles when a later roster shares four players", () => {
		const shared = [
			season({
				id: "kennys-2015-titan",
				playerId: "kennys",
				year: 2015,
				orgId: "titan",
				stats: { rating: 1.27, ratingVersion: "1.0", kpr: 0.84, dpr: 0.6 },
			}),
			season({ id: "apex-2015-titan", playerId: "apex", year: 2015, orgId: "titan" }),
			season({ id: "happy-2015-titan", playerId: "happy", year: 2015, orgId: "titan" }),
			season({ id: "kioshima-2015-titan", playerId: "kioshima", year: 2015, orgId: "titan" }),
		];
		const first = season({
			id: "dupreeh-2015-titan",
			playerId: "dupreeh",
			year: 2015,
			orgId: "titan",
		});
		const second = season({
			id: "rain-2015-titan",
			playerId: "rain",
			year: 2015,
			orgId: "titan",
		});
		const ids1 = [
			"kennys-2015-titan",
			"apex-2015-titan",
			"happy-2015-titan",
			"kioshima-2015-titan",
			"dupreeh-2015-titan",
		];
		const ids2 = [
			"kennys-2015-titan",
			"apex-2015-titan",
			"happy-2015-titan",
			"kioshima-2015-titan",
			"rain-2015-titan",
		];
		const { seasons: next } = inferPlayerRoles({
			seasons: [...shared, first, second],
			orgYears: [roster("titan-a", ids1), roster("titan-b", ids2)],
			overrides: {},
		});
		const players = byId(next);
		expect(players["kennys-2015-titan"]?.primaryRole).toBe("awp");
		expect(new Set(ids2.map((id) => players[id]?.primaryRole)).size).toBe(5);
	});
});

describe("applyRoleOverrides", () => {
	it("stamps curated provenance and does not touch other rows", () => {
		const seasons = [
			season({ id: "device-2016-astralis", playerId: "device", orgId: "astralis", year: 2016 }),
			season({ id: "gla1ve-2018-astralis", playerId: "gla1ve", orgId: "astralis" }),
		];
		const { seasons: next, applied } = applyRoleOverrides(seasons, {
			"gla1ve-2018-astralis": { primaryRole: "igl", roles: ["igl", "support"] },
		});
		expect(applied).toBe(1);
		expect(next[0]?.primaryRole).toBe("support");
		expect(next[1]?.roleProvenance).toEqual({ kind: "curated", source: "role-overrides.json" });
		expect(next[1]?.roles).toEqual(["igl", "support"]);
	});
});
