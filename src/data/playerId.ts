/** Liquipedia titles that slug to a famous short career id. */
const PLAYER_ID_ALIASES: Readonly<Record<string, string>> = {
	f0rest: "forest",
	adren_kazakh: "adren",
	alex_british: "alex",
	lucky_french: "lucky",
	niko_bosnian: "niko",
};

/**
 * Bare nicks that two Major careers share. Keyed by folded slug + ISO country so a TeamCard
 * without `(American player)` still lands on the right career.
 */
const PLAYER_ID_BY_SLUG_AND_NATION: Readonly<Record<string, string>> = {
	"adren:KZ": "adren",
	"adren:US": "adren_american",
	"alex:UK": "alex",
	"alex:ES": "alex_spanish",
	"lucky:FR": "lucky",
	"lucky:DK": "lucky_danish",
	"niko:BA": "niko",
	"niko:DK": "niko_danish",
};

/** Pinned HLTV ids for shared nicks so search order cannot re-merge them. */
export const HLTV_ID_BY_PLAYER_ID: Readonly<Record<string, number>> = {
	adren: 334,
	adren_american: 7433,
	alex: 8184,
	alex_spanish: 8371,
	lucky: 13497,
	lucky_danish: 13843,
	niko: 3741,
	niko_danish: 10264,
};

export const PLAYER_SEASON_ID_ALIASES: Readonly<Record<string, string>> = {
	"adren-2013-team-ibuypower": "adren_american-2013-team-ibuypower",
	"adren-2014-team-ibuypower": "adren_american-2014-team-ibuypower",
	"adren-2015-liquid": "adren_american-2015-liquid",
	"adren-2016-liquid": "adren_american-2016-liquid",
	"niko-2018-north": "niko_danish-2018-north",
	"niko-2023-og": "niko_danish-2023-og",
	"alex-2021-movistar-riders": "alex_spanish-2021-movistar-riders",
	"lucky-2021-astralis": "lucky_danish-2021-astralis",
};

export const COACH_ID_ALIASES: Readonly<Record<string, string>> = {
	"adren-2019-liquid": "adren_american-2019-liquid",
	"adren-2022-liquid": "adren_american-2022-liquid",
	"adren-2025-complexity": "adren_american-2025-complexity",
};

export function rawPlayerSlug(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/_(?:player|counter_strike)$/g, "");
}

/** Career id from a Liquipedia title or in-game nick, plus optional TeamCard flag. */
export function playerIdFor(name: string, nationality?: string): string {
	const slug = rawPlayerSlug(name);
	const aliased = PLAYER_ID_ALIASES[slug] ?? slug;
	if (nationality && nationality !== "ZZ") {
		return PLAYER_ID_BY_SLUG_AND_NATION[`${aliased}:${nationality}`] ?? aliased;
	}
	return aliased;
}

export function resolvePlayerSeasonId(id: string): string {
	return PLAYER_SEASON_ID_ALIASES[id] ?? id;
}

export function resolveCoachId(id: string): string {
	return COACH_ID_ALIASES[id] ?? id;
}

export function indexById<T extends { id: string }>(
	rows: readonly T[],
	aliases: Readonly<Record<string, string>> = {},
): Map<string, T> {
	const byId = new Map(rows.map((row) => [row.id, row]));
	for (const [from, to] of Object.entries(aliases)) {
		const row = byId.get(to);
		if (row) byId.set(from, row);
	}
	return byId;
}

export function indexPlayerSeasons<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
	return indexById(rows, PLAYER_SEASON_ID_ALIASES);
}

export function playerDisplayNick(player: { nick: string; displayNick?: string }): string {
	return player.displayNick ?? player.nick;
}

export function pickHltvSearchResult<T extends { id: number; nickName?: string }>(
	results: readonly T[],
	input: { searchName: string; playerId: string; countryCode?: string },
): T | undefined {
	const pinned = HLTV_ID_BY_PLAYER_ID[input.playerId];
	if (pinned !== undefined) {
		const match = results.find((result) => result.id === pinned);
		if (match) return match;
	}
	const wanted = input.searchName.toLowerCase();
	const nickMatches = results.filter((result) => result.nickName?.toLowerCase() === wanted);
	if (input.countryCode) {
		const countryMatches = nickMatches.filter(
			(result) => "countryCode" in result && result.countryCode === input.countryCode,
		);
		if (countryMatches[0]) return countryMatches[0];
	}
	return nickMatches[0] ?? results[0];
}
