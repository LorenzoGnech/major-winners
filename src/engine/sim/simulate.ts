import { clamp } from "../math";
import { createRng, normalizeSeed, type Rng } from "../rng";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { chooseBuy, EQUIPMENT_STRENGTH, INITIAL_ECONOMY, resolveEconomyRound } from "./economy";
import type {
	BuyType,
	EconomyState,
	HighlightEvent,
	KillEvent,
	MapContext,
	MapResult,
	PlayerMapStats,
	RoundPhase,
	RoundResult,
	SeriesResult,
	Side,
	SimulateSeriesInput,
} from "./types";

const MAX_OVERTIME_BLOCKS = 12;

function round(value: number, digits = 3): number {
	const multiplier = 10 ** digits;
	return Math.round(value * multiplier) / multiplier;
}

function other(team: 0 | 1): 0 | 1 {
	return team === 0 ? 1 : 0;
}

function weightedMember(
	members: readonly TeamMemberProfile[],
	weight: (member: TeamMemberProfile) => number,
	rng: Rng,
	excluded: ReadonlySet<string> = new Set(),
): TeamMemberProfile {
	const candidates = members.filter((member) => !excluded.has(member.id));
	const weights = candidates.map((member) => Math.max(0.01, weight(member)));
	let ticket = rng.next() * weights.reduce((sum, value) => sum + value, 0);
	for (let index = 0; index < candidates.length; index += 1) {
		ticket -= weights[index] ?? 0;
		if (ticket < 0) return candidates[index] as TeamMemberProfile;
	}
	return candidates[candidates.length - 1] as TeamMemberProfile;
}

function combatWeight(member: TeamMemberProfile): number {
	const roleBoost = member.slot === "entry" ? 6 : member.slot === "awp" ? 4 : 0;
	return (
		member.attributes.aim * 0.45 +
		member.attributes.entry * 0.2 +
		member.attributes.clutch * 0.15 +
		member.effectiveOvr * 0.2 +
		roleBoost
	);
}

function makeKills(
	teams: readonly [TeamProfile, TeamProfile],
	winner: 0 | 1,
	rng: Rng,
): KillEvent[] {
	const loser = other(winner);
	const loserDeaths = 3 + rng.nextInt(3);
	const winnerDeaths = rng.nextInt(5);
	const kills: KillEvent[] = [];

	const addCasualties = (killerTeam: 0 | 1, victimTeam: 0 | 1, count: number) => {
		const dead = new Set<string>();
		for (let index = 0; index < count; index += 1) {
			const killer = weightedMember(teams[killerTeam].members, combatWeight, rng);
			const victim = weightedMember(
				teams[victimTeam].members,
				(member) => 125 - member.attributes.consistency,
				rng,
				dead,
			);
			dead.add(victim.id);
			const assist =
				rng.next() < 0.42
					? weightedMember(
							teams[killerTeam].members,
							(member) => member.attributes.utility + member.attributes.igl * 0.25,
							rng,
							new Set([killer.id]),
						)
					: undefined;
			kills.push({
				killerTeam,
				killerId: killer.id,
				victimTeam,
				victimId: victim.id,
				...(assist ? { assisterId: assist.id } : {}),
			});
		}
	};

	addCasualties(winner, loser, loserDeaths);
	addCasualties(loser, winner, winnerDeaths);
	for (let index = kills.length - 1; index > 0; index -= 1) {
		const swapIndex = rng.nextInt(index + 1);
		[kills[index], kills[swapIndex]] = [kills[swapIndex] as KillEvent, kills[index] as KillEvent];
	}
	return kills;
}

function sideStrength(team: TeamProfile, side: Side): number {
	const { attributes } = team;
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
): number {
	const overall = (teams[0].overall - teams[1].overall) * 0.006;
	const tactical = (sideStrength(teams[0], sides[0]) - sideStrength(teams[1], sides[1])) * 0.001;
	const ctEdge = sides[0] === "CT" ? 0.018 : -0.018;
	const equipment = (EQUIPMENT_STRENGTH[buys[0]] - EQUIPMENT_STRENGTH[buys[1]]) * 0.15;
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
	return round(
		clamp(0.5 + overall + tactical + ctEdge + equipment + pistolEdge + comeback, 0.16, 0.84),
	);
}

function initialSides(rng: Rng): [Side, Side] {
	return rng.nextInt(2) === 0 ? ["CT", "T"] : ["T", "CT"];
}

function swapped(sides: readonly [Side, Side]): [Side, Side] {
	return [sides[1], sides[0]];
}

function scoreboard(
	teams: readonly [TeamProfile, TeamProfile],
	rounds: readonly RoundResult[],
	rng: Rng,
): [PlayerMapStats[], PlayerMapStats[]] {
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
				clamp((kills * (72 + rng.nextInt(17)) + assists * 18) / rounds.length, 25, 135),
			);
			const kast = Math.round((kastRounds / rounds.length) * 100);
			const rating = round(
				clamp(0.55 + (kills / Math.max(1, deaths)) * 0.35 + adr / 400 + kast / 500, 0.4, 2),
				1,
			);
			return { playerId: member.id, nick: member.nick, kills, deaths, assists, adr, kast, rating };
		}),
	) as [PlayerMapStats[], PlayerMapStats[]];
}

function contextFor(
	context: MapContext | readonly MapContext[] | undefined,
	index: number,
): MapContext | undefined {
	if (Array.isArray(context)) return context[index] as MapContext | undefined;
	return context as MapContext | undefined;
}

function simulateMap(
	teams: readonly [TeamProfile, TeamProfile],
	rng: Rng,
	mapIndex: number,
	mapContext: MapContext | undefined,
): MapResult {
	const score: [number, number] = [0, 0];
	let regulationScore: [number, number] = [0, 0];
	let sides = initialSides(rng);
	let economies: [EconomyState, EconomyState] = [{ ...INITIAL_ECONOMY }, { ...INITIAL_ECONOMY }];
	const rounds: RoundResult[] = [];
	const highlights: HighlightEvent[] = [];
	const maxDeficit: [number, number] = [0, 0];
	const comebackEmitted: [boolean, boolean] = [false, false];

	const playRound = (phase: RoundPhase, overtimeBlock?: number, resetCash = false): 0 | 1 => {
		const roundNumber = rounds.length + 1;
		const pistol = phase === "regulation" && (roundNumber === 1 || roundNumber === 13);
		if (pistol) economies = [{ ...INITIAL_ECONOMY }, { ...INITIAL_ECONOMY }];
		if (resetCash) {
			economies = [
				{ bank: 10_000, lossBonus: 1_400, losses: 0 },
				{ bank: 10_000, lossBonus: 1_400, losses: 0 },
			];
		}
		const buys: [BuyType, BuyType] = [
			chooseBuy(economies[0], {
				pistol,
				economyDiscipline: teams[0].details.coaching.economyDiscipline,
			}),
			chooseBuy(economies[1], {
				pistol,
				economyDiscipline: teams[1].details.coaching.economyDiscipline,
			}),
		];
		const probability = roundWinProbability(teams, sides, buys, score, pistol);
		const winner: 0 | 1 = rng.next() < probability ? 0 : 1;
		const kills = makeKills(teams, winner, rng);
		const economyA = resolveEconomyRound(economies[0], buys[0], winner === 0);
		const economyB = resolveEconomyRound(economies[1], buys[1], winner === 1);
		economies = [economyA.state, economyB.state];
		score[winner] += 1;
		maxDeficit[0] = Math.max(maxDeficit[0], score[1] - score[0]);
		maxDeficit[1] = Math.max(maxDeficit[1], score[0] - score[1]);
		rounds.push({
			round: roundNumber,
			phase,
			...(overtimeBlock === undefined ? {} : { overtimeBlock }),
			sides,
			winner,
			winProbabilityTeamA: probability,
			scoreAfter: [...score],
			economy: [economyA.round, economyB.round],
			kills,
		});

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
				highlights.push({
					type: "ace",
					round: roundNumber,
					team: winner,
					playerId,
				});
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
		const winnerDeaths = kills.filter((kill) => kill.victimTeam === winner).length;
		if (winnerDeaths === 4) {
			const survivor = teams[winner].members.find(
				(member) => !kills.some((kill) => kill.victimId === member.id),
			);
			if (survivor) {
				highlights.push({
					type: "clutch",
					round: roundNumber,
					team: winner,
					playerId: survivor.id,
					against: 1 + rng.nextInt(3),
				});
			}
		}
		const loser = other(winner);
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
		if (
			score[loser] >= 4 &&
			score[winner] - score[loser] >= 4 &&
			rng.next() < teams[loser].details.coaching.antiStrat / 180
		) {
			highlights.push({
				type: "coach-timeout",
				round: roundNumber,
				team: loser,
				coachId: teams[loser].coach.id,
			});
		}
		return winner;
	};

	while (score[0] < 13 && score[1] < 13 && rounds.length < 24) {
		if (rounds.length === 12) sides = swapped(sides);
		playRound("regulation");
	}
	regulationScore = [...score];

	let overtimeBlocks = 0;
	if (score[0] === 12 && score[1] === 12) {
		let overtimeSides = rng.nextInt(2) === 0 ? sides : swapped(sides);
		for (let block = 1; block <= MAX_OVERTIME_BLOCKS; block += 1) {
			overtimeBlocks = block;
			const blockWins: [number, number] = [0, 0];
			for (let localRound = 0; localRound < 6; localRound += 1) {
				if (localRound === 3) overtimeSides = swapped(overtimeSides);
				sides = overtimeSides;
				const winner = playRound("overtime", block, localRound === 0 || localRound === 3);
				blockWins[winner] += 1;
				if (blockWins[winner] === 4) break;
			}
			if (blockWins[0] === 4 || blockWins[1] === 4) break;
			overtimeSides = swapped(overtimeSides);
		}
		if (score[0] === score[1]) {
			playRound("overtime", MAX_OVERTIME_BLOCKS, true);
		}
	}

	const winner: 0 | 1 = score[0] > score[1] ? 0 : 1;
	return {
		label: mapContext?.label ?? `Map ${mapIndex + 1}`,
		...(mapContext ? { mapContext } : {}),
		winner,
		score,
		regulationScore,
		overtimeBlocks,
		rounds,
		scoreboard: scoreboard(teams, rounds, rng),
		highlights,
	};
}

export function simulateSeries(input: SimulateSeriesInput): SeriesResult {
	const seed = normalizeSeed(input.seed);
	const rng = createRng(seed);
	const maps: MapResult[] = [];
	const score: [number, number] = [0, 0];
	const winsNeeded = input.format === "BO1" ? 1 : 2;
	const maximumMaps = input.format === "BO1" ? 1 : 3;
	for (let mapIndex = 0; mapIndex < maximumMaps && Math.max(...score) < winsNeeded; mapIndex += 1) {
		const result = simulateMap(input.teams, rng, mapIndex, contextFor(input.mapContext, mapIndex));
		maps.push(result);
		score[result.winner] += 1;
	}
	return {
		seed,
		format: input.format,
		teams: input.teams,
		winner: score[0] > score[1] ? 0 : 1,
		score,
		maps,
	};
}
