import { describe, expect, it } from "vitest";
import { loadDataset } from "../../data";
import { ratePlayers } from "../ratings/rate";
import { buildHistoricalOpponents, createTournament, runNextMatch } from ".";
import type { SeriesResolver } from "./types";

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
			expect(overalls[8]).toBeGreaterThanOrEqual(topDecile);
		}
	});
});
