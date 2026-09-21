import { indexPlayerSeasons, PLAYER_SEASON_ID_ALIASES, resolveCoachId } from "../data/playerId";
import { type Dataset, ROLES, type Role } from "../data/schema";
import type { BonusId } from "../engine/bonuses";
import type { CompletedDraft } from "../engine/draft";
import { roleFit } from "../engine/draft";
import type { SavedTeamSnapshot, TraitsSnapshot } from "./schema";

function traitsForSnapshot(traits: TraitsSnapshot, seasonId: string): BonusId[] {
	const current = traits[seasonId];
	if (current) return current as BonusId[];
	const legacyId = Object.entries(PLAYER_SEASON_ID_ALIASES).find(([, id]) => id === seasonId)?.[0];
	return (legacyId ? traits[legacyId] : undefined) ?? [];
}

function orgYearIdForSeason(
	dataset: Dataset,
	playersById: ReadonlyMap<string, Dataset["playerSeasons"][number]>,
	seasonId: string,
): string | null {
	const season = playersById.get(seasonId);
	if (!season) return null;
	const match = dataset.orgYears.find(
		(orgYear) =>
			orgYear.playerSeasonIds.includes(season.id) ||
			(orgYear.orgId === season.orgId && orgYear.year === season.year),
	);
	return match?.id ?? null;
}

export function completedDraftFromSnapshot(
	snapshot: SavedTeamSnapshot,
	dataset: Dataset,
): CompletedDraft | null {
	const coachId = resolveCoachId(snapshot.coachId);
	if (!dataset.coaches.some((coach) => coach.id === coachId)) return null;
	const playersById = indexPlayerSeasons(dataset.playerSeasons);
	const orgYearsById = new Map(dataset.orgYears.map((orgYear) => [orgYear.id, orgYear]));
	const roster = {} as CompletedDraft["roster"];
	const used = new Set<string>();

	for (const role of ROLES) {
		const player = playersById.get(snapshot.roster[role]);
		if (!player || used.has(player.id)) return null;
		used.add(player.id);
		const orgYearId = orgYearIdForSeason(dataset, playersById, player.id);
		if (!orgYearId) return null;
		roster[role] = {
			orgYearId,
			playerSeasonId: player.id,
			role,
			fit: roleFit(player, role),
		};
	}

	const byOrgYear = new Map<string, { role: Role; seasonId: string }[]>();
	for (const role of ROLES) {
		const pick = roster[role];
		const rows = byOrgYear.get(pick.orgYearId) ?? [];
		rows.push({ role, seasonId: pick.playerSeasonId });
		byOrgYear.set(pick.orgYearId, rows);
	}

	const cards: CompletedDraft["cards"] = [...byOrgYear.entries()].flatMap(([orgYearId, rows]) => {
		const orgYear = orgYearsById.get(orgYearId);
		if (!orgYear) return [];
		return [
			{
				orgYearId,
				majorId: orgYear.majorId ?? null,
				kind: orgYear.kind,
				tier: orgYear.tier,
				players: rows.map((row) => ({
					id: row.seasonId,
					primaryRole: playersById.get(row.seasonId)?.primaryRole ?? row.role,
					roles: playersById.get(row.seasonId)?.roles ?? [row.role],
					revealedTraitIds: traitsForSnapshot(snapshot.traits, row.seasonId),
				})),
			},
		];
	});

	if (cards.length === 0) return null;
	return {
		seed: snapshot.seed >>> 0,
		cards,
		roster,
		coachId,
	};
}
