import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { ROLES, type Role } from "../../data/schema";
import { createRng } from "../rng";
import type { DraftState, SampleableOrgYear } from "./index";
import {
	applyAction,
	currentCard,
	DraftError,
	emptyRoles,
	getCompletedDraft,
	PLAYER_CARD_COUNT,
	ROLE_FIT,
	roleFit,
	sampleOrgYears,
	startDraft,
	TIER_WEIGHTS,
} from "./index";

const dataset = loadDataset();

function unwrap(state: DraftState, action: Parameters<typeof applyAction>[1]): DraftState {
	const result = applyAction(state, action);
	if (!result.ok) {
		throw result.error;
	}
	return result.value;
}

function completeDraft(
	seed: number | string,
	assign: (round: number, state: DraftState) => Role,
): DraftState {
	let state = startDraft(dataset, seed);
	for (let round = 0; round < PLAYER_CARD_COUNT; round++) {
		const card = currentCard(state);
		if (!card || state.phase.type !== "player") {
			throw new Error("expected a player phase");
		}
		state = unwrap(state, {
			type: "pickPlayer",
			playerSeasonId: card.players[0].id,
			role: assign(round, state),
		});
	}
	return unwrap(state, { type: "pickCoach", coachId: state.coachIds[0] });
}

describe("roleFit", () => {
	it("uses primary 1.0, listed secondary 0.9, and off-role 0.75", () => {
		const heaton = { primaryRole: "awp" as const, roles: ["awp", "entry"] as Role[] };
		expect(roleFit(heaton, "awp")).toBe(ROLE_FIT.primary);
		expect(roleFit(heaton, "entry")).toBe(ROLE_FIT.secondary);
		expect(roleFit(heaton, "lurker")).toBe(ROLE_FIT.offRole);
		expect(ROLE_FIT).toEqual({ primary: 1, secondary: 0.9, offRole: 0.75 });
	});
});

describe("sampleOrgYears", () => {
	it("never repeats an org-year and honors documented tier weights", () => {
		expect(TIER_WEIGHTS).toEqual({ legendary: 5, strong: 3, cult: 1 });
		const pool: SampleableOrgYear[] = [
			{ id: "cult-a", tier: "cult" },
			{ id: "strong-a", tier: "strong" },
			{ id: "leg-a", tier: "legendary" },
			{ id: "leg-b", tier: "legendary" },
			{ id: "leg-c", tier: "legendary" },
			{ id: "leg-d", tier: "legendary" },
		];
		const alwaysFirstTicket = { nextInt: () => 0 };
		const picked = sampleOrgYears(pool, alwaysFirstTicket, 5).map((row) => row.id);
		expect(picked).toEqual(["cult-a", "strong-a", "leg-a", "leg-b", "leg-c"]);
		expect(new Set(picked).size).toBe(5);
	});

	it("throws DraftError when the pool is too small", () => {
		expect(() => sampleOrgYears([{ id: "only", tier: "cult" }], createRng(1), 5)).toThrow(
			DraftError,
		);
	});
});

describe("startDraft", () => {
	it("rolls the same five distinct org-years and coach order for the same seed", () => {
		const a = startDraft(dataset, "share-code");
		const b = startDraft(dataset, "share-code");
		expect(a.seed).toBe(b.seed);
		expect(a.cards.map((card) => card.orgYearId)).toEqual(b.cards.map((card) => card.orgYearId));
		expect(a.coachIds).toEqual(b.coachIds);
		expect(new Set(a.cards.map((card) => card.orgYearId)).size).toBe(PLAYER_CARD_COUNT);
		expect(a.cards).toHaveLength(PLAYER_CARD_COUNT);
		expect(a.coachIds).toHaveLength(dataset.coaches.length);
		expect(new Set(a.coachIds)).toEqual(new Set(dataset.coaches.map((coach) => coach.id)));
		for (const card of a.cards) {
			expect(card.players).toHaveLength(5);
		}
	});

	it("changes the rolled sequence when the seed changes", () => {
		const a = startDraft(dataset, 1);
		const b = startDraft(dataset, 2);
		const key = (state: DraftState) =>
			`${state.cards.map((card) => card.orgYearId).join(",")}|${state.coachIds.join(",")}`;
		expect(key(a)).not.toBe(key(b));
	});
});

describe("applyAction", () => {
	it("allows off-role picks and yields a valid completed roster", () => {
		const state = completeDraft("off-role-legal", (_round, current) => {
			const player = currentCard(current)?.players[0];
			const empty = emptyRoles(current);
			if (!player) {
				return empty[0] ?? "awp";
			}
			return (
				empty.find((role) => !player.roles.includes(role)) ??
				empty.find((role) => role !== player.primaryRole) ??
				empty[0] ??
				"awp"
			);
		});
		const completed = getCompletedDraft(state);
		expect(completed).not.toBeNull();
		if (!completed) {
			return;
		}
		expect(new Set(ROLES.map((role) => completed.roster[role].playerSeasonId)).size).toBe(5);
		expect(new Set(ROLES.map((role) => completed.roster[role].orgYearId)).size).toBe(5);
		expect(completed.coachId).toBe(state.coachIds[0]);
		expect(state.phase).toEqual({ type: "complete" });
		expect(Object.values(completed.roster).some((pick) => pick.fit === ROLE_FIT.offRole)).toBe(
			true,
		);
	});

	it("does not mutate when the player is not on the current card", () => {
		const state = startDraft(dataset, "wrong-card");
		const other = state.cards[1].players[0].id;
		const snapshot = structuredClone(state);
		const result = applyAction(state, {
			type: "pickPlayer",
			playerSeasonId: other,
			role: "awp",
		});
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error).toBeInstanceOf(DraftError);
		expect(result.error.code).toBe("player_not_on_card");
		expect(state).toEqual(snapshot);
	});

	it("does not mutate when the role slot is already filled", () => {
		const opened = startDraft(dataset, "occupied");
		const firstCard = opened.cards[0];
		const afterFirst = unwrap(opened, {
			type: "pickPlayer",
			playerSeasonId: firstCard.players[0].id,
			role: "awp",
		});
		const snapshot = structuredClone(afterFirst);
		const result = applyAction(afterFirst, {
			type: "pickPlayer",
			playerSeasonId: afterFirst.cards[1].players[0].id,
			role: "awp",
		});
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("role_occupied");
		expect(afterFirst).toEqual(snapshot);
	});

	it("rejects a player pick during the coach phase and a coach pick during a player phase", () => {
		let state = startDraft(dataset, "phase-guard");
		const coachDuringPlayer = applyAction(state, { type: "pickCoach", coachId: state.coachIds[0] });
		expect(coachDuringPlayer.ok).toBe(false);
		if (!coachDuringPlayer.ok) {
			expect(coachDuringPlayer.error.code).toBe("invalid_phase");
		}

		for (let round = 0; round < PLAYER_CARD_COUNT; round++) {
			const card = currentCard(state);
			if (!card) {
				throw new Error("missing card");
			}
			state = unwrap(state, {
				type: "pickPlayer",
				playerSeasonId: card.players[0].id,
				role: ROLES[round],
			});
		}
		expect(state.phase).toEqual({ type: "coach" });
		const snapshot = structuredClone(state);
		const playerDuringCoach = applyAction(state, {
			type: "pickPlayer",
			playerSeasonId: state.cards[0].players[0].id,
			role: "awp",
		});
		expect(playerDuringCoach.ok).toBe(false);
		if (!playerDuringCoach.ok) {
			expect(playerDuringCoach.error.code).toBe("invalid_phase");
		}
		expect(state).toEqual(snapshot);

		const unknownCoach = applyAction(state, { type: "pickCoach", coachId: "not-a-coach" });
		expect(unknownCoach.ok).toBe(false);
		if (!unknownCoach.ok) {
			expect(unknownCoach.error.code).toBe("unknown_coach");
		}
		expect(state).toEqual(snapshot);
	});

	it("records primary vs off-role fit on the pick", () => {
		const state = startDraft(dataset, "fit-record");
		const card = state.cards[0];
		const awper = card.players.find((player) => player.primaryRole === "awp") ?? card.players[0];
		const next = unwrap(state, {
			type: "pickPlayer",
			playerSeasonId: awper.id,
			role: "lurker",
		});
		expect(next.roster.lurker?.fit).toBe(roleFit(awper, "lurker"));
		expect(next.roster.lurker?.fit).toBeLessThan(ROLE_FIT.primary);
	});
});
