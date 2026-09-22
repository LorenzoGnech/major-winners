import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { ROLES, type Role } from "../../data/schema";
import { createRng } from "../rng";
import type { DraftState, SampleableOrgYear } from "./index";
import {
	applyAction,
	COACH_CANDIDATE_COUNT,
	canRerollMajor,
	currentCard,
	DraftError,
	emptyRoles,
	getCompletedDraft,
	LEGENDARY_COACH_ODDS,
	otherMajorAppearances,
	PLAYER_CARD_COUNT,
	ROLE_FIT,
	roleFit,
	sampleCoachIds,
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
		expect(TIER_WEIGHTS).toEqual({ legendary: 4, strong: 3, cult: 1 });
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
		expect(a.coachIds).toHaveLength(COACH_CANDIDATE_COUNT);
		expect(new Set(a.coachIds).size).toBe(COACH_CANDIDATE_COUNT);
		expect(a.coachIds.every((id) => dataset.coaches.some((coach) => coach.id === id))).toBe(true);
		for (const card of a.cards) {
			expect(card.players).toHaveLength(5);
		}
		expect(a.cards.map((card) => card.players.map((player) => player.revealedTraitIds))).toEqual(
			b.cards.map((card) => card.players.map((player) => player.revealedTraitIds)),
		);
	});

	it("rarely offers legendary coaches in the sixth-round slate", () => {
		const coaches = [
			{ id: "jabich", tier: "legendary" as const },
			{ id: "alpha" },
			{ id: "bravo" },
			{ id: "charlie" },
			{ id: "delta" },
			{ id: "echo" },
		];
		const rng = (first: number) => {
			let calls = 0;
			return {
				nextInt: (maxExclusive: number) => {
					calls += 1;
					if (calls === 1) {
						expect(maxExclusive).toBe(LEGENDARY_COACH_ODDS);
						return first;
					}
					return 0;
				},
			};
		};
		const offered = sampleCoachIds(coaches, rng(0));
		expect(offered[0]).toBe("jabich");
		expect(new Set(offered).size).toBe(COACH_CANDIDATE_COUNT);

		const missed = sampleCoachIds(coaches, rng(1));
		expect(missed).not.toContain("jabich");
		expect(new Set(missed).size).toBe(COACH_CANDIDATE_COUNT);
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
	it("offers two deterministic Major rerolls and two team rerolls", () => {
		const initial = startDraft(dataset, "two-rerolls");
		expect(initial.rerolls).toEqual({ majorRemaining: 2, teamRemaining: 2 });
		const original = currentCard(initial);
		expect(original?.majorId).not.toBeNull();

		const teamResult = applyAction(initial, { type: "rerollTeam" }, dataset);
		expect(teamResult.ok).toBe(true);
		if (!teamResult.ok || !original) return;
		const afterTeam = currentCard(teamResult.value);
		expect(afterTeam?.majorId).toBe(original.majorId);
		expect(afterTeam?.orgYearId).not.toBe(original.orgYearId);
		expect(teamResult.value.rerolls).toEqual({
			majorRemaining: 2,
			teamRemaining: 1,
		});

		const secondTeam = applyAction(teamResult.value, { type: "rerollTeam" }, dataset);
		expect(secondTeam.ok).toBe(true);
		if (!secondTeam.ok) return;
		const afterSecondTeam = currentCard(secondTeam.value);
		expect(afterSecondTeam?.majorId).toBe(original.majorId);
		expect(afterSecondTeam?.orgYearId).not.toBe(afterTeam?.orgYearId);
		expect(secondTeam.value.rerolls).toEqual({
			majorRemaining: 2,
			teamRemaining: 0,
		});

		const repeatTeam = applyAction(secondTeam.value, { type: "rerollTeam" }, dataset);
		expect(repeatTeam.ok).toBe(false);
		if (!repeatTeam.ok) expect(repeatTeam.error.code).toBe("reroll_exhausted");

		const majorResult = applyAction(secondTeam.value, { type: "rerollMajor" }, dataset);
		expect(majorResult.ok).toBe(true);
		if (!majorResult.ok) return;
		const afterMajor = currentCard(majorResult.value);
		expect(afterMajor?.majorId).not.toBe(afterSecondTeam?.majorId);
		expect(dataset.orgYears.find((roster) => roster.id === afterMajor?.orgYearId)?.orgId).toBe(
			dataset.orgYears.find((roster) => roster.id === afterSecondTeam?.orgYearId)?.orgId,
		);
		expect(majorResult.value.rerolls).toEqual({
			majorRemaining: 1,
			teamRemaining: 0,
		});

		const secondMajor = applyAction(majorResult.value, { type: "rerollMajor" }, dataset);
		expect(secondMajor.ok).toBe(true);
		if (!secondMajor.ok) return;
		expect(currentCard(secondMajor.value)?.majorId).not.toBe(
			currentCard(majorResult.value)?.majorId,
		);
		expect(secondMajor.value.rerolls).toEqual({
			majorRemaining: 0,
			teamRemaining: 0,
		});

		const exhaustedMajor = applyAction(secondMajor.value, { type: "rerollMajor" }, dataset);
		expect(exhaustedMajor.ok).toBe(false);
		if (!exhaustedMajor.ok) expect(exhaustedMajor.error.code).toBe("reroll_exhausted");

		let replay = startDraft(dataset, "two-rerolls");
		for (const action of [
			{ type: "rerollTeam" as const },
			{ type: "rerollTeam" as const },
			{ type: "rerollMajor" as const },
			{ type: "rerollMajor" as const },
		]) {
			const next = applyAction(replay, action, dataset);
			expect(next.ok).toBe(true);
			if (!next.ok) return;
			replay = next.value;
		}
		expect(replay).toEqual(secondMajor.value);
	});

	it("keeps the org on a Major reroll and refuses a one-Major team", () => {
		const navi = dataset.orgYears.filter(
			(roster) => roster.orgId === "navi" && roster.kind === "major",
		);
		expect(navi.length).toBeGreaterThan(2);
		const opened = startDraft(dataset, "same-org-major");
		const naviCard = {
			orgYearId: navi[0].id,
			majorId: navi[0].majorId ?? null,
			kind: navi[0].kind,
			tier: navi[0].tier,
			players: navi[0].playerSeasonIds.map((id) => {
				const season = dataset.playerSeasons.find((row) => row.id === id);
				if (!season) throw new Error(id);
				return {
					id: season.id,
					playerId: season.playerId,
					primaryRole: season.primaryRole,
					roles: [...season.roles],
				};
			}),
		};
		const withNavi: DraftState = {
			...opened,
			cards: opened.cards.map((card, index) =>
				index === 0 ? naviCard : card.orgYearId === navi[0].id ? opened.cards[0] : card,
			),
		};
		expect(canRerollMajor(withNavi, dataset)).toBe(true);
		const rerolled = applyAction(withNavi, { type: "rerollMajor" }, dataset);
		expect(rerolled.ok).toBe(true);
		if (!rerolled.ok) return;
		const next = currentCard(rerolled.value);
		expect(next?.orgYearId).not.toBe(navi[0].id);
		expect(dataset.orgYears.find((roster) => roster.id === next?.orgYearId)?.orgId).toBe("navi");
		expect(next?.majorId).not.toBe(navi[0].majorId);

		const singleton = dataset.orgYears.find(
			(roster) =>
				roster.kind === "major" &&
				dataset.orgYears.filter((row) => row.orgId === roster.orgId && row.kind === "major")
					.length === 1,
		);
		if (!singleton) throw new Error("expected a one-Major org");
		const singletonCard = {
			orgYearId: singleton.id,
			majorId: singleton.majorId ?? null,
			kind: singleton.kind,
			tier: singleton.tier,
			players: singleton.playerSeasonIds.map((id) => {
				const season = dataset.playerSeasons.find((row) => row.id === id);
				if (!season) throw new Error(id);
				return {
					id: season.id,
					playerId: season.playerId,
					primaryRole: season.primaryRole,
					roles: [...season.roles],
				};
			}),
		};
		const withSingleton: DraftState = {
			...opened,
			cards: opened.cards.map((card, index) =>
				index === 0 ? singletonCard : card.orgYearId === singleton.id ? opened.cards[0] : card,
			),
		};
		expect(otherMajorAppearances(withSingleton, dataset)).toEqual([]);
		expect(canRerollMajor(withSingleton, dataset)).toBe(false);
		const refused = applyAction(withSingleton, { type: "rerollMajor" }, dataset);
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.error.code).toBe("reroll_unavailable");
		expect(withSingleton.rerolls.majorRemaining).toBe(2);
	});

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

	it("moves a placed player to an empty role without advancing the round", () => {
		const opened = startDraft(dataset, "move-empty");
		const first = unwrap(opened, {
			type: "pickPlayer",
			playerSeasonId: opened.cards[0].players[0].id,
			role: "awp",
		});
		expect(first.phase).toEqual({ type: "player", round: 1 });
		const moved = unwrap(first, {
			type: "movePlayer",
			playerSeasonId: opened.cards[0].players[0].id,
			role: "lurker",
		});
		expect(moved.phase).toEqual({ type: "player", round: 1 });
		expect(moved.roster.awp).toBeUndefined();
		expect(moved.roster.lurker?.playerSeasonId).toBe(opened.cards[0].players[0].id);
		expect(moved.roster.lurker?.role).toBe("lurker");
	});

	it("swaps two placed players and recalculates fit", () => {
		const opened = startDraft(dataset, "move-swap");
		const firstId = opened.cards[0].players[0].id;
		const secondId = opened.cards[1].players[0].id;
		const afterFirst = unwrap(opened, {
			type: "pickPlayer",
			playerSeasonId: firstId,
			role: "awp",
		});
		const afterSecond = unwrap(afterFirst, {
			type: "pickPlayer",
			playerSeasonId: secondId,
			role: "igl",
		});
		const swapped = unwrap(afterSecond, {
			type: "movePlayer",
			playerSeasonId: firstId,
			role: "igl",
		});
		expect(swapped.phase).toEqual(afterSecond.phase);
		expect(swapped.roster.igl?.playerSeasonId).toBe(firstId);
		expect(swapped.roster.awp?.playerSeasonId).toBe(secondId);
		const firstPlayer = opened.cards[0].players[0];
		const secondPlayer = opened.cards[1].players[0];
		expect(swapped.roster.igl?.fit).toBe(roleFit(firstPlayer, "igl"));
		expect(swapped.roster.awp?.fit).toBe(roleFit(secondPlayer, "awp"));
	});

	it("refuses to pick a player whose career is already rostered under a different season", () => {
		const opened = startDraft(dataset, "duplicate-career");
		const shared: DraftState = {
			...opened,
			phase: { type: "player", round: 1 },
			cards: [
				{
					orgYearId: "test-org-a",
					majorId: null,
					kind: "major",
					tier: "strong",
					players: [
						{ id: "donk-2021-natus-vincere", playerId: "donk", primaryRole: "igl", roles: ["igl"] },
					],
				},
				{
					orgYearId: "test-org-b",
					majorId: null,
					kind: "major",
					tier: "strong",
					players: [
						{ id: "donk-2024-natus-vincere", playerId: "donk", primaryRole: "igl", roles: ["igl"] },
					],
				},
			],
			roster: {
				awp: {
					orgYearId: "test-org-a",
					playerSeasonId: "donk-2021-natus-vincere",
					role: "awp",
					fit: 1,
				},
			},
		};
		const snapshot = structuredClone(shared);
		const result = applyAction(shared, {
			type: "pickPlayer",
			playerSeasonId: "donk-2024-natus-vincere",
			role: "igl",
		});
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.error.code).toBe("duplicate_player");
		expect(shared).toEqual(snapshot);
	});

	it("does not mutate when moving a player who is not on the roster", () => {
		const opened = startDraft(dataset, "move-missing");
		const snapshot = structuredClone(opened);
		const result = applyAction(opened, {
			type: "movePlayer",
			playerSeasonId: opened.cards[0].players[0].id,
			role: "awp",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("player_not_on_roster");
		}
		expect(opened).toEqual(snapshot);
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
