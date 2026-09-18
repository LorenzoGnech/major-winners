import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import type { MapResult, PlayerMapStats, RoundResult, SeriesResult } from "../sim";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { summarizeDuelSeries, summarizeTournamentRun, tournamentFinishLabel } from "./summary";
import type { HistoricalOpponent, TournamentMatch, TournamentState } from "./types";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function member(prefix: string, slot: TeamMemberProfile["slot"], index: number): TeamMemberProfile {
	return {
		id: `${prefix}-${slot}`,
		playerId: `${prefix}-${slot}`,
		nick: `${prefix}${slot}`,
		nationality: "DK",
		orgId: prefix,
		year: 2018,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: 80 + index,
		effectiveOvr: 80 + index,
		attributes,
	};
}

function profile(prefix: string, overall: number): TeamProfile {
	const slots = ["awp", "igl", "entry", "support", "lurker"] as const;
	return {
		seed: 1,
		overall,
		components: {
			baseStrength: overall,
			chemistry: 70,
			communication: 90,
			structure: 90,
			coaching: 60,
		},
		details: {
			chemistry: {
				score: 70,
				sharedOrgYearPairs: 5,
				sharedTeamPairs: 5,
				sharedNationalityPairs: 10,
				bonus: 20,
			},
			communication: {
				score: 90,
				playerPairCompatibility: 90,
				coachCompatibility: 90,
				languageScore: 90,
				iglAbility: 80,
				heuristic: "language-family-and-igl",
			},
			structure: {
				score: 90,
				naturalRoleCount: 5,
				secondaryRoleCount: 0,
				offRoleCount: 0,
				iglFit: "primary",
				primaryAwpCount: 1,
			},
			coaching: {
				score: 60,
				overallImpact: 0.5,
				comebackResilience: 80,
				economyDiscipline: 80,
				antiStrat: 80,
			},
		},
		attributes,
		members: slots.map((slot, index) => member(prefix, slot, index)),
		coach: { id: `${prefix}-coach`, nick: `${prefix} coach` },
		strengths: [],
		weaknesses: [],
	};
}

function stats(
	id: string,
	row: Pick<PlayerMapStats, "kills" | "deaths" | "assists" | "adr" | "kast">,
): PlayerMapStats {
	return { playerId: id, nick: id, rating: 1, ...row };
}

function emptyRound(summary: RoundResult["summary"] = { kind: "default", team: 0 }): RoundResult {
	return {
		round: 1,
		phase: "regulation",
		sides: ["CT", "T"],
		winner: 0,
		winProbabilityTeamA: 0.5,
		scoreAfter: [1, 0],
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
		kills: [],
		moraleAfter: [50, 50],
		timeout: false,
		summary,
	};
}

function mapResult(
	score: readonly [number, number],
	teamA: PlayerMapStats[],
	rounds: RoundResult[],
): MapResult {
	return {
		label: "Mirage",
		winner: score[0] >= score[1] ? 0 : 1,
		score,
		regulationScore: score,
		overtimeBlocks: 0,
		rounds,
		scoreboard: [teamA, []],
		highlights: [],
	};
}

const playerTeam = profile("alpha", 82.4);
const weakOpp = profile("bravo", 70);
const strongOpp = profile("champ", 91);

function opponent(team: TeamProfile, label: string): HistoricalOpponent {
	return {
		id: team.members[0]?.orgId ?? label,
		label,
		source: "historical",
		org: { id: team.members[0]?.orgId ?? "org", name: label },
		profile: team,
	};
}

function match(
	input: Pick<TournamentMatch, "matchNumber" | "stage" | "won" | "playoffRound"> & {
		opponent: HistoricalOpponent;
		maps: MapResult[];
		score: readonly [number, number];
	},
): TournamentMatch {
	const result: SeriesResult = {
		seed: input.matchNumber,
		format: input.score[0] + input.score[1] > 1 ? "BO3" : "BO1",
		teams: [playerTeam, input.opponent.profile],
		winner: input.won ? 0 : 1,
		score: input.score,
		maps: input.maps,
	};
	return {
		matchNumber: input.matchNumber,
		stage: input.stage,
		...(input.playoffRound ? { playoffRound: input.playoffRound } : {}),
		format: result.format,
		seriesSeed: input.matchNumber,
		opponent: input.opponent,
		won: input.won,
		result,
	};
}

function state(overrides: Partial<TournamentState>): TournamentState {
	return {
		rootSeed: 1,
		status: "eliminated",
		stage: "challengers",
		challengers: { wins: 0, losses: 0 },
		legends: { wins: 0, losses: 0 },
		playoffRound: null,
		history: [],
		nextMatch: null,
		...overrides,
	};
}

describe("tournamentFinishLabel", () => {
	it("names a title and each playoff exit", () => {
		expect(tournamentFinishLabel(state({ status: "champion", stage: "champions" }))).toBe(
			"Champion",
		);
		expect(tournamentFinishLabel(state({ stage: "challengers" }))).toBe("Challengers Swiss");
		expect(tournamentFinishLabel(state({ stage: "legends" }))).toBe("Legends Swiss");
		expect(
			tournamentFinishLabel(
				state({
					stage: "champions",
					history: [
						match({
							matchNumber: 7,
							stage: "champions",
							playoffRound: "quarterfinal",
							won: false,
							opponent: opponent(weakOpp, "Liquid · 2019"),
							score: [0, 2],
							maps: [],
						}),
					],
				}),
			),
		).toBe("Quarterfinal");
	});
});

describe("summarizeTournamentRun", () => {
	it("treats a 9-0 title with empty maps as a perfect run without an MVP", () => {
		const history = Array.from({ length: 9 }, (_, index) =>
			match({
				matchNumber: index + 1,
				stage: index < 3 ? "challengers" : index < 6 ? "legends" : "champions",
				won: true,
				opponent: opponent(weakOpp, "Easy · 2016"),
				score: [1, 0],
				maps: [],
			}),
		);
		const summary = summarizeTournamentRun(
			state({ status: "champion", stage: "champions", history }),
			playerTeam,
		);
		expect(summary).toMatchObject({
			status: "champion",
			wins: 9,
			losses: 0,
			finish: "Champion",
			perfect: true,
			mapsWon: 9,
			mapsLost: 0,
			mvpSeasonId: null,
			coachNick: "alpha coach",
		});
		expect(summary.players).toHaveLength(5);
		expect(summary.players.every((player) => player.rating === 1)).toBe(true);
	});

	it("aggregates player boards, highlights, and the hardest win", () => {
		const awp = "alpha-awp";
		const entry = "alpha-entry";
		const first = mapResult(
			[13, 8],
			[
				stats(awp, { kills: 20, deaths: 10, assists: 4, adr: 90, kast: 80 }),
				stats(entry, { kills: 10, deaths: 14, assists: 2, adr: 60, kast: 60 }),
			],
			[
				emptyRound({ kind: "ace", team: 0, playerId: awp }),
				emptyRound({ kind: "clutch", team: 0, playerId: awp, against: 3 }),
				emptyRound(),
			],
		);
		const second = mapResult(
			[13, 11],
			[
				stats(awp, { kills: 16, deaths: 12, assists: 3, adr: 80, kast: 70 }),
				stats(entry, { kills: 22, deaths: 9, assists: 5, adr: 95, kast: 78 }),
			],
			[emptyRound({ kind: "ace", team: 1, playerId: "bravo-awp" }), emptyRound()],
		);
		const summary = summarizeTournamentRun(
			state({
				status: "eliminated",
				stage: "legends",
				history: [
					match({
						matchNumber: 1,
						stage: "challengers",
						won: true,
						opponent: opponent(weakOpp, "G2 · 2023"),
						score: [1, 0],
						maps: [first],
					}),
					match({
						matchNumber: 2,
						stage: "legends",
						won: true,
						opponent: opponent(strongOpp, "Astralis · London 2018"),
						score: [1, 0],
						maps: [second],
					}),
					match({
						matchNumber: 3,
						stage: "legends",
						won: false,
						opponent: opponent(weakOpp, "Liquid · 2019"),
						score: [0, 1],
						maps: [],
					}),
				],
			}),
			playerTeam,
		);
		expect(summary.wins).toBe(2);
		expect(summary.losses).toBe(1);
		expect(summary.perfect).toBe(false);
		expect(summary.mapsWon).toBe(2);
		expect(summary.mapsLost).toBe(1);
		expect(summary.roundsWon).toBe(26);
		expect(summary.roundsLost).toBe(19);
		expect(summary.hardestWinLabel).toBe("Astralis · London 2018");
		const awpRow = summary.players.find((player) => player.seasonId === awp);
		expect(awpRow).toMatchObject({ kills: 36, deaths: 22, assists: 7, aces: 1, clutches: 1 });
		expect(summary.mvpSeasonId).toBe(awp);
	});
});

describe("summarizeDuelSeries", () => {
	it("names both sides, the winner, and guest-side stats", () => {
		const hostAwp = "alpha-awp";
		const guestAwp = "bravo-awp";
		const map: MapResult = {
			label: "Nuke",
			winner: 1,
			score: [11, 13],
			regulationScore: [11, 13],
			overtimeBlocks: 0,
			rounds: [emptyRound({ kind: "ace", team: 1, playerId: guestAwp })],
			scoreboard: [
				[stats(hostAwp, { kills: 12, deaths: 16, assists: 3, adr: 70, kast: 60 })],
				[stats(guestAwp, { kills: 24, deaths: 10, assists: 4, adr: 98, kast: 82 })],
			],
			highlights: [],
		};
		const summary = summarizeDuelSeries(
			{
				seed: 9,
				format: "BO5",
				teams: [playerTeam, weakOpp],
				winner: 1,
				score: [1, 3],
				maps: [map],
			},
			["Host Five", "Guest Five"],
		);
		expect(summary.winner).toBe(1);
		expect(summary.score).toEqual([1, 3]);
		expect(summary.rounds).toEqual([11, 13]);
		expect(summary.sides[0]?.name).toBe("Host Five");
		expect(summary.sides[1]?.name).toBe("Guest Five");
		expect(summary.sides[1]?.mvpSeasonId).toBe(guestAwp);
		expect(summary.sides[1]?.players.find((player) => player.seasonId === guestAwp)).toMatchObject({
			kills: 24,
			aces: 1,
		});
	});
});
