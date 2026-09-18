import { type Dataset, ROLES, type Role } from "../data/schema";
import type { BonusId } from "../engine/bonuses";
import type { CompletedDraft } from "../engine/draft";
import { roleFit } from "../engine/draft";
import type { SavedTeamSnapshot } from "./schema";

function orgYearIdForSeason(dataset: Dataset, seasonId: string): string | null {
	const season = dataset.playerSeasons.find((player) => player.id === seasonId);
	if (!season) return null;
	const match = dataset.orgYears.find(
		(orgYear) =>
			orgYear.playerSeasonIds.includes(seasonId) ||
			(orgYear.orgId === season.orgId && orgYear.year === season.year),
	);
	return match?.id ?? null;
}

export function completedDraftFromSnapshot(
	snapshot: SavedTeamSnapshot,
	dataset: Dataset,
): CompletedDraft | null {
	if (!dataset.coaches.some((coach) => coach.id === snapshot.coachId)) return null;
	const playersById = new Map(dataset.playerSeasons.map((player) => [player.id, player]));
	const orgYearsById = new Map(dataset.orgYears.map((orgYear) => [orgYear.id, orgYear]));
	const roster = {} as CompletedDraft["roster"];
	const used = new Set<string>();

	for (const role of ROLES) {
		const playerSeasonId = snapshot.roster[role];
		if (used.has(playerSeasonId)) return null;
		used.add(playerSeasonId);
		const player = playersById.get(playerSeasonId);
		const orgYearId = orgYearIdForSeason(dataset, playerSeasonId);
		if (!player || !orgYearId) return null;
		roster[role] = {
			orgYearId,
			playerSeasonId,
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
					revealedTraitIds: (snapshot.traits[row.seasonId] ?? []) as BonusId[],
				})),
			},
		];
	});

	if (cards.length === 0) return null;
	return {
		seed: snapshot.seed >>> 0,
		cards,
		roster,
		coachId: snapshot.coachId,
	};
}
