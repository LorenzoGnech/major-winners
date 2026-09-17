import type { DataRegime, PlayerSeason, RatingProvenanceKind } from "../src/data";

export type ApplyableStats = {
	playerSeasonIds: string[];
	nick: string;
	ign?: string;
	year: number;
	rating?: number;
	ratingVersion?: "1.0" | "2.0";
	kpr?: number;
	dpr?: number;
	adr?: number;
	kast?: number;
	impact?: number;
	openingKills?: number;
	openingDeaths?: number;
	roundsPlayed?: number;
	mapsPlayed?: number;
	sourceUrl: string;
};

export type ApplySkipReason =
	| "not-fallback"
	| "ign-mismatch"
	| "thin-sample"
	| "incomplete"
	| "missing-row";

export type ApplyOptions = {
	minMaps: number;
	searchAliases?: Readonly<Record<string, string>>;
};

export type ApplyResult =
	| { ok: true; season: PlayerSeason }
	| { ok: false; reason: ApplySkipReason };

export function openingKprOf(row: ApplyableStats): number | undefined {
	if (row.openingKills === undefined || !row.roundsPlayed) return undefined;
	return row.openingKills / row.roundsPlayed;
}

function aliasesFor(
	season: PlayerSeason,
	searchAliases: Readonly<Record<string, string>>,
): string[] {
	return [season.nick, searchAliases[season.playerId] ?? season.nick].map((name) =>
		name.toLowerCase(),
	);
}

export function ignMatches(
	season: PlayerSeason,
	row: ApplyableStats,
	searchAliases: Readonly<Record<string, string>> = {},
): boolean {
	if (!row.ign) return true;
	return aliasesFor(season, searchAliases).includes(row.ign.toLowerCase());
}

function inferRegime(season: PlayerSeason, row: ApplyableStats): DataRegime | undefined {
	if (row.rating === undefined || row.kpr === undefined || row.dpr === undefined) return undefined;
	if (season.year <= 2015) return "partial";
	if (row.adr === undefined || row.kast === undefined || row.impact === undefined) return undefined;
	return "full";
}

export function applyHltvRow(
	season: PlayerSeason,
	row: ApplyableStats | undefined,
	options: ApplyOptions,
): ApplyResult {
	if (season.dataRegime !== "fallback") return { ok: false, reason: "not-fallback" };
	if (!row) return { ok: false, reason: "missing-row" };
	if (!ignMatches(season, row, options.searchAliases)) return { ok: false, reason: "ign-mismatch" };
	if ((row.mapsPlayed ?? 0) < options.minMaps) return { ok: false, reason: "thin-sample" };
	const dataRegime = inferRegime(season, row);
	if (!dataRegime || row.rating === undefined || row.kpr === undefined || row.dpr === undefined) {
		return { ok: false, reason: "incomplete" };
	}
	const openingKpr = openingKprOf(row);
	const ratingVersion = row.ratingVersion ?? (season.year <= 2015 ? "1.0" : "2.0");
	const next: PlayerSeason = {
		id: season.id,
		playerId: season.playerId,
		nick: season.nick,
		realName: season.realName,
		nationality: season.nationality,
		year: season.year,
		orgId: season.orgId,
		...(season.photo ? { photo: season.photo } : {}),
		game: season.game,
		roles: season.roles,
		primaryRole: season.primaryRole,
		roleProvenance: season.roleProvenance ?? { kind: "teamcard-slot" },
		dataRegime,
		ratingProvenance: {
			kind: "verified-stats" satisfies RatingProvenanceKind,
			source: row.sourceUrl,
		},
		stats: {
			rating: row.rating,
			ratingVersion,
			kpr: row.kpr,
			dpr: row.dpr,
			...(row.adr !== undefined ? { adr: row.adr } : {}),
			...(row.kast !== undefined ? { kast: row.kast } : {}),
			...(row.impact !== undefined ? { impact: row.impact } : {}),
			...(openingKpr !== undefined ? { openingKpr } : {}),
		},
		accolades: season.accolades,
	};
	return { ok: true, season: next };
}

export function applyHltvCache(
	seasons: PlayerSeason[],
	rows: ApplyableStats[],
	options: ApplyOptions,
): { seasons: PlayerSeason[]; applied: number; skipped: Record<ApplySkipReason, number> } {
	const bySeasonId = new Map<string, ApplyableStats>();
	for (const row of rows) {
		for (const id of row.playerSeasonIds) bySeasonId.set(id, row);
	}
	const skipped: Record<ApplySkipReason, number> = {
		"not-fallback": 0,
		"ign-mismatch": 0,
		"thin-sample": 0,
		incomplete: 0,
		"missing-row": 0,
	};
	let applied = 0;
	const next = seasons.map((season) => {
		const result = applyHltvRow(season, bySeasonId.get(season.id), options);
		if (result.ok) {
			applied += 1;
			return result.season;
		}
		if (season.dataRegime === "fallback") skipped[result.reason] += 1;
		return season;
	});
	return { seasons: next, applied, skipped };
}
