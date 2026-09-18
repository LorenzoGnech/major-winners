import { collectTraitHolders, pickTraitHits, resolveTraitRound, tickLingering } from "../bonuses";
import { createRng, normalizeSeed, type Rng } from "../rng";
import type { TeamProfile } from "../team";
import { planFeaturedClutch } from "./clutch";
import { chooseBuy, INITIAL_ECONOMY, resolveEconomyRound } from "./economy";
import {
	applyGamePlan,
	DEFAULT_GAME_PLAN,
	type GamePlanId,
	gamePlanById,
	isEarlyRegulationRound,
	resolveGamePlan,
} from "./gamePlan";
import { makeKills } from "./kills";
import { chooseSeriesMaps, winsNeeded } from "./maps";
import { applyTimeoutMorale, bumpMorale, initialMorale, resolveRoundMorale } from "./morale";
import { chooseRoundSummary } from "./roundSummary";
import { playbackMaps, roundWinProbability, scoreboard } from "./simulate";
import { maybeQueueAutoTimeout } from "./timeout";
import type {
	BuyType,
	EconomyState,
	HighlightEvent,
	LiveMapState,
	LiveSeriesResult,
	LiveSeriesState,
	MapContext,
	MapResult,
	SeriesFormat,
	SeriesResult,
	Side,
	SimulateSeriesInput,
} from "./types";
import { assignWeapon } from "./weapons";

export const TIMEOUTS_PER_MAP = 1;
export { MAX_FEATURED_CLUTCHES } from "./clutch";

const MAX_OVERTIME_BLOCKS = 12;
const OVERTIME_BANK: EconomyState = { bank: 10_000, lossBonus: 1_400, losses: 0 };

function other(team: 0 | 1): 0 | 1 {
	return team === 0 ? 1 : 0;
}

function swapped(sides: readonly [Side, Side]): [Side, Side] {
	return [sides[1], sides[0]];
}

function initialSides(rng: Rng): [Side, Side] {
	return rng.nextInt(2) === 0 ? ["CT", "T"] : ["T", "CT"];
}

function failCode(code: import("./types").SimErrorCode, message: string): LiveSeriesResult {
	return { ok: false, error: { code, message } };
}

function initMap(
	teams: readonly [TeamProfile, TeamProfile],
	rng: Rng,
	mapIndex: number,
	mapContext: MapContext,
	gamePlan: GamePlanId,
	bothSidesPlayer = false,
): LiveMapState {
	const planned = applyGamePlan(teams[0], gamePlan);
	return {
		mapIndex,
		mapContext,
		score: [0, 0],
		regulationScore: null,
		sides: initialSides(rng),
		overtimeBlocks: 0,
		overtimeBlockWins: [0, 0],
		overtimeLocalRound: 0,
		safetyRound: false,
		phase: "regulation",
		economies: [{ ...INITIAL_ECONOMY }, { ...INITIAL_ECONOMY }],
		morale: [initialMorale(planned), initialMorale(teams[1])],
		rounds: [],
		highlights: [],
		maxDeficit: [0, 0],
		comebackEmitted: [false, false],
		timeoutsRemaining: TIMEOUTS_PER_MAP,
		...(bothSidesPlayer ? { awayTimeoutsRemaining: TIMEOUTS_PER_MAP } : {}),
		pendingTimeout: false,
		lingeringBonuses: [],
		gamePlan,
		complete: false,
	};
}

function finalizeMap(
	current: LiveMapState,
	teams: readonly [TeamProfile, TeamProfile],
	rng: Rng,
): MapResult {
	const winner: 0 | 1 = current.score[0] > current.score[1] ? 0 : 1;
	return {
		label: current.mapContext.label,
		mapContext: current.mapContext,
		gamePlan: current.gamePlan,
		winner,
		score: current.score,
		regulationScore: current.regulationScore ?? current.score,
		overtimeBlocks: current.overtimeBlocks,
		rounds: current.rounds,
		scoreboard: scoreboard(teams, current.rounds, rng),
		highlights: current.highlights,
	};
}

function enterOvertime(current: LiveMapState, rng: Rng): LiveMapState {
	const overtimeSides = rng.nextInt(2) === 0 ? current.sides : swapped(current.sides);
	return {
		...current,
		regulationScore: [...current.score],
		phase: "overtime",
		overtimeBlocks: 1,
		overtimeBlockWins: [0, 0],
		overtimeLocalRound: 0,
		sides: overtimeSides,
		safetyRound: false,
	};
}

function afterOvertimeRound(current: LiveMapState, winner: 0 | 1): LiveMapState {
	if (current.safetyRound) {
		return { ...current, complete: true, winner: current.score[0] > current.score[1] ? 0 : 1 };
	}
	const blockWins: [number, number] = [...current.overtimeBlockWins];
	blockWins[winner] += 1;
	if (blockWins[winner] === 4) {
		return {
			...current,
			overtimeBlockWins: blockWins,
			complete: true,
			winner: current.score[0] > current.score[1] ? 0 : 1,
		};
	}
	const nextLocal = current.overtimeLocalRound + 1;
	if (nextLocal === 3) {
		return {
			...current,
			overtimeBlockWins: blockWins,
			overtimeLocalRound: nextLocal,
			sides: swapped(current.sides),
		};
	}
	if (nextLocal < 6) {
		return { ...current, overtimeBlockWins: blockWins, overtimeLocalRound: nextLocal };
	}
	if (current.overtimeBlocks >= MAX_OVERTIME_BLOCKS) {
		return {
			...current,
			overtimeBlockWins: [0, 0],
			overtimeLocalRound: 0,
			safetyRound: true,
			sides: swapped(current.sides),
		};
	}
	return {
		...current,
		overtimeBlocks: current.overtimeBlocks + 1,
		overtimeBlockWins: [0, 0],
		overtimeLocalRound: 0,
		sides: swapped(current.sides),
	};
}

function playMapRound(
	current: LiveMapState,
	teams: readonly [TeamProfile, TeamProfile],
	rng: Rng,
	bothSidesPlayer = false,
): LiveMapState {
	const usedTimeout = current.pendingTimeout;
	const timeoutTeam: 0 | 1 | undefined = usedTimeout
		? (current.pendingTimeoutTeam ?? 0)
		: undefined;
	const roundNumber = current.rounds.length + 1;
	const gamePlan = resolveGamePlan(current.gamePlan);
	const plan = gamePlanById(gamePlan);
	const planned = applyGamePlan(teams[0], gamePlan);
	const simTeams = [planned, teams[1]] as const;
	const pistol = current.phase === "regulation" && (roundNumber === 1 || roundNumber === 13);
	const resetCash =
		current.safetyRound ||
		(current.phase === "overtime" &&
			(current.overtimeLocalRound === 0 || current.overtimeLocalRound === 3));
	let economies: [EconomyState, EconomyState] = current.economies;
	if (pistol) economies = [{ ...INITIAL_ECONOMY }, { ...INITIAL_ECONOMY }];
	if (resetCash) economies = [{ ...OVERTIME_BANK }, { ...OVERTIME_BANK }];

	const buys: [BuyType, BuyType] = [
		chooseBuy(economies[0], {
			pistol,
			economyDiscipline: simTeams[0].details.coaching.economyDiscipline,
		}),
		chooseBuy(economies[1], {
			pistol,
			economyDiscipline: simTeams[1].details.coaching.economyDiscipline,
		}),
	];
	const holders = [
		...collectTraitHolders(simTeams[0].members).map((row) => ({ ...row, team: 0 as const })),
		...(bothSidesPlayer
			? collectTraitHolders(simTeams[1].members).map((row) => ({ ...row, team: 1 as const }))
			: []),
	];
	const hits = pickTraitHits(holders, rng);
	const procTeam = hits[0]?.team ?? 0;
	const resolved = resolveTraitRound({
		lingering: current.lingeringBonuses,
		hits,
		buy: buys[procTeam],
		pistol,
	});
	const morale: [number, number] = [
		bumpMorale(current.morale[0], resolved.moraleSelf),
		bumpMorale(current.morale[1], resolved.moraleOpponent),
	];
	const probability = roundWinProbability(simTeams, current.sides, buys, current.score, pistol, {
		mapStyle: current.mapContext.style,
		homePick: current.mapContext.homePick,
		pickedBy: current.mapContext.pickedBy,
		morale,
		timeoutTeam,
		pistolBias: plan.pistolBias,
		earlyRoundBias: isEarlyRegulationRound(roundNumber, current.phase) ? plan.earlyRoundBias : 0,
		bonusWinProb: resolved.winProb,
	});
	const winner: 0 | 1 = rng.next() < probability ? 0 : 1;
	const loser = other(winner);
	const loadouts = new Map<string, import("./types").WeaponId>();
	for (const teamIndex of [0, 1] as const) {
		for (const member of simTeams[teamIndex].members) {
			const rolled = assignWeapon(member, buys[teamIndex], current.sides[teamIndex], rng);
			loadouts.set(member.id, resolved.modifiers.forceAwp.has(member.id) ? "awp" : rolled);
		}
	}
	const featuredRounds = current.highlights
		.filter((highlight) => highlight.type === "clutch-sequence")
		.map((highlight) => highlight.round);
	const featured = planFeaturedClutch(featuredRounds, winner, rng, roundNumber);
	const { kills, sequences } = makeKills(
		simTeams,
		winner,
		rng,
		loadouts,
		featured.intent,
		featured.intent === "none" ? undefined : featured.against,
		resolved.modifiers,
	);
	const summary = chooseRoundSummary({
		winner,
		sides: current.sides,
		buys,
		kills,
		sequences,
		timeout: usedTimeout,
		pistol,
		phase: current.phase,
		mapId: current.mapContext.mapId,
		rng,
		timeoutTeam,
	});
	const economyA = resolveEconomyRound(economies[0], buys[0], winner === 0);
	const economyB = resolveEconomyRound(economies[1], buys[1], winner === 1);
	const score: [number, number] = [...current.score];
	score[winner] += 1;
	const maxDeficit: [number, number] = [
		Math.max(current.maxDeficit[0], score[1] - score[0]),
		Math.max(current.maxDeficit[1], score[0] - score[1]),
	];
	const moraleAfter = resolveRoundMorale({
		morale,
		winner,
		priorWinners: current.rounds.map((round) => round.winner),
		clutches: sequences,
		teams: simTeams,
	});

	const highlights: HighlightEvent[] = [...current.highlights];
	if (usedTimeout && timeoutTeam !== undefined) {
		highlights.push({ type: "player-timeout", round: roundNumber, team: timeoutTeam });
	}
	const opening = kills[0];
	if (opening && rng.next() < 0.22) {
		highlights.push({
			type: "opening-duel",
			round: roundNumber,
			team: opening.killerTeam,
			playerId: opening.killerId,
			victimId: opening.victimId,
		});
	}
	const winnerKills = new Map<string, number>();
	for (const kill of kills) {
		if (kill.killerTeam === winner) {
			winnerKills.set(kill.killerId, (winnerKills.get(kill.killerId) ?? 0) + 1);
		}
	}
	for (const [playerId, count] of winnerKills) {
		if (count === 5) {
			highlights.push({ type: "ace", round: roundNumber, team: winner, playerId });
		} else if (count >= 3) {
			highlights.push({
				type: "multikill",
				round: roundNumber,
				team: winner,
				playerId,
				kills: count as 3 | 4,
			});
		}
	}
	for (const sequence of sequences) {
		highlights.push({
			type: "clutch-sequence",
			round: roundNumber,
			team: sequence.team,
			playerId: sequence.playerId,
			against: sequence.against,
			startKillIndex: sequence.startKillIndex,
			won: sequence.won,
		});
		if (sequence.won) {
			highlights.push({
				type: "clutch",
				round: roundNumber,
				team: sequence.team,
				playerId: sequence.playerId,
				against: sequence.against,
			});
		}
	}
	const comebackEmitted: [boolean, boolean] = [...current.comebackEmitted];
	if (
		score[winner] >= 7 &&
		score[winner] === score[loser] &&
		maxDeficit[winner] >= 5 &&
		!comebackEmitted[winner]
	) {
		comebackEmitted[winner] = true;
		highlights.push({
			type: "comeback",
			round: roundNumber,
			team: winner,
			fromDeficit: maxDeficit[winner],
		});
	}

	const next: LiveMapState = {
		...current,
		score,
		economies: [economyA.state, economyB.state],
		morale: moraleAfter,
		maxDeficit,
		comebackEmitted,
		pendingTimeout: false,
		lingeringBonuses: tickLingering(resolved.lingering),
		highlights,
		rounds: [
			...current.rounds,
			{
				round: roundNumber,
				phase: current.phase,
				...(current.phase === "overtime" ? { overtimeBlock: current.overtimeBlocks } : {}),
				sides: current.sides,
				winner,
				winProbabilityTeamA: probability,
				scoreAfter: [...score],
				economy: [economyA.round, economyB.round],
				kills,
				moraleAfter,
				timeout: usedTimeout,
				summary,
				...(resolved.proc ? { bonus: resolved.proc } : {}),
			},
		],
	};

	if (next.phase === "regulation") {
		if (score[0] >= 13 || score[1] >= 13) {
			return {
				...next,
				regulationScore: next.regulationScore ?? [...score],
				complete: true,
				winner: score[0] > score[1] ? 0 : 1,
			};
		}
		if (next.rounds.length === 12) {
			return { ...next, sides: swapped(next.sides) };
		}
		if (next.rounds.length === 24) {
			return enterOvertime(next, rng);
		}
		return next;
	}
	return afterOvertimeRound(next, winner);
}

export function startLiveSeries(input: {
	teams: readonly [TeamProfile, TeamProfile];
	seed: number | string;
	format: SeriesFormat;
	playerMapId?: string;
	mapQueue?: MapContext[];
	gamePlan?: GamePlanId;
	bothSidesPlayer?: boolean;
}): LiveSeriesState {
	const seed = normalizeSeed(input.seed);
	const rng = createRng(seed);
	const mapQueue = input.mapQueue ?? chooseSeriesMaps(rng, input.format, input.playerMapId);
	if (mapQueue.length === 0) {
		throw new RangeError("a series requires at least one map");
	}
	const first = mapQueue[0] as MapContext;
	const bothSidesPlayer = Boolean(input.bothSidesPlayer);
	const current = initMap(
		input.teams,
		rng,
		0,
		first,
		resolveGamePlan(input.gamePlan),
		bothSidesPlayer,
	);
	return {
		seed,
		rngState: rng.state,
		format: input.format,
		teams: input.teams,
		playerMapId: input.playerMapId,
		...(bothSidesPlayer ? { bothSidesPlayer: true } : {}),
		mapQueue,
		maps: [],
		seriesScore: [0, 0],
		current,
		complete: false,
	};
}

function attachRng(
	state: LiveSeriesState,
	rng: Rng,
	current: LiveMapState | null,
): LiveSeriesState {
	return { ...state, rngState: rng.state, current };
}

function closeMap(state: LiveSeriesState, rng: Rng): LiveSeriesState {
	const current = state.current;
	if (!current) return state;
	const finished = finalizeMap(current, state.teams, rng);
	const seriesScore: [number, number] = [...state.seriesScore];
	seriesScore[finished.winner] += 1;
	const maps = [...state.maps, finished];
	if (
		Math.max(...seriesScore) >= winsNeeded(state.format) ||
		maps.length >= state.mapQueue.length
	) {
		return {
			...state,
			maps,
			seriesScore,
			current: null,
			complete: true,
			winner: seriesScore[0] > seriesScore[1] ? 0 : 1,
			rngState: rng.state,
		};
	}
	return {
		...state,
		maps,
		seriesScore,
		current: null,
		complete: false,
		rngState: rng.state,
	};
}

export function needsGamePlan(state: LiveSeriesState): boolean {
	return (
		!state.complete &&
		state.current === null &&
		state.maps.length < state.mapQueue.length &&
		Math.max(...state.seriesScore) < winsNeeded(state.format)
	);
}

export function nextMapContext(state: LiveSeriesState): MapContext | undefined {
	return state.mapQueue[state.maps.length];
}

export function startNextMap(
	state: LiveSeriesState,
	gamePlan: GamePlanId = DEFAULT_GAME_PLAN,
): LiveSeriesResult {
	if (state.complete) {
		return failCode("SERIES_COMPLETE", "series is already complete");
	}
	if (state.current && !state.current.complete) {
		return failCode("MAP_IN_PROGRESS", "the current map is still in progress");
	}
	const rng = createRng(state.seed, state.rngState);
	const closed = state.current?.complete ? closeMap(state, rng) : state;
	const closedRng = createRng(closed.seed, closed.rngState);
	if (closed.complete || !needsGamePlan(closed)) {
		return failCode("SERIES_COMPLETE", "series is already complete");
	}
	const nextContext = nextMapContext(closed);
	if (!nextContext) {
		return failCode("SERIES_COMPLETE", "no remaining maps");
	}
	const current = initMap(
		closed.teams,
		closedRng,
		closed.maps.length,
		nextContext,
		resolveGamePlan(gamePlan),
		Boolean(closed.bothSidesPlayer),
	);
	return {
		ok: true,
		value: {
			...closed,
			current,
			rngState: closedRng.state,
		},
	};
}

export function playRound(state: LiveSeriesState): LiveSeriesResult {
	if (state.complete) {
		return failCode("SERIES_COMPLETE", "series is already complete");
	}
	if (!state.current) {
		return failCode("NEED_GAME_PLAN", "pick a game plan before the next map");
	}
	const rng = createRng(state.seed, state.rngState);
	let current = state.current;
	if (current.complete) {
		return { ok: true, value: closeMap(state, rng) };
	}
	current = playMapRound(current, state.teams, rng, Boolean(state.bothSidesPlayer));
	if (!current.complete) {
		current = maybeQueueAutoTimeout(current, state.teams, {
			bothSides: Boolean(state.bothSidesPlayer),
		});
	}
	const withCurrent = attachRng(state, rng, current);
	if (current.complete) {
		return { ok: true, value: closeMap(withCurrent, rng) };
	}
	return { ok: true, value: withCurrent };
}

export function queueTimeout(state: LiveSeriesState): LiveSeriesResult {
	const current = state.current;
	if (state.complete || !current || current.complete) {
		return failCode("MAP_COMPLETE", "timeouts can only be called before the next round");
	}
	if (current.pendingTimeout) {
		return failCode("ALREADY_QUEUED", "a timeout is already queued for the next round");
	}
	if (current.timeoutsRemaining <= 0) {
		return failCode("NO_TIMEOUTS", "no timeouts remaining on this map");
	}
	return {
		ok: true,
		value: {
			...state,
			current: {
				...current,
				pendingTimeout: true,
				timeoutsRemaining: current.timeoutsRemaining - 1,
				morale: applyTimeoutMorale(current.morale, 0),
			},
		},
	};
}

export function skipCurrentMap(state: LiveSeriesState): LiveSeriesState {
	if (state.complete || !state.current) return state;
	let next: LiveSeriesState = state;
	while (!next.complete && next.current) {
		const played = playRound(next);
		if (!played.ok) break;
		next = played.value;
	}
	return next;
}

export function skipRemaining(state: LiveSeriesState): LiveSeriesState {
	let next: LiveSeriesState = state;
	while (!next.complete) {
		if (!next.current) {
			const started = startNextMap(next, DEFAULT_GAME_PLAN);
			if (!started.ok) break;
			next = started.value;
		}
		const played = playRound(next);
		if (!played.ok) break;
		next = played.value;
	}
	return next;
}

export function seriesFromLive(state: LiveSeriesState): SeriesResult {
	const maps = state.complete ? state.maps : playbackMaps(state);
	const score = state.complete ? state.seriesScore : state.seriesScore;
	return {
		seed: state.seed,
		format: state.format,
		teams: state.teams,
		winner: state.winner ?? (score[0] >= score[1] ? 0 : 1),
		score,
		maps,
		...(state.playerMapId ? { playerMapId: state.playerMapId } : {}),
	};
}

export function simulateSeries(input: SimulateSeriesInput): SeriesResult {
	return seriesFromLive(
		skipRemaining(
			startLiveSeries({
				teams: input.teams,
				seed: input.seed,
				format: input.format,
				playerMapId: input.playerMapId,
				gamePlan: input.gamePlan,
				bothSidesPlayer: input.bothSidesPlayer,
				mapQueue: Array.isArray(input.mapContext)
					? [...input.mapContext]
					: input.mapContext
						? [input.mapContext]
						: undefined,
			}),
		),
	);
}

export function canQueueTimeout(state: LiveSeriesState): boolean {
	const current = state.current;
	return Boolean(
		!state.complete &&
			current &&
			!current.complete &&
			!current.pendingTimeout &&
			current.timeoutsRemaining > 0,
	);
}
