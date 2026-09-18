import type { Dataset } from "../data/schema";
import type { RatedPlayer } from "../engine/ratings/rate";
import { buildTeamProfile } from "../engine/team";
import type { HistoricalOpponent } from "../engine/tournament/types";
import { completedDraftFromSnapshot } from "./draft";
import type { SavedTeamSnapshot } from "./schema";

export function buildCommunityOpponents(
	snapshots: readonly SavedTeamSnapshot[],
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
): HistoricalOpponent[] {
	const coachesById = new Map(dataset.coaches.map((coach) => [coach.id, coach]));
	const opponents: HistoricalOpponent[] = [];
	for (const snapshot of snapshots) {
		const draft = completedDraftFromSnapshot(snapshot, dataset);
		const coach = coachesById.get(snapshot.coachId);
		if (!draft || !coach) continue;
		opponents.push({
			id: snapshot.id,
			label: `${snapshot.teamName} · ${snapshot.authorName}`,
			source: "community",
			org: {
				id: `community:${snapshot.id}`,
				name: snapshot.teamName,
			},
			profile: buildTeamProfile({
				draft,
				playerSeasons: dataset.playerSeasons,
				ratedPlayers,
				coach,
			}),
		});
	}
	return opponents.sort(
		(left, right) =>
			left.profile.overall - right.profile.overall || left.id.localeCompare(right.id),
	);
}

export function mergeOpponentPools(
	community: readonly HistoricalOpponent[],
	historical: readonly HistoricalOpponent[],
): HistoricalOpponent[] {
	return [...community, ...historical].sort(
		(left, right) =>
			left.profile.overall - right.profile.overall || left.id.localeCompare(right.id),
	);
}

export function teamOverallFromSnapshot(
	snapshot: SavedTeamSnapshot,
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
): number | null {
	const [opponent] = buildCommunityOpponents([snapshot], dataset, ratedPlayers);
	return opponent?.profile.overall ?? null;
}
