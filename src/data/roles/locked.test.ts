import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "../schema";
import { importRolesFor, isRoleLocked } from "./locked";

const existing: PlayerSeason = {
	id: "s1mple-2018-navi",
	playerId: "s1mple",
	nick: "s1mple",
	realName: "s1mple",
	nationality: "UA",
	year: 2018,
	orgId: "navi",
	game: "csgo",
	roles: ["awp", "entry"],
	primaryRole: "awp",
	roleProvenance: { kind: "inferred", source: "roster-assignment" },
	dataRegime: "full",
	ratingProvenance: { kind: "verified-stats" },
	accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
};

describe("importRolesFor", () => {
	it("prefers an override over TeamCard order", () => {
		expect(
			importRolesFor(0, undefined, { primaryRole: "awp", roles: ["awp", "entry"] }),
		).toMatchObject({
			primaryRole: "awp",
			roles: ["awp", "entry"],
			roleProvenance: { kind: "curated" },
		});
	});

	it("preserves inferred and curated roles", () => {
		expect(importRolesFor(0, existing, undefined).primaryRole).toBe("awp");
		expect(
			importRolesFor(0, { ...existing, roleProvenance: { kind: "curated" } }, undefined)
				.roleProvenance.kind,
		).toBe("curated");
	});

	it("uses TeamCard order only for unlocked rows", () => {
		expect(importRolesFor(0, undefined, undefined)).toEqual({
			roles: ["igl"],
			primaryRole: "igl",
			roleProvenance: { kind: "teamcard-slot", source: "TeamCard listing order" },
		});
		expect(isRoleLocked(existing, undefined)).toBe(false);
		expect(isRoleLocked(existing, { primaryRole: "awp", roles: ["awp"] })).toBe(true);
	});
});
