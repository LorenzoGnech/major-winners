import type { Dataset } from "../../data/schema";
import { ROLES, type Role } from "../../data/schema";
import { createRng, pickWeighted, shuffle } from "../rng";
import { DraftError, type DraftResult, fail, ok } from "./error";
import { roleFit } from "./fit";
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
import { orgYearWeight, PLAYER_CARD_COUNT } from "./weights";

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
		majorId: orgYear.majorId ?? null,
		kind: orgYear.kind,
		tier: orgYear.tier,
		players,
	};
}

function pickRoster<T extends Dataset["orgYears"][number]>(
	rosters: readonly T[],
	rng: ReturnType<typeof createRng>,
): T {
	if (rosters.length === 0) {
		throw new DraftError("insufficient_org_years", "selected Major has no playable rosters");
	}
	return pickWeighted(rosters, (roster) => orgYearWeight(roster.tier), rng);
}

function initialRosters(dataset: Dataset, rng: ReturnType<typeof createRng>) {
	if (dataset.majors.length < PLAYER_CARD_COUNT) {
		throw new DraftError(
			"insufficient_org_years",
			`need ${PLAYER_CARD_COUNT} Majors to roll player cards, got ${dataset.majors.length}`,
		);
	}
	const majors = shuffle(dataset.majors, rng);
	const legacy = dataset.orgYears.filter((roster) => roster.kind === "legacy");
	const picked: Dataset["orgYears"][number][] = [];
	let usedLegacy = false;
	for (let round = 0; round < PLAYER_CARD_COUNT; round++) {
		const shouldUseLegacy = !usedLegacy && legacy.length > 0 && rng.nextInt(20) === 0;
		if (shouldUseLegacy) {
			const card = pickRoster(
				legacy.filter((roster) => !picked.some((pickedRoster) => pickedRoster.id === roster.id)),
				rng,
			);
			picked.push(card);
			usedLegacy = true;
			continue;
		}
		const major = majors[round];
		const rosters = dataset.orgYears.filter((roster) => roster.majorId === major.id);
		picked.push(pickRoster(rosters, rng));
	}
	return picked;
}

export function startDraft(dataset: Dataset, seed: number | string): DraftState {
	if (dataset.coaches.length === 0) {
		throw new DraftError("insufficient_coaches", "need at least one coach for the sixth round");
	}
	const rng = createRng(seed);
	const seasons = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
	const cards = initialRosters(dataset, rng).map((orgYear) => snapshotCard(orgYear, seasons));
	const coachIds = shuffle(
		dataset.coaches.map((coach) => coach.id),
		rng,
	);
	return {
		seed: rng.seed,
		phase: { type: "player", round: 0 },
		cards,
		coachIds,
		rerolls: { majorRemaining: true, teamRemaining: true },
		roster: {},
		coachId: null,
	};
}

function rerollCard(
	state: DraftState,
	dataset: Dataset | undefined,
	type: "major" | "team",
): DraftResult<DraftState> {
	if (state.phase.type !== "player") {
		return fail("invalid_phase", "rerolls are only legal before a player pick");
	}
	const budgetKey = type === "major" ? "majorRemaining" : "teamRemaining";
	if (!state.rerolls[budgetKey]) {
		return fail("reroll_exhausted", `${type} reroll has already been used`);
	}
	if (!dataset) {
		return fail("reroll_unavailable", "reroll requires the current historical dataset");
	}
	const round = state.phase.round;
	const current = state.cards[round];
	if (!current) return fail("reroll_unavailable", "current draft card is missing");
	const otherCards = state.cards.filter((_, index) => index !== round);
	const shownRosterIds = new Set(otherCards.map((card) => card.orgYearId));
	const rng = createRng(`${state.seed}:reroll-${type}:${round}`);
	let candidates: Dataset["orgYears"];
	if (type === "team") {
		candidates = dataset.orgYears.filter(
			(roster) =>
				(roster.majorId ?? null) === current.majorId &&
				roster.kind === current.kind &&
				roster.id !== current.orgYearId &&
				!shownRosterIds.has(roster.id),
		);
	} else {
		const usedMajorIds = new Set(otherCards.map((card) => card.majorId).filter(Boolean));
		const majors = dataset.majors.filter(
			(major) => major.id !== current.majorId && !usedMajorIds.has(major.id),
		);
		if (majors.length === 0) {
			return fail("reroll_unavailable", "no different Major remains");
		}
		const major = majors[rng.nextInt(majors.length)];
		candidates = dataset.orgYears.filter(
			(roster) => roster.majorId === major.id && !shownRosterIds.has(roster.id),
		);
	}
	if (candidates.length === 0) {
		return fail("reroll_unavailable", `no alternative ${type} card remains`);
	}
	const seasons = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
	const replacement = snapshotCard(pickRoster(candidates, rng), seasons);
	const cards = state.cards.map((card, index) => (index === round ? replacement : card));
	return ok({
		...state,
		cards,
		rerolls: { ...state.rerolls, [budgetKey]: false },
	});
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

export function applyAction(
	state: DraftState,
	action: DraftAction,
	dataset?: Dataset,
): DraftResult<DraftState> {
	switch (action.type) {
		case "pickPlayer":
			return pickPlayer(state, action);
		case "pickCoach":
			return pickCoach(state, action);
		case "rerollMajor":
			return rerollCard(state, dataset, "major");
		case "rerollTeam":
			return rerollCard(state, dataset, "team");
	}
}
