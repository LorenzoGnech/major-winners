import { clamp } from "../math";
import type { Rng } from "../rng";
import type { TeamProfile } from "../team";
import { EQUIPMENT_STRENGTH, EQUIPMENT_WEIGHT } from "./economy";
import type { MapStyle } from "./maps";
import type {
	BuyType,
	LiveMapState,
	LiveSeriesState,
	MapResult,
	PlayerMapStats,
	RoundResult,
	RoundWinContext,
	Side,
} from "./types";

export const HOME_PICK_EDGE = 0.03;

export function homePickDelta(context: { homePick?: boolean; pickedBy?: 0 | 1 }): number {
	if (context.pickedBy === 1) return -HOME_PICK_EDGE;
	if (context.pickedBy === 0 || context.homePick) return HOME_PICK_EDGE;
	return 0;
}

function round(value: number, digits = 3): number {
	const multiplier = 10 ** digits;
	return Math.round(value * multiplier) / multiplier;
}

function sideStrength(team: TeamProfile, side: Side, style: MapStyle = "hybrid"): number {
	const { attributes } = team;
	const antiStrat = team.details.coaching.antiStrat;
	if (style === "aim") {
		if (side === "CT") {
			return (
				attributes.aim * 0.5 +
				attributes.clutch * 0.2 +
				attributes.entry * 0.15 +
				attributes.utility * 0.1 +
				attributes.igl * 0.05
			);
		}
		return (
			attributes.entry * 0.4 +
			attributes.aim * 0.4 +
			attributes.utility * 0.1 +
			attributes.igl * 0.1
		);
	}
	if (style === "tactical") {
		const iglBoost = antiStrat * 0.15;
		if (side === "CT") {
			return (
				attributes.aim * 0.2 +
				attributes.utility * 0.3 +
				attributes.clutch * 0.15 +
				attributes.igl * 0.35 +
				iglBoost
			);
		}
		return (
			attributes.entry * 0.2 +
			attributes.aim * 0.2 +
			attributes.utility * 0.25 +
			attributes.igl * 0.35 +
			iglBoost
		);
	}
	if (side === "CT") {
		return (
			attributes.aim * 0.35 +
			attributes.utility * 0.3 +
			attributes.clutch * 0.2 +
			attributes.igl * 0.15
		);
	}
	return (
		attributes.entry * 0.35 +
		attributes.aim * 0.3 +
		attributes.utility * 0.2 +
		attributes.igl * 0.15
	);
}

export function roundWinProbability(
	teams: readonly [TeamProfile, TeamProfile],
	sides: readonly [Side, Side],
	buys: readonly [BuyType, BuyType],
	score: readonly [number, number],
	pistol: boolean,
	context: RoundWinContext = {},
): number {
	const style = context.mapStyle ?? "hybrid";
	const overall = (teams[0].overall - teams[1].overall) * 0.006;
	const tactical =
		(sideStrength(teams[0], sides[0], style) - sideStrength(teams[1], sides[1], style)) * 0.001;
	const ctEdge = sides[0] === "CT" ? 0.018 : -0.018;
	const equipment = (EQUIPMENT_STRENGTH[buys[0]] - EQUIPMENT_STRENGTH[buys[1]]) * EQUIPMENT_WEIGHT;
	const pistolEdge = pistol
		? (teams[0].attributes.aim +
				teams[0].attributes.entry -
				(teams[1].attributes.aim + teams[1].attributes.entry)) *
			0.0006
		: 0;
	const deficit = score[1] - score[0];
	const comeback =
		deficit > 0
			? (teams[0].details.coaching.comebackResilience - 50) * 0.00025
			: deficit < 0
				? -(teams[1].details.coaching.comebackResilience - 50) * 0.00025
				: 0;
	const home = homePickDelta(context);
	const morale =
		context.morale !== undefined ? (context.morale[0] - context.morale[1]) * 0.0012 : 0;
	const timeout = context.timeoutTeam === 0 ? 0.04 : context.timeoutTeam === 1 ? -0.04 : 0;
	const pistolBias = pistol ? (context.pistolBias ?? 0) : 0;
	const earlyRoundBias = context.earlyRoundBias ?? 0;
	const bonus = context.bonusWinProb ?? 0;
	return round(
		clamp(
			0.5 +
				overall +
				tactical +
				ctEdge +
				equipment +
				pistolEdge +
				pistolBias +
				earlyRoundBias +
				comeback +
				home +
				morale +
				timeout +
				bonus,
			0.12,
			0.88,
		),
	);
}

/** Average LAN-map baselines. 1.00 is a typical map, not a floor. */
const RATING_BASELINE = {
	kpr: 0.67,
	dpr: 0.67,
	apr: 0.25,
	adr: 75,
	kast: 70,
} as const;

/** HLTV-style display rating. Average KPR/DPR/ADR/KAST lands at 1.00. */
export function scoreboardRating({
	kills,
	deaths,
	assists,
	adr,
	kast,
	rounds,
}: {
	kills: number;
	deaths: number;
	assists: number;
	adr: number;
	kast: number;
	rounds: number;
}): number {
	if (rounds <= 0) return 1;
	const kpr = kills / rounds;
	const dpr = deaths / rounds;
	const apr = assists / rounds;
	return round(
		clamp(
			1 +
				(kpr - RATING_BASELINE.kpr) * 0.7 +
				(RATING_BASELINE.dpr - dpr) * 0.5 +
				(apr - RATING_BASELINE.apr) * 0.12 +
				(adr - RATING_BASELINE.adr) / 200 +
				(kast - RATING_BASELINE.kast) / 400,
			0.4,
			2,
		),
		2,
	);
}

export function scoreboard(
	teams: readonly [TeamProfile, TeamProfile],
	rounds: readonly RoundResult[],
	rng: Rng,
): [PlayerMapStats[], PlayerMapStats[]] {
	if (rounds.length === 0) {
		return teams.map((team) =>
			team.members.map((member) => ({
				playerId: member.id,
				nick: member.nick,
				kills: 0,
				deaths: 0,
				assists: 0,
				adr: 0,
				kast: 0,
				rating: 1,
			})),
		) as [PlayerMapStats[], PlayerMapStats[]];
	}
	return teams.map((team) =>
		team.members.map((member) => {
			let kills = 0;
			let deaths = 0;
			let assists = 0;
			let kastRounds = 0;
			for (const result of rounds) {
				const events = result.kills;
				const killed = events.some((event) => event.victimId === member.id);
				const playerKills = events.filter((event) => event.killerId === member.id).length;
				const playerAssists = events.filter((event) => event.assisterId === member.id).length;
				kills += playerKills;
				deaths += killed ? 1 : 0;
				assists += playerAssists;
				if (!killed || playerKills > 0 || playerAssists > 0) kastRounds += 1;
			}
			const adr = Math.round(
				clamp((kills * (102 + rng.nextInt(21)) + assists * 22) / rounds.length, 25, 140),
			);
			const kast = Math.round((kastRounds / rounds.length) * 100);
			return {
				playerId: member.id,
				nick: member.nick,
				kills,
				deaths,
				assists,
				adr,
				kast,
				rating: scoreboardRating({
					kills,
					deaths,
					assists,
					adr,
					kast,
					rounds: rounds.length,
				}),
			};
		}),
	) as [PlayerMapStats[], PlayerMapStats[]];
}

export function playbackMaps(state: LiveSeriesState): MapResult[] {
	const maps = [...state.maps];
	if (state.current && !state.current.complete) {
		maps.push(partialMapResult(state.current));
	}
	return maps;
}

export function partialMapResult(current: LiveMapState): MapResult {
	const winner: 0 | 1 = current.score[0] >= current.score[1] ? 0 : 1;
	return {
		label: current.mapContext.label,
		mapContext: current.mapContext,
		gamePlan: current.gamePlan,
		winner: current.winner ?? winner,
		score: current.score,
		regulationScore: current.regulationScore ?? current.score,
		overtimeBlocks: current.overtimeBlocks,
		rounds: current.rounds,
		scoreboard: current.scoreboard ?? [[], []],
		highlights: current.highlights,
	};
}
