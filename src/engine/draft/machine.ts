import type { Dataset } from "../../data/schema";
import { ROLES, type Role } from "../../data/schema";
import { createRng, shuffle } from "../rng";
import { DraftError, type DraftResult, fail, ok } from "./error";
import { roleFit } from "./fit";
import { sampleOrgYears } from "./sample";
import type {
	CompletedDraft,
	DraftAction,
	DraftablePlayer,
	DraftState,
	PickCoachAction,
	PickPlayerAction,
	PlayerPick,
	RolledOrgYearCard,
} from "./types";
import { PLAYER_CARD_COUNT } from "./weights";

function snapshotPlayer(season: Dataset["playerSeasons"][number]): DraftablePlayer {
	return {
		id: season.id,
		primaryRole: season.primaryRole,
		roles: [...season.roles],
	};
}

function snapshotCard(
	orgYear: Dataset["orgYears"][number],
	seasons: Map<string, Dataset["playerSeasons"][number]>,
): RolledOrgYearCard {
	const players = orgYear.playerSeasonIds.map((id) => {
		const season = seasons.get(id);
		if (!season) {
			throw new DraftError(
				"missing_player",
				`org-year "${orgYear.id}" references missing player-season "${id}"`,
			);
		}
		return snapshotPlayer(season);
	});
	return {
		orgYearId: orgYear.id,
		tier: orgYear.tier,
		players,
	};
}

export function startDraft(dataset: Dataset, seed: number | string): DraftState {
	if (dataset.coaches.length === 0) {
		throw new DraftError("insufficient_coaches", "need at least one coach for the sixth round");
	}
	const rng = createRng(seed);
	const seasons = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
	const cards = sampleOrgYears(dataset.orgYears, rng).map((orgYear) =>
		snapshotCard(orgYear, seasons),
	);
	const coachIds = shuffle(
		dataset.coaches.map((coach) => coach.id),
		rng,
	);
	return {
		seed: rng.seed,
		phase: { type: "player", round: 0 },
		cards,
		coachIds,
		roster: {},
		coachId: null,
	};
}

export function currentCard(state: DraftState): RolledOrgYearCard | undefined {
	if (state.phase.type !== "player") {
		return undefined;
	}
	return state.cards[state.phase.round];
}

export function emptyRoles(state: DraftState): Role[] {
	return ROLES.filter((role) => state.roster[role] === undefined);
}

export function getCompletedDraft(state: DraftState): CompletedDraft | null {
	if (state.phase.type !== "complete" || state.coachId === null) {
		return null;
	}
	const roster = {} as Record<Role, PlayerPick>;
	for (const role of ROLES) {
		const pick = state.roster[role];
		if (!pick) {
			return null;
		}
		roster[role] = pick;
	}
	return {
		seed: state.seed,
		cards: state.cards,
		roster,
		coachId: state.coachId,
	};
}

function pickPlayer(state: DraftState, action: PickPlayerAction): DraftResult<DraftState> {
	if (state.phase.type !== "player") {
		return fail("invalid_phase", "player picks are only legal during a player round");
	}
	const card = state.cards[state.phase.round];
	if (!card) {
		return fail("invalid_phase", `no org-year card for player round ${state.phase.round}`);
	}
	const player = card.players.find((row) => row.id === action.playerSeasonId);
	if (!player) {
		return fail(
			"player_not_on_card",
			`player-season "${action.playerSeasonId}" is not on card "${card.orgYearId}"`,
		);
	}
	if (state.roster[action.role]) {
		return fail("role_occupied", `role slot "${action.role}" is already filled`);
	}

	const pick: PlayerPick = {
		orgYearId: card.orgYearId,
		playerSeasonId: player.id,
		role: action.role,
		fit: roleFit(player, action.role),
	};
	const roster = { ...state.roster, [action.role]: pick };
	const nextRound = state.phase.round + 1;
	const phase =
		nextRound >= PLAYER_CARD_COUNT
			? ({ type: "coach" } as const)
			: { type: "player" as const, round: nextRound };

	return ok({
		...state,
		phase,
		roster,
	});
}

function pickCoach(state: DraftState, action: PickCoachAction): DraftResult<DraftState> {
	if (state.phase.type !== "coach") {
		return fail("invalid_phase", "coach picks are only legal after the five player rounds");
	}
	if (!state.coachIds.includes(action.coachId)) {
		return fail("unknown_coach", `coach "${action.coachId}" is not in this draft's candidate pool`);
	}
	return ok({
		...state,
		phase: { type: "complete" },
		coachId: action.coachId,
	});
}

export function applyAction(state: DraftState, action: DraftAction): DraftResult<DraftState> {
	switch (action.type) {
		case "pickPlayer":
			return pickPlayer(state, action);
		case "pickCoach":
			return pickCoach(state, action);
	}
}
