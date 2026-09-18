import type { Coach, Dataset } from "../../data/schema";
import { isLegendaryCoach, ROLES, type Role } from "../../data/schema";
import { revealTraits } from "../bonuses";
import { createRng, type IntRng, pickWeighted, shuffle } from "../rng";
import { DraftError, type DraftResult, fail, ok } from "./error";
import { roleFit } from "./fit";
import type {
	CompletedDraft,
	DraftAction,
	DraftablePlayer,
	DraftState,
	MovePlayerAction,
	PickCoachAction,
	PickPlayerAction,
	PlayerPick,
	RolledOrgYearCard,
} from "./types";
import { COACH_CANDIDATE_COUNT, orgYearWeight, PLAYER_CARD_COUNT, REROLL_BUDGET } from "./weights";

function snapshotPlayer(
	season: Dataset["playerSeasons"][number],
	seed: number,
	round: number,
	rerollIndex: number,
): DraftablePlayer {
	return {
		id: season.id,
		primaryRole: season.primaryRole,
		roles: [...season.roles],
		revealedTraitIds: revealTraits(seed, round, rerollIndex, season.id),
	};
}

function snapshotCard(
	orgYear: Dataset["orgYears"][number],
	seasons: Map<string, Dataset["playerSeasons"][number]>,
	seed: number,
	round: number,
	rerollIndex: number,
): RolledOrgYearCard {
	const players = orgYear.playerSeasonIds.map((id) => {
		const season = seasons.get(id);
		if (!season) {
			throw new DraftError(
				"missing_player",
				`org-year "${orgYear.id}" references missing player-season "${id}"`,
			);
		}
		return snapshotPlayer(season, seed, round, rerollIndex);
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

function shownRosterIds(state: DraftState, round: number): Set<string> {
	return new Set(state.cards.filter((_, index) => index !== round).map((card) => card.orgYearId));
}

export function otherMajorAppearances(
	state: DraftState,
	dataset: Dataset,
): Dataset["orgYears"][number][] {
	if (state.phase.type !== "player") return [];
	const current = state.cards[state.phase.round];
	if (!current) return [];
	const orgId = dataset.orgYears.find((roster) => roster.id === current.orgYearId)?.orgId;
	if (!orgId) return [];
	const shown = shownRosterIds(state, state.phase.round);
	return dataset.orgYears.filter(
		(roster) =>
			roster.orgId === orgId &&
			roster.kind === "major" &&
			roster.id !== current.orgYearId &&
			!shown.has(roster.id),
	);
}

export function canRerollMajor(state: DraftState, dataset: Dataset): boolean {
	return state.rerolls.majorRemaining > 0 && otherMajorAppearances(state, dataset).length > 0;
}

export function sampleCoachIds(
	coaches: readonly Coach[],
	rng: IntRng,
	count = COACH_CANDIDATE_COUNT,
): string[] {
	const legendary = coaches
		.filter((coach) => isLegendaryCoach(coach))
		.map((coach) => coach.id)
		.sort((left, right) => left.localeCompare(right));
	const rest = shuffle(
		coaches.filter((coach) => !isLegendaryCoach(coach)).map((coach) => coach.id),
		rng,
	);
	return [...legendary, ...rest].slice(0, count);
}

export function startDraft(dataset: Dataset, seed: number | string): DraftState {
	if (dataset.coaches.length < COACH_CANDIDATE_COUNT) {
		throw new DraftError(
			"insufficient_coaches",
			`need at least ${COACH_CANDIDATE_COUNT} coaches for the sixth round, got ${dataset.coaches.length}`,
		);
	}
	const rng = createRng(seed);
	const seasons = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
	const cards = initialRosters(dataset, rng).map((orgYear, round) =>
		snapshotCard(orgYear, seasons, rng.seed, round, 0),
	);
	const coachIds = sampleCoachIds(dataset.coaches, rng);
	return {
		seed: rng.seed,
		phase: { type: "player", round: 0 },
		cards,
		coachIds,
		rerolls: { majorRemaining: REROLL_BUDGET, teamRemaining: REROLL_BUDGET },
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
	const remaining = state.rerolls[budgetKey];
	if (remaining <= 0) {
		return fail("reroll_exhausted", `${type} rerolls are exhausted`);
	}
	if (!dataset) {
		return fail("reroll_unavailable", "reroll requires the current historical dataset");
	}
	const round = state.phase.round;
	const current = state.cards[round];
	if (!current) return fail("reroll_unavailable", "current draft card is missing");
	const usedRosterIds = shownRosterIds(state, round);
	const rng = createRng(`${state.seed}:reroll-${type}:${round}:${REROLL_BUDGET - remaining}`);
	const candidates =
		type === "team"
			? dataset.orgYears.filter(
					(roster) =>
						(roster.majorId ?? null) === current.majorId &&
						roster.kind === current.kind &&
						roster.id !== current.orgYearId &&
						!usedRosterIds.has(roster.id),
				)
			: otherMajorAppearances(state, dataset);
	if (candidates.length === 0) {
		return fail(
			"reroll_unavailable",
			type === "major"
				? "this team has no other Major appearance"
				: "no alternative team card remains",
		);
	}
	const seasons = new Map(dataset.playerSeasons.map((season) => [season.id, season]));
	const replacement = snapshotCard(
		pickRoster(candidates, rng),
		seasons,
		state.seed,
		round,
		REROLL_BUDGET - remaining + 1,
	);
	const cards = state.cards.map((card, index) => (index === round ? replacement : card));
	return ok({
		...state,
		cards,
		rerolls: { ...state.rerolls, [budgetKey]: remaining - 1 },
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

function draftableForPick(state: DraftState, pick: PlayerPick): DraftablePlayer | undefined {
	const card = state.cards.find((row) => row.orgYearId === pick.orgYearId);
	return card?.players.find((player) => player.id === pick.playerSeasonId);
}

function reseatPick(pick: PlayerPick, role: Role, player: DraftablePlayer): PlayerPick {
	return { ...pick, role, fit: roleFit(player, role) };
}

function movePlayer(state: DraftState, action: MovePlayerAction): DraftResult<DraftState> {
	const source = ROLES.find((role) => state.roster[role]?.playerSeasonId === action.playerSeasonId);
	if (!source) {
		return fail(
			"player_not_on_roster",
			`player-season "${action.playerSeasonId}" is not on the live roster`,
		);
	}
	if (source === action.role) {
		return ok(state);
	}
	const moving = state.roster[source];
	if (!moving) {
		return fail(
			"player_not_on_roster",
			`player-season "${action.playerSeasonId}" is not on the live roster`,
		);
	}
	const movingPlayer = draftableForPick(state, moving);
	if (!movingPlayer) {
		return fail("missing_player", `draft card for "${moving.orgYearId}" is missing that player`);
	}
	const occupant = state.roster[action.role];
	const roster: DraftState["roster"] = { ...state.roster };
	if (occupant) {
		const occupantPlayer = draftableForPick(state, occupant);
		if (!occupantPlayer) {
			return fail(
				"missing_player",
				`draft card for "${occupant.orgYearId}" is missing that player`,
			);
		}
		roster[source] = reseatPick(occupant, source, occupantPlayer);
		roster[action.role] = reseatPick(moving, action.role, movingPlayer);
	} else {
		delete roster[source];
		roster[action.role] = reseatPick(moving, action.role, movingPlayer);
	}
	return ok({ ...state, roster });
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
		case "movePlayer":
			return movePlayer(state, action);
		case "pickCoach":
			return pickCoach(state, action);
		case "rerollMajor":
			return rerollCard(state, dataset, "major");
		case "rerollTeam":
			return rerollCard(state, dataset, "team");
	}
}
