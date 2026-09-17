import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import { createRng } from "../rng";
import type { TeamMemberProfile } from "../team";
import type { BuyType, Side, WeaponId } from "./types";
import {
	assignWeapon,
	isWeaponLegalForBuy,
	WEAPON_CLASS,
	WEAPON_ICON,
	WEAPON_LABEL,
	WEAPONS_BY_BUY,
} from "./weapons";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function member(slot: TeamMemberProfile["slot"], primaryRole = slot): TeamMemberProfile {
	return {
		id: `${slot}-player`,
		playerId: `${slot}-player`,
		nick: slot,
		nationality: "DK",
		orgId: "test",
		year: 2020,
		slot,
		primaryRole,
		roles: [primaryRole],
		fit: 1,
		ovr: 80,
		effectiveOvr: 80,
		attributes,
	};
}

function sample(
	player: TeamMemberProfile,
	buy: BuyType,
	side: Side,
	n: number,
	seed = 1,
): Map<WeaponId, number> {
	const rng = createRng(seed);
	const counts = new Map<WeaponId, number>();
	for (let i = 0; i < n; i += 1) {
		const weapon = assignWeapon(player, buy, side, rng);
		expect(isWeaponLegalForBuy(weapon, buy)).toBe(true);
		counts.set(weapon, (counts.get(weapon) ?? 0) + 1);
	}
	return counts;
}

function share(counts: Map<WeaponId, number>, weapon: WeaponId, n: number): number {
	return (counts.get(weapon) ?? 0) / n;
}

describe("weapon assets", () => {
	it("labels, classes, and icon paths cover every weapon", () => {
		for (const weapon of Object.keys(WEAPON_LABEL) as WeaponId[]) {
			expect(weapon in WEAPON_CLASS).toBe(true);
			expect(weapon in WEAPON_ICON).toBe(true);
		}
	});

	it("points every committed icon at a public file", () => {
		for (const [weapon, src] of Object.entries(WEAPON_ICON)) {
			if (!src) continue;
			const file = join(process.cwd(), "public", src.replace(/^\//, ""));
			expect(existsSync(file), `${weapon} -> ${src}`).toBe(true);
		}
	});
});

describe("assignWeapon", () => {
	it("is deterministic for a seed", () => {
		const player = member("entry");
		const a = createRng(42);
		const b = createRng(42);
		for (let i = 0; i < 40; i += 1) {
			expect(assignWeapon(player, "full-buy", "T", a)).toBe(
				assignWeapon(player, "full-buy", "T", b),
			);
		}
	});

	it("gives the AWP slot an AWP on most T and CT full buys", () => {
		const n = 4000;
		const t = sample(member("awp"), "full-buy", "T", n);
		const ct = sample(member("awp"), "full-buy", "CT", n);
		expect(share(t, "awp", n)).toBeGreaterThan(0.88);
		expect(share(ct, "awp", n)).toBeGreaterThan(0.88);
	});

	it("gives riflers AK/M4 on full buys, not pistols or SMGs", () => {
		const n = 4000;
		const t = sample(member("entry"), "full-buy", "T", n);
		const ct = sample(member("entry"), "full-buy", "CT", n);
		expect(share(t, "ak47", n)).toBeGreaterThan(0.9);
		expect(share(ct, "m4a1s", n) + share(ct, "m4a4", n)).toBeGreaterThan(0.85);
		expect(t.has("glock")).toBe(false);
		expect(t.has("mac10")).toBe(false);
		expect(ct.has("usp_s")).toBe(false);
		expect(ct.has("mp9")).toBe(false);
		expect(share(t, "negev", n) + share(ct, "negev", n)).toBeLessThan(0.01);
		expect(share(ct, "autosniper", n)).toBeLessThan(0.01);
	});

	it("keeps pistol rounds on side pistols and upgrades", () => {
		const n = 3000;
		const t = sample(member("awp"), "pistol", "T", n);
		const ct = sample(member("awp"), "pistol", "CT", n);
		expect(share(t, "glock", n)).toBeGreaterThan(0.7);
		expect(share(ct, "usp_s", n)).toBeGreaterThan(0.7);
		expect(t.has("ak47")).toBe(false);
		expect(t.has("awp")).toBe(false);
		expect(ct.has("m4a4")).toBe(false);
		expect(ct.has("awp")).toBe(false);
	});

	it("uses pistols and scouts on eco, never rifles or AWP", () => {
		const n = 3000;
		const t = sample(member("awp"), "eco", "T", n);
		const rifler = sample(member("support"), "eco", "CT", n);
		expect(share(t, "ssg08", n)).toBeGreaterThan(0.15);
		expect(t.has("awp")).toBe(false);
		expect(t.has("ak47")).toBe(false);
		expect(rifler.has("m4a1s")).toBe(false);
		expect(rifler.has("awp")).toBe(false);
	});

	it("uses SMGs and cheap rifles on force buys", () => {
		const n = 3000;
		const t = sample(member("entry"), "force", "T", n);
		const ct = sample(member("entry"), "force", "CT", n);
		expect(share(t, "mac10", n)).toBeGreaterThan(0.3);
		expect(share(ct, "mp9", n)).toBeGreaterThan(0.25);
		expect(share(t, "galil", n)).toBeGreaterThan(0.12);
		expect(share(ct, "famas", n)).toBeGreaterThan(0.1);
		expect(share(t, "negev", n) + share(ct, "negev", n)).toBeLessThan(0.02);
	});

	it("lets an off-role primary AWPer take the AWP more often than a rifler", () => {
		const n = 4000;
		const offRole = sample(member("entry", "awp"), "full-buy", "T", n);
		const rifler = sample(member("entry", "entry"), "full-buy", "T", n);
		expect(share(offRole, "awp", n)).toBeGreaterThan(share(rifler, "awp", n));
		expect(share(offRole, "awp", n)).toBeGreaterThan(0.04);
		expect(share(rifler, "awp", n)).toBeLessThan(0.03);
	});
});

describe("WEAPONS_BY_BUY", () => {
	it("lists every weapon the assigner can roll for that buy", () => {
		const players = [
			member("awp"),
			member("entry"),
			member("igl"),
			member("support"),
			member("lurker"),
			member("entry", "awp"),
		];
		const buys: BuyType[] = ["pistol", "eco", "force", "full-buy"];
		const sides: Side[] = ["T", "CT"];
		for (const player of players) {
			for (const buy of buys) {
				for (const side of sides) {
					sample(player, buy, side, 200, 99);
				}
			}
		}
		expect(WEAPONS_BY_BUY["full-buy"]).toContain("ak47");
		expect(WEAPONS_BY_BUY.pistol).not.toContain("awp");
	});
});
