import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { ratePlayers } from "../ratings/rate";
import {
	buildHistoricalOpponents,
	COMMUNITY_OVERALL_SLACK,
	createTournament,
	FINAL_OPPONENT_OVERALL_FLOOR,
	runNextMatch,
	SEMI_OPPONENT_OVERALL_CEILING,
	SEMI_OPPONENT_OVERALL_FLOOR,
} from ".";
import type { HistoricalOpponent, SeriesResolver } from "./types";

const dataset = loadDataset();
const opponents = buildHistoricalOpponents(dataset, ratePlayers(dataset.playerSeasons));
const playerTeam = opponents[0]?.profile;
if (!playerTeam) throw new Error("test dataset needs an opponent");

function forced(won: boolean): SeriesResolver {
	return ({ teams, seed, format }) => ({
		seed,
		format,
		teams,
		winner: won ? 0 : 1,
		score: won ? [format === "BO1" ? 1 : 2, 0] : [0, format === "BO1" ? 1 : 2],
		maps: [],
	});
}

function play(
	state: ReturnType<typeof createTournament>,
	won: boolean,
): ReturnType<typeof createTournament> {
	const result = runNextMatch(state, playerTeam, opponents, forced(won));
	if (!result.ok) throw result.error;
	return result.value;
}

describe("Major tournament runner", () => {
	it("indexes every historical roster by stable ascending strength", () => {
		expect(opponents).toHaveLength(dataset.orgYears.length);
		expect(opponents.every((opponent) => opponent.label.includes(" · "))).toBe(true);
		expect(
			opponents.every((opponent) => opponent.org.id === opponent.profile.members[0]?.orgId),
		).toBe(true);
		expect(opponents.some((opponent) => opponent.org.logo)).toBe(true);
		for (let index = 1; index < opponents.length; index++) {
			expect(opponents[index].profile.overall).toBeGreaterThanOrEqual(
				opponents[index - 1].profile.overall,
			);
		}
	});

	it("represents the exact 9-0 perfect path and playoff progression", () => {
		let state = createTournament({ rootSeed: 42, playerTeam, opponents });
		expect(state.nextMatch?.format).toBe("BO1");
		state = play(state, true);
		state = play(state, true);
		expect(state.nextMatch?.format).toBe("BO3");
		state = play(state, true);
		expect(state.stage).toBe("legends");
		expect(state.legends).toEqual({ wins: 0, losses: 0 });

		state = play(state, true);
		state = play(state, true);
		expect(state.nextMatch?.format).toBe("BO3");
		state = play(state, true);
		expect(state.stage).toBe("champions");
		expect(state.playoffRound).toBe("quarterfinal");

		state = play(state, true);
		expect(state.playoffRound).toBe("semifinal");
		state = play(state, true);
		expect(state.status).toBe("active");
		expect(state.playoffRound).toBe("final");
		state = play(state, true);
		expect(state.status).toBe("champion");
		expect(state.history).toHaveLength(9);
		expect(state.history.every((match) => match.won)).toBe(true);
		expect(state.nextMatch).toBeNull();
	});

	it("eliminates on a third Swiss loss and makes elimination matches BO3", () => {
		let state = createTournament({ rootSeed: 8, playerTeam, opponents });
		state = play(state, false);
		state = play(state, false);
		expect(state.nextMatch?.record).toEqual({ wins: 0, losses: 2 });
		expect(state.nextMatch?.format).toBe("BO3");
		state = play(state, false);
		expect(state.status).toBe("eliminated");
		expect(state.history).toHaveLength(3);
		expect(runNextMatch(state, playerTeam, opponents)).toMatchObject({
			ok: false,
			error: { code: "TOURNAMENT_COMPLETE" },
		});
	});

	it("uses BO1 early, BO3 for advancement and every playoff match", () => {
		let state = createTournament({ rootSeed: 9, playerTeam, opponents });
		expect(state.nextMatch?.format).toBe("BO1");
		state = play(play(state, true), true);
		expect(state.nextMatch?.format).toBe("BO3");
		state = play(state, true);
		state = play(play(state, true), true);
		expect(state.nextMatch?.format).toBe("BO3");
		state = play(state, true);
		expect(state.nextMatch).toMatchObject({ playoffRound: "quarterfinal", format: "BO3" });
	});

	it("eliminates immediately on a playoff loss", () => {
		let state = createTournament({ rootSeed: 19, playerTeam, opponents });
		for (let index = 0; index < 6; index += 1) state = play(state, true);
		expect(state.playoffRound).toBe("quarterfinal");
		state = play(state, false);
		expect(state.status).toBe("eliminated");
		expect(state.nextMatch).toBeNull();
	});

	it("is deterministic, serialization-safe, and avoids immediate repeats", () => {
		const makeRun = () => {
			let state = createTournament({ rootSeed: "repeatable", playerTeam, opponents });
			for (let index = 0; index < 5; index += 1) state = play(state, index !== 1);
			return state;
		};
		const first = makeRun();
		const second = makeRun();
		expect(first).toEqual(second);
		expect(JSON.parse(JSON.stringify(first))).toEqual(first);
		const ids = first.history.map((match) => match.opponent.id);
		for (let index = 1; index < ids.length; index += 1) {
			expect(ids[index]).not.toBe(ids[index - 1]);
		}
	});

	it("returns identical simulated matches for the same root seed", () => {
		const left = createTournament({ rootSeed: 77, playerTeam, opponents });
		const right = createTournament({ rootSeed: 77, playerTeam, opponents });
		expect(runNextMatch(left, playerTeam, opponents)).toEqual(
			runNextMatch(right, playerTeam, opponents),
		);
	});

	it("climbs opponent strength along a 9-0 path", () => {
		const median = opponents[Math.floor(opponents.length / 2)]?.profile.overall ?? 0;
		const topDecile = opponents[Math.floor(opponents.length * 0.9)]?.profile.overall ?? 0;
		for (const rootSeed of [1, 42, "ladder"]) {
			let state = createTournament({ rootSeed, playerTeam, opponents });
			expect(state.nextMatch?.opponent.profile.overall).toBeLessThanOrEqual(median);
			const overalls: number[] = [];
			for (let index = 0; index < 9; index += 1) {
				const overall = state.nextMatch?.opponent.profile.overall;
				if (overall === undefined) throw new Error("expected an opponent");
				overalls.push(overall);
				state = play(state, true);
			}
			for (let index = 1; index < overalls.length; index += 1) {
				expect(overalls[index]).toBeGreaterThanOrEqual(overalls[index - 1]);
			}
			expect(overalls[3]).toBeGreaterThan(overalls[0]);
			expect(overalls[6]).toBeGreaterThan(overalls[3]);
			expect(overalls[7]).toBeGreaterThanOrEqual(SEMI_OPPONENT_OVERALL_FLOOR);
			expect(overalls[7]).toBeLessThanOrEqual(SEMI_OPPONENT_OVERALL_CEILING);
			expect(overalls[8]).toBeGreaterThanOrEqual(topDecile);
			expect(overalls[8]).toBeGreaterThanOrEqual(FINAL_OPPONENT_OVERALL_FLOOR);
		}
	});

	it("floors the grand final opponent at 90 overall", () => {
		for (const rootSeed of [42, "foo", 2026, "daily"]) {
			let state = createTournament({ rootSeed, playerTeam, opponents });
			for (let index = 0; index < 7; index += 1) {
				state = play(state, true);
			}
			expect(state.nextMatch?.playoffRound).toBe("semifinal");
			expect(state.nextMatch?.opponent.profile.overall).toBeGreaterThanOrEqual(
				SEMI_OPPONENT_OVERALL_FLOOR,
			);
			expect(state.nextMatch?.opponent.profile.overall).toBeLessThanOrEqual(
				SEMI_OPPONENT_OVERALL_CEILING,
			);
			state = play(state, true);
			expect(state.nextMatch?.playoffRound).toBe("final");
			expect(state.nextMatch?.opponent.profile.overall).toBeGreaterThanOrEqual(
				FINAL_OPPONENT_OVERALL_FLOOR,
			);
		}
	});

	it("samples the semifinal and final bands instead of always the strongest leftover", () => {
		const semis = new Set<string>();
		const finals = new Set<string>();
		for (let rootSeed = 0; rootSeed < 40; rootSeed += 1) {
			let state = createTournament({ rootSeed, playerTeam, opponents });
			for (let index = 0; index < 7; index += 1) {
				state = play(state, true);
			}
			const semiId = state.nextMatch?.opponent.id;
			if (!semiId) throw new Error("expected a semifinal opponent");
			semis.add(semiId);
			state = play(state, true);
			const finalId = state.nextMatch?.opponent.id;
			if (!finalId) throw new Error("expected a final opponent");
			finals.add(finalId);
		}
		expect(semis.size).toBeGreaterThanOrEqual(5);
		expect(finals.size).toBeGreaterThanOrEqual(4);
	});

	it("prefers a community opponent near the historical target, not a stacked published roster", () => {
		const firstTarget = opponents[Math.round(0.14 * (opponents.length - 1))];
		const legendsTarget = opponents[Math.round(0.55 * (opponents.length - 1))];
		const stackedBase = opponents.at(-1);
		if (!firstTarget || !legendsTarget || !stackedBase) {
			throw new Error("need historical fixtures");
		}
		const asCommunity = (
			base: HistoricalOpponent,
			id: string,
			overall = base.profile.overall,
		): HistoricalOpponent => ({
			...base,
			id,
			source: "community",
			org: { id, name: id },
			profile: { ...base.profile, overall },
		});
		const community = [
			asCommunity(firstTarget, "community-near"),
			asCommunity(legendsTarget, "community-legends"),
			asCommunity(stackedBase, "community-semi", 89),
			asCommunity(stackedBase, "community-stacked", 100),
		];
		const mixed = [...opponents, ...community].sort(
			(left, right) =>
				left.profile.overall - right.profile.overall || left.id.localeCompare(right.id),
		);
		const playMixed = (state: ReturnType<typeof createTournament>, won: boolean) => {
			const result = runNextMatch(state, playerTeam, mixed, forced(won));
			if (!result.ok) throw result.error;
			return result.value;
		};
		let state = createTournament({ rootSeed: 3, playerTeam, opponents: mixed });
		const used: { id: string; overall: number; stage: string }[] = [];
		for (let index = 0; index < 9; index += 1) {
			const next = state.nextMatch;
			if (!next) throw new Error("expected an opponent");
			used.push({
				id: next.opponent.id,
				overall: next.opponent.profile.overall,
				stage: next.stage,
			});
			state = playMixed(state, true);
		}
		expect(used[0]?.id).toBe("community-near");
		expect(used.some((row) => row.id === "community-legends")).toBe(true);
		expect(used.some((row) => !row.id.startsWith("community-"))).toBe(true);
		const beforeFinal = used.slice(0, 8);
		expect(beforeFinal.every((row) => row.id !== "community-stacked")).toBe(true);
		expect(used[3]?.stage).toBe("legends");
		expect(used[3]?.overall).toBeLessThanOrEqual(
			legendsTarget.profile.overall + COMMUNITY_OVERALL_SLACK,
		);
		expect(used[3]?.overall).toBeLessThan(90);
		expect(used[7]?.id).toBe("community-semi");
		expect(used[7]?.overall).toBeGreaterThanOrEqual(SEMI_OPPONENT_OVERALL_FLOOR);
		expect(used[7]?.overall).toBeLessThanOrEqual(SEMI_OPPONENT_OVERALL_CEILING);
		expect(used[8]?.id).toBe("community-stacked");
		expect(used[8]?.overall).toBe(100);
	});
});
