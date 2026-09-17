import { pickWeighted, type Rng } from "../rng";
import type { TeamMemberProfile } from "../team";
import type { BuyType, Side, WeaponId } from "./types";

export type WeaponClass = "pistol" | "smg" | "rifle" | "sniper" | "shotgun" | "lmg" | "deagle";

type WeaponWeight = { weapon: WeaponId; weight: number };

export const WEAPON_CLASS: Record<WeaponId, WeaponClass> = {
	glock: "pistol",
	usp_s: "pistol",
	p250: "pistol",
	deagle: "deagle",
	cz75: "pistol",
	tec9: "pistol",
	fiveseven: "pistol",
	mac10: "smg",
	mp9: "smg",
	mp7: "smg",
	ump45: "smg",
	p90: "smg",
	ppbizon: "smg",
	galil: "rifle",
	famas: "rifle",
	ak47: "rifle",
	m4a1s: "rifle",
	m4a4: "rifle",
	aug: "rifle",
	sg553: "rifle",
	ssg08: "sniper",
	awp: "sniper",
	autosniper: "sniper",
	mag7: "shotgun",
	nova: "shotgun",
	sawedoff: "shotgun",
	negev: "lmg",
};

export const WEAPON_LABEL: Record<WeaponId, string> = {
	glock: "Glock",
	usp_s: "USP-S",
	p250: "P250",
	deagle: "Desert Eagle",
	cz75: "CZ75-Auto",
	tec9: "Tec-9",
	fiveseven: "Five-SeveN",
	mac10: "MAC-10",
	mp9: "MP9",
	mp7: "MP7",
	ump45: "UMP-45",
	p90: "P90",
	ppbizon: "PP-Bizon",
	galil: "Galil",
	famas: "FAMAS",
	ak47: "AK-47",
	m4a1s: "M4A1-S",
	m4a4: "M4A4",
	aug: "AUG",
	sg553: "SG 553",
	ssg08: "SSG 08",
	awp: "AWP",
	autosniper: "Auto-sniper",
	mag7: "MAG-7",
	nova: "Nova",
	sawedoff: "Sawed-Off",
	negev: "Negev",
};

/** Public path for the killfeed silhouette, or `null` when no file is committed. */
export const WEAPON_ICON: Record<WeaponId, string | null> = {
	glock: "/weapons/glock.png",
	usp_s: "/weapons/usps.png",
	p250: "/weapons/p250.png",
	deagle: "/weapons/deagle.png",
	cz75: "/weapons/cz75.png",
	tec9: "/weapons/tec9.png",
	fiveseven: "/weapons/fiveseven.png",
	mac10: "/weapons/mac10.png",
	mp9: "/weapons/mp9.png",
	mp7: "/weapons/mp7.png",
	ump45: "/weapons/ump45.png",
	p90: "/weapons/p90.png",
	ppbizon: "/weapons/ppbizon.png",
	galil: "/weapons/galil.png",
	famas: "/weapons/famas.png",
	ak47: "/weapons/ak47.png",
	m4a1s: "/weapons/m4a1.png",
	m4a4: "/weapons/m4a4.png",
	aug: "/weapons/aug.png",
	sg553: "/weapons/sg_553.png",
	ssg08: "/weapons/ssg.png",
	awp: "/weapons/awp.png",
	autosniper: "/weapons/auto.png",
	mag7: "/weapons/mag7.png",
	nova: "/weapons/nova.png",
	sawedoff: "/weapons/saw.png",
	negev: "/weapons/negev.png",
};

export const WEAPONS_BY_BUY: Record<BuyType, readonly WeaponId[]> = {
	pistol: ["glock", "usp_s", "p250", "deagle", "cz75", "tec9", "fiveseven"],
	eco: [
		"glock",
		"usp_s",
		"p250",
		"deagle",
		"cz75",
		"tec9",
		"fiveseven",
		"ssg08",
		"mag7",
		"nova",
		"sawedoff",
	],
	force: [
		"mac10",
		"mp9",
		"mp7",
		"ump45",
		"p90",
		"ppbizon",
		"galil",
		"famas",
		"deagle",
		"cz75",
		"tec9",
		"fiveseven",
		"ssg08",
		"awp",
		"ak47",
		"m4a1s",
		"m4a4",
		"mag7",
		"nova",
		"sawedoff",
		"negev",
	],
	"full-buy": ["ak47", "m4a1s", "m4a4", "aug", "sg553", "awp", "autosniper", "negev"],
};

const PISTOL_T: readonly WeaponWeight[] = [
	{ weapon: "glock", weight: 78 },
	{ weapon: "p250", weight: 12 },
	{ weapon: "deagle", weight: 5 },
	{ weapon: "tec9", weight: 4 },
	{ weapon: "cz75", weight: 1 },
];

const PISTOL_CT: readonly WeaponWeight[] = [
	{ weapon: "usp_s", weight: 82 },
	{ weapon: "p250", weight: 8 },
	{ weapon: "fiveseven", weight: 6 },
	{ weapon: "deagle", weight: 3 },
	{ weapon: "cz75", weight: 1 },
];

const ECO_T: readonly WeaponWeight[] = [
	{ weapon: "glock", weight: 420 },
	{ weapon: "p250", weight: 220 },
	{ weapon: "deagle", weight: 160 },
	{ weapon: "tec9", weight: 120 },
	{ weapon: "cz75", weight: 40 },
	{ weapon: "sawedoff", weight: 30 },
	{ weapon: "nova", weight: 10 },
];

const ECO_T_AWP: readonly WeaponWeight[] = [
	{ weapon: "ssg08", weight: 220 },
	{ weapon: "glock", weight: 280 },
	{ weapon: "p250", weight: 180 },
	{ weapon: "deagle", weight: 140 },
	{ weapon: "tec9", weight: 100 },
	{ weapon: "cz75", weight: 30 },
	{ weapon: "sawedoff", weight: 30 },
	{ weapon: "nova", weight: 20 },
];

const ECO_CT: readonly WeaponWeight[] = [
	{ weapon: "usp_s", weight: 440 },
	{ weapon: "p250", weight: 200 },
	{ weapon: "deagle", weight: 140 },
	{ weapon: "fiveseven", weight: 100 },
	{ weapon: "mag7", weight: 60 },
	{ weapon: "cz75", weight: 40 },
	{ weapon: "nova", weight: 20 },
];

const ECO_CT_AWP: readonly WeaponWeight[] = [
	{ weapon: "ssg08", weight: 220 },
	{ weapon: "usp_s", weight: 300 },
	{ weapon: "p250", weight: 160 },
	{ weapon: "deagle", weight: 120 },
	{ weapon: "fiveseven", weight: 80 },
	{ weapon: "mag7", weight: 50 },
	{ weapon: "cz75", weight: 40 },
	{ weapon: "nova", weight: 30 },
];

const FORCE_T: readonly WeaponWeight[] = [
	{ weapon: "mac10", weight: 380 },
	{ weapon: "galil", weight: 250 },
	{ weapon: "deagle", weight: 120 },
	{ weapon: "tec9", weight: 80 },
	{ weapon: "ump45", weight: 70 },
	{ weapon: "ak47", weight: 50 },
	{ weapon: "p90", weight: 15 },
	{ weapon: "mp7", weight: 10 },
	{ weapon: "sawedoff", weight: 12 },
	{ weapon: "cz75", weight: 8 },
	{ weapon: "ppbizon", weight: 3 },
	{ weapon: "negev", weight: 2 },
];

const FORCE_T_AWP: readonly WeaponWeight[] = [
	{ weapon: "ssg08", weight: 260 },
	{ weapon: "awp", weight: 200 },
	{ weapon: "mac10", weight: 150 },
	{ weapon: "galil", weight: 140 },
	{ weapon: "deagle", weight: 100 },
	{ weapon: "ump45", weight: 60 },
	{ weapon: "ak47", weight: 50 },
	{ weapon: "tec9", weight: 25 },
	{ weapon: "p90", weight: 10 },
	{ weapon: "negev", weight: 5 },
];

const FORCE_CT: readonly WeaponWeight[] = [
	{ weapon: "mp9", weight: 330 },
	{ weapon: "famas", weight: 220 },
	{ weapon: "deagle", weight: 100 },
	{ weapon: "mp7", weight: 90 },
	{ weapon: "ump45", weight: 70 },
	{ weapon: "mag7", weight: 55 },
	{ weapon: "fiveseven", weight: 40 },
	{ weapon: "m4a1s", weight: 30 },
	{ weapon: "m4a4", weight: 25 },
	{ weapon: "cz75", weight: 12 },
	{ weapon: "p90", weight: 12 },
	{ weapon: "nova", weight: 12 },
	{ weapon: "ppbizon", weight: 3 },
	{ weapon: "negev", weight: 1 },
];

const FORCE_CT_AWP: readonly WeaponWeight[] = [
	{ weapon: "ssg08", weight: 250 },
	{ weapon: "awp", weight: 180 },
	{ weapon: "mp9", weight: 140 },
	{ weapon: "famas", weight: 140 },
	{ weapon: "deagle", weight: 90 },
	{ weapon: "mp7", weight: 60 },
	{ weapon: "ump45", weight: 50 },
	{ weapon: "m4a1s", weight: 30 },
	{ weapon: "m4a4", weight: 25 },
	{ weapon: "mag7", weight: 25 },
	{ weapon: "negev", weight: 10 },
];

const FULL_T: readonly WeaponWeight[] = [
	{ weapon: "ak47", weight: 960 },
	{ weapon: "sg553", weight: 30 },
	{ weapon: "awp", weight: 8 },
	{ weapon: "negev", weight: 2 },
];

const FULL_T_AWP: readonly WeaponWeight[] = [
	{ weapon: "awp", weight: 930 },
	{ weapon: "ak47", weight: 60 },
	{ weapon: "sg553", weight: 10 },
];

const FULL_CT: readonly WeaponWeight[] = [
	{ weapon: "m4a1s", weight: 505 },
	{ weapon: "m4a4", weight: 430 },
	{ weapon: "aug", weight: 55 },
	{ weapon: "awp", weight: 8 },
	{ weapon: "autosniper", weight: 1 },
	{ weapon: "negev", weight: 1 },
];

const FULL_CT_AWP: readonly WeaponWeight[] = [
	{ weapon: "awp", weight: 930 },
	{ weapon: "m4a1s", weight: 30 },
	{ weapon: "m4a4", weight: 25 },
	{ weapon: "aug", weight: 15 },
];

function choose(pool: readonly WeaponWeight[], rng: Rng): WeaponId {
	return pickWeighted(pool, (row) => row.weight, rng).weapon;
}

function bump(pool: readonly WeaponWeight[], weapon: WeaponId, extra: number): WeaponWeight[] {
	return pool.map((row) => (row.weapon === weapon ? { ...row, weight: row.weight + extra } : row));
}

function slotAwper(member: TeamMemberProfile): boolean {
	return member.slot === "awp";
}

function ecoPool(member: TeamMemberProfile, side: Side): readonly WeaponWeight[] {
	if (slotAwper(member)) return side === "T" ? ECO_T_AWP : ECO_CT_AWP;
	const base = side === "T" ? ECO_T : ECO_CT;
	return member.slot === "lurker" ? bump(base, "deagle", 40) : base;
}

function forcePool(member: TeamMemberProfile, side: Side): readonly WeaponWeight[] {
	if (slotAwper(member)) return side === "T" ? FORCE_T_AWP : FORCE_CT_AWP;
	const base = side === "T" ? FORCE_T : FORCE_CT;
	if (member.slot === "entry") return bump(base, side === "T" ? "mac10" : "mp9", 80);
	return base;
}

function fullBuyPool(member: TeamMemberProfile, side: Side): readonly WeaponWeight[] {
	if (slotAwper(member)) return side === "T" ? FULL_T_AWP : FULL_CT_AWP;
	const base = side === "T" ? FULL_T : FULL_CT;
	if (member.primaryRole === "awp") return bump(base, "awp", 72);
	return base;
}

export function assignWeapon(
	member: TeamMemberProfile,
	buy: BuyType,
	side: Side,
	rng: Rng,
): WeaponId {
	if (buy === "pistol") return choose(side === "T" ? PISTOL_T : PISTOL_CT, rng);
	if (buy === "eco") return choose(ecoPool(member, side), rng);
	if (buy === "force") return choose(forcePool(member, side), rng);
	return choose(fullBuyPool(member, side), rng);
}

export function isWeaponLegalForBuy(weapon: WeaponId, buy: BuyType): boolean {
	return WEAPONS_BY_BUY[buy].includes(weapon);
}
