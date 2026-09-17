import { describe, expect, it } from "vitest";
import type { KillEvent, MapResult, PlayerMapStats, RoundResult } from "../engine";
import { scoreboardRating } from "../engine";
import {
	aggregateSeriesScoreboard,
	buildPlaybackTicks,
	latestRoundFeed,
	liveLines,
	playbackTickMs,
	resolvePlayback,
	seriesRoundsWon,
	settleWinner,
} from "./MatchPlayback";

function round(
	number: number,
	kills: Array<Omit<KillEvent, "weapon"> & { weapon?: KillEvent["weapon"] }>,
): RoundResult {
	return {
		round: number,
		phase: "regulation",
		sides: ["CT", "T"],
		winner: 0,
		winProbabilityTeamA: 0.5,
		scoreAfter: [number, 0],
		economy: [
			{
				buy: "full-buy",
				bankBefore: 4000,
				bankAfter: 1400,
				lossBonusBefore: 1400,
				lossBonusAfter: 1400,
			},
			{
				buy: "eco",
				bankBefore: 800,
				bankAfter: 1900,
				lossBonusBefore: 1400,
				lossBonusAfter: 1900,
			},
		],
		kills: kills.map((kill) => ({ ...kill, weapon: kill.weapon ?? "ak47" })),
		moraleAfter: [50, 50],
		timeout: false,
		summary: { kind: "default", team: 0 },
	};
}

describe("liveLines", () => {
	it("tallies kills, deaths, and assists only from revealed rounds", () => {
		const rounds = [
			round(1, [
				{
					killerTeam: 0,
					killerId: "a",
					victimTeam: 1,
					victimId: "x",
					assisterId: "b",
				},
			]),
			round(2, [
				{
					killerTeam: 1,
					killerId: "x",
					victimTeam: 0,
					victimId: "a",
				},
			]),
		];
		expect(liveLines(rounds, 0).size).toBe(0);
		expect(liveLines(rounds, 1).get("a")).toEqual({ kills: 1, deaths: 0, assists: 0 });
		expect(liveLines(rounds, 1).get("b")).toEqual({ kills: 0, deaths: 0, assists: 1 });
		expect(liveLines(rounds, 1).get("x")).toEqual({ kills: 0, deaths: 1, assists: 0 });
		expect(liveLines(rounds, 2).get("a")).toEqual({ kills: 1, deaths: 1, assists: 0 });
		expect(liveLines(rounds, 2).get("x")).toEqual({ kills: 1, deaths: 1, assists: 0 });
	});

	it("includes in-progress kills from the current round", () => {
		const rounds = [
			round(1, [
				{
					killerTeam: 0,
					killerId: "a",
					victimTeam: 1,
					victimId: "x",
				},
			]),
			round(2, [
				{
					killerTeam: 1,
					killerId: "x",
					victimTeam: 0,
					victimId: "a",
					assisterId: "y",
				},
			]),
		];
		const extra = rounds[1]?.kills.slice(0, 1) ?? [];
		expect(liveLines(rounds, 1, extra).get("a")).toEqual({ kills: 1, deaths: 1, assists: 0 });
		expect(liveLines(rounds, 1, extra).get("x")).toEqual({ kills: 1, deaths: 1, assists: 0 });
		expect(liveLines(rounds, 1, extra).get("y")).toEqual({ kills: 0, deaths: 0, assists: 1 });
	});
});

function player(
	id: string,
	stats: Pick<PlayerMapStats, "kills" | "deaths" | "assists" | "adr" | "kast">,
): PlayerMapStats {
	return { playerId: id, nick: id, rating: 1, ...stats };
}

function stubMap(
	roundCount: number,
	score: readonly [number, number],
	teamA: PlayerMapStats[],
	teamB: PlayerMapStats[],
): MapResult {
	return {
		label: "map",
		winner: score[0] >= score[1] ? 0 : 1,
		score,
		regulationScore: score,
		overtimeBlocks: 0,
		rounds: Array.from({ length: roundCount }, () => round(1, [])),
		scoreboard: [teamA, teamB],
		highlights: [],
	};
}

describe("aggregateSeriesScoreboard", () => {
	it("sums K/D/A and round-weights ADR, KAST, and rating across maps", () => {
		const maps = [
			stubMap(
				21,
				[13, 8],
				[player("alpha", { kills: 10, deaths: 10, assists: 2, adr: 80, kast: 70 })],
				[player("bravo", { kills: 8, deaths: 12, assists: 1, adr: 60, kast: 62 })],
			),
			stubMap(
				24,
				[11, 13],
				[player("alpha", { kills: 14, deaths: 12, assists: 4, adr: 90, kast: 74 })],
				[player("bravo", { kills: 16, deaths: 11, assists: 3, adr: 88, kast: 71 })],
			),
		];
		const [teamA, teamB] = aggregateSeriesScoreboard(maps);
		const alpha = teamA[0];
		const bravo = teamB[0];
		expect(seriesRoundsWon(maps)).toEqual([24, 21]);
		expect(alpha).toMatchObject({ kills: 24, deaths: 22, assists: 6, adr: 85, kast: 72 });
		expect(bravo).toMatchObject({ kills: 24, deaths: 23, assists: 4, adr: 75, kast: 67 });
		expect(alpha?.rating).toBe(
			scoreboardRating({
				kills: 24,
				deaths: 22,
				assists: 6,
				adr: 85,
				kast: 72,
				rounds: 45,
			}),
		);
	});
});

function playbackMap(rounds: RoundResult[]): MapResult {
	const last = rounds.at(-1)?.scoreAfter ?? [0, 0];
	return {
		label: "map",
		winner: last[0] >= last[1] ? 0 : 1,
		score: last,
		regulationScore: last,
		overtimeBlocks: 0,
		rounds,
		scoreboard: [[], []],
		highlights: [],
	};
}

describe("playback ticks", () => {
	it("reveals kills one at a time and clears deaths when the round settles", () => {
		const maps = [
			playbackMap([
				round(1, [
					{ killerTeam: 0, killerId: "a", victimTeam: 1, victimId: "x" },
					{ killerTeam: 0, killerId: "b", victimTeam: 1, victimId: "y" },
				]),
				round(2, [{ killerTeam: 1, killerId: "x", victimTeam: 0, victimId: "a" }]),
			]),
		];
		const ticks = buildPlaybackTicks(maps);
		expect(ticks).toEqual([
			{ kind: "kill", mapIndex: 0, roundIndex: 0, killIndex: 0 },
			{ kind: "kill", mapIndex: 0, roundIndex: 0, killIndex: 1 },
			{ kind: "settle", mapIndex: 0, roundIndex: 0 },
			{ kind: "kill", mapIndex: 0, roundIndex: 1, killIndex: 0 },
			{ kind: "settle", mapIndex: 0, roundIndex: 1 },
		]);

		const first = resolvePlayback(maps, ticks, 1);
		expect([...first.deadIds]).toEqual(["x"]);
		expect(first.score).toEqual([0, 0]);
		expect(first.settledRoundCount).toBe(0);
		expect(first.inProgressKills).toHaveLength(1);
		expect(first.complete).toBe(false);

		const mid = resolvePlayback(maps, ticks, 2);
		expect([...mid.deadIds].toSorted()).toEqual(["x", "y"]);
		expect(mid.score).toEqual([0, 0]);

		const settled = resolvePlayback(maps, ticks, 3);
		expect(settled.deadIds.size).toBe(0);
		expect(settled.score).toEqual([1, 0]);
		expect(settled.settledRoundCount).toBe(1);
		expect(settled.inProgressRound).toBeUndefined();

		expect(settleWinner(maps, ticks, 2)).toBeUndefined();
		expect(settleWinner(maps, ticks, 3)).toBe(0);
		expect(settleWinner(maps, ticks, 4)).toBeUndefined();

		const nextRound = resolvePlayback(maps, ticks, 4);
		expect([...nextRound.deadIds]).toEqual(["a"]);
		expect(nextRound.score).toEqual([1, 0]);
		expect(nextRound.settledRoundCount).toBe(1);

		const done = resolvePlayback(maps, ticks, ticks.length);
		expect(done.complete).toBe(true);
		expect(done.deadIds.size).toBe(0);
		expect(done.score).toEqual([2, 0]);
		expect(done.seriesScore).toEqual([1, 0]);
	});

	it("exposes only the latest round for the feed", () => {
		const maps = [
			playbackMap([
				round(1, [
					{ killerTeam: 0, killerId: "a", victimTeam: 1, victimId: "x" },
					{ killerTeam: 0, killerId: "b", victimTeam: 1, victimId: "y" },
				]),
				round(2, [{ killerTeam: 1, killerId: "x", victimTeam: 0, victimId: "a" }]),
			]),
		];
		const map = maps[0];
		if (!map) throw new Error("expected map");
		const ticks = buildPlaybackTicks(maps);
		const mid = latestRoundFeed(resolvePlayback(maps, ticks, 2), map);
		expect(mid?.kills).toHaveLength(2);
		expect(mid?.settled).toBe(false);
		expect(mid?.round.round).toBe(1);
		const settled = latestRoundFeed(resolvePlayback(maps, ticks, 3), map);
		expect(settled?.kills).toHaveLength(2);
		expect(settled?.settled).toBe(true);
		const next = latestRoundFeed(resolvePlayback(maps, ticks, 4), map);
		expect(next?.round.round).toBe(2);
		expect(next?.kills).toHaveLength(1);
		expect(next?.settled).toBe(false);
	});
});

describe("playbackTickMs", () => {
	it("scales the 1× interval by 2× and 4×", () => {
		expect(playbackTickMs(1)).toBe(750);
		expect(playbackTickMs(2)).toBe(375);
		expect(playbackTickMs(4)).toBe(187.5);
	});
});
