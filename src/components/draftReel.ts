import type { Major, Org, OrgTier, OrgYear } from "../data";

export const LEGACY_MAJOR_REEL_ID = "legacy-wildcard";
export const LEGACY_MAJOR_LOGO = "/logos/majors/cs16.png";

export const MAJOR_SPIN_MS = 850;
export const TEAM_SPIN_MS = 1000;
export const MAJOR_HOLD_MS = 450;
export const TEAM_HOLD_MS = 2000;
export const REEL_ITEM_PX = 56;
export const REEL_VISIBLE = 3;

export type DraftRollKind = "full" | "major" | "team";

export type MajorReelItem = {
	id: string;
	title: string;
	subtitle: string;
	logo?: string;
};

export type TeamReelItem = {
	id: string;
	orgId: string;
	name: string;
	year: number;
	tier: OrgTier;
	placement: number;
};

export type MajorReelSource = Pick<Major, "id" | "shortName" | "location" | "year" | "logo">;
export type TeamReelSource = Pick<
	OrgYear,
	"id" | "kind" | "majorId" | "orgId" | "year" | "tier" | "placement"
>;
export type OrgReelSource = Pick<Org, "id" | "name">;

const LEGACY_MAJOR_REEL_ITEM: MajorReelItem = {
	id: LEGACY_MAJOR_REEL_ID,
	title: "Legacy wildcard",
	subtitle: "Pre-2013 legend",
	logo: LEGACY_MAJOR_LOGO,
};

export function visibleLabel(text: string): string {
	return text
		.replaceAll("&nbsp;", " ")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replaceAll("\u2060", "")
		.replace(/ {2,}/g, " ");
}

export function winnerMajorReelId(majorId: string | null): string {
	return majorId ?? LEGACY_MAJOR_REEL_ID;
}

export function majorReelPool(majors: readonly MajorReelSource[]): MajorReelItem[] {
	return [
		...majors.map((major) => ({
			id: major.id,
			title: visibleLabel(major.shortName),
			subtitle: `${visibleLabel(major.location)} · ${major.year}`,
			logo: major.logo,
		})),
		LEGACY_MAJOR_REEL_ITEM,
	];
}

export function winnerMajorItem(
	majors: readonly MajorReelSource[],
	majorId: string | null,
): MajorReelItem {
	if (majorId === null) {
		return LEGACY_MAJOR_REEL_ITEM;
	}
	const major = majors.find((row) => row.id === majorId);
	if (!major) {
		return { id: majorId, title: visibleLabel(majorId), subtitle: "Major" };
	}
	return {
		id: major.id,
		title: visibleLabel(major.shortName),
		subtitle: `${visibleLabel(major.location)} · ${major.year}`,
		logo: major.logo,
	};
}

export function teamReelPool(
	orgYears: readonly TeamReelSource[],
	orgsById: ReadonlyMap<string, OrgReelSource>,
	majorId: string | null,
): TeamReelItem[] {
	const rows = orgYears.filter((orgYear) =>
		majorId === null ? orgYear.kind === "legacy" : orgYear.majorId === majorId,
	);
	return rows
		.slice()
		.sort((a, b) => a.placement - b.placement || a.id.localeCompare(b.id))
		.map((orgYear) => ({
			id: orgYear.id,
			orgId: orgYear.orgId,
			name: orgsById.get(orgYear.orgId)?.name ?? orgYear.orgId,
			year: orgYear.year,
			tier: orgYear.tier,
			placement: orgYear.placement,
		}));
}

export function orgAppearanceReelPool(
	orgYears: readonly TeamReelSource[],
	orgsById: ReadonlyMap<string, OrgReelSource>,
	orgId: string,
): TeamReelItem[] {
	const rows = orgYears.filter((orgYear) => orgYear.orgId === orgId && orgYear.kind === "major");
	return rows
		.slice()
		.sort((a, b) => a.year - b.year || a.placement - b.placement || a.id.localeCompare(b.id))
		.map((orgYear) => ({
			id: orgYear.id,
			orgId: orgYear.orgId,
			name: orgsById.get(orgYear.orgId)?.name ?? orgYear.orgId,
			year: orgYear.year,
			tier: orgYear.tier,
			placement: orgYear.placement,
		}));
}

export function winnerTeamItem(
	orgYears: readonly TeamReelSource[],
	orgsById: ReadonlyMap<string, OrgReelSource>,
	orgYearId: string,
): TeamReelItem | undefined {
	const orgYear = orgYears.find((row) => row.id === orgYearId);
	if (!orgYear) {
		return undefined;
	}
	return {
		id: orgYear.id,
		orgId: orgYear.orgId,
		name: orgsById.get(orgYear.orgId)?.name ?? orgYear.orgId,
		year: orgYear.year,
		tier: orgYear.tier,
		placement: orgYear.placement,
	};
}

export function teamReelSubtitle(
	item: Pick<TeamReelItem, "year" | "placement">,
	revealAppearance: boolean,
): string {
	if (!revealAppearance) {
		return "Team stays";
	}
	return item.placement > 0 ? `${item.year} · placed #${item.placement}` : String(item.year);
}

export function withWinner<T extends { id: string }>(pool: readonly T[], winner: T): T[] {
	if (pool.some((item) => item.id === winner.id)) {
		return [...pool];
	}
	return [...pool, winner];
}

/** Enough full passes that a short pool still travels like a slot reel. */
export function reelLoops(poolSize: number, minItems = 36): number {
	if (poolSize <= 0) {
		return 0;
	}
	return Math.max(3, Math.ceil(minItems / poolSize));
}

/**
 * Repeat the pool several times, then continue from the start until the winner
 * is last so a CSS ease-out can travel a long runway and stop on the result.
 */
export function buildReelStrip<T extends { id: string }>(
	pool: readonly T[],
	winnerId: string,
	loops = reelLoops(pool.length),
): T[] {
	const winner = pool.find((item) => item.id === winnerId);
	if (!winner) {
		return [];
	}
	if (pool.length === 1) {
		return Array.from({ length: Math.max(loops, 4) }, () => winner);
	}
	const strip: T[] = [];
	for (let i = 0; i < loops; i++) {
		strip.push(...pool);
	}
	for (const item of pool) {
		strip.push(item);
		if (item.id === winnerId) {
			break;
		}
	}
	return strip;
}
