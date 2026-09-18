import { ROLES } from "../data/schema";
import type { CompletedDraft } from "../engine/draft";
import type { TournamentRunSummary } from "../engine/tournament/summary";
import {
	type CommunityGameMode,
	type RosterSnapshot,
	rosterSnapshotSchema,
	type SavedTeamSnapshot,
	type TraitsSnapshot,
} from "./schema";

export function rosterFromDraft(draft: CompletedDraft): RosterSnapshot {
	return rosterSnapshotSchema.parse(
		Object.fromEntries(ROLES.map((role) => [role, draft.roster[role].playerSeasonId])),
	);
}

export function traitsFromDraft(draft: CompletedDraft): TraitsSnapshot {
	const traits: TraitsSnapshot = {};
	for (const card of draft.cards) {
		for (const player of card.players) {
			if (player.revealedTraitIds && player.revealedTraitIds.length > 0) {
				traits[player.id] = [...player.revealedTraitIds];
			}
		}
	}
	return traits;
}

export function snapshotDraftFields(draft: CompletedDraft): {
	seed: number;
	roster: RosterSnapshot;
	coachId: string;
	traits: TraitsSnapshot;
} {
	return {
		seed: draft.seed,
		roster: rosterFromDraft(draft),
		coachId: draft.coachId,
		traits: traitsFromDraft(draft),
	};
}

export type PublishTeamInput = {
	authorName: string;
	teamName: string;
	draft: CompletedDraft;
	userId: string | null;
};

export type PublishRunInput = {
	authorName: string;
	teamName: string;
	mode: CommunityGameMode;
	draft: CompletedDraft;
	summary: TournamentRunSummary;
	userId: string | null;
};

export function isSameSnapshotDraft(snapshot: SavedTeamSnapshot, draft: CompletedDraft): boolean {
	if (snapshot.coachId !== draft.coachId) return false;
	return ROLES.every((role) => snapshot.roster[role] === draft.roster[role].playerSeasonId);
}
