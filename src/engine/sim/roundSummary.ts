import { createRng, type Rng } from "../rng";
import { MAP_SITES, type SimMapId } from "./maps";
import type { BuyType, KillEvent, RoundResult, RoundSummary, Side } from "./types";

type SummaryClutch = {
	won: boolean;
	team: 0 | 1;
	playerId: string;
	against: 2 | 3 | 4 | 5;
};

const DEFAULT_SITES = ["A", "B"] as const;

function topWinnerKills(
	kills: readonly KillEvent[],
	winner: 0 | 1,
): { playerId: string; count: number } | undefined {
	const counts = new Map<string, number>();
	for (const kill of kills) {
		if (kill.killerTeam !== winner) continue;
		counts.set(kill.killerId, (counts.get(kill.killerId) ?? 0) + 1);
	}
	let best: { playerId: string; count: number } | undefined;
	for (const [playerId, count] of counts) {
		if (!best || count > best.count) best = { playerId, count };
	}
	return best;
}

function pickSite(mapId: string, rng: Rng): string {
	const sites = MAP_SITES[mapId as SimMapId] ?? DEFAULT_SITES;
	return sites[rng.nextInt(sites.length)] ?? "A";
}

export function chooseRoundSummary({
	winner,
	sides,
	buys,
	kills,
	sequences,
	timeout,
	pistol,
	phase,
	mapId,
	rng,
	timeoutTeam = 0,
}: {
	winner: 0 | 1;
	sides: readonly [Side, Side];
	buys: readonly [BuyType, BuyType];
	kills: readonly KillEvent[];
	sequences: readonly SummaryClutch[];
	timeout: boolean;
	pistol: boolean;
	phase: "regulation" | "overtime";
	mapId: string;
	rng: Rng;
	timeoutTeam?: 0 | 1;
}): RoundSummary {
	const loser = winner === 0 ? 1 : 0;
	const winnerBuy = buys[winner];
	const loserBuy = buys[loser];
	const top = topWinnerKills(kills, winner);
	const wonClutch = sequences.find((sequence) => sequence.won && sequence.team === winner);
	const winnerDeaths = kills.filter((kill) => kill.victimTeam === winner).length;

	if (winnerBuy === "eco" && (loserBuy === "full-buy" || loserBuy === "force")) {
		return { kind: "eco-win", team: winner };
	}
	if (top && top.count === 5) {
		return { kind: "ace", team: winner, playerId: top.playerId };
	}
	if (wonClutch) {
		return {
			kind: "clutch",
			team: winner,
			playerId: wonClutch.playerId,
			against: wonClutch.against,
		};
	}
	if (winnerBuy === "force" && loserBuy === "full-buy") {
		return { kind: "force-win", team: winner };
	}
	if (top && (top.count === 3 || top.count === 4)) {
		return { kind: "multikill", team: winner, playerId: top.playerId, kills: top.count };
	}
	if (timeout && winner === timeoutTeam) {
		return { kind: "timeout-payoff", team: winner };
	}
	if (pistol) {
		return { kind: "pistol", team: winner, side: sides[winner] };
	}
	if (phase === "overtime") {
		return { kind: "overtime", team: winner };
	}
	if (winnerDeaths === 0) {
		return { kind: "clean-sweep", team: winner, site: pickSite(mapId, rng) };
	}
	if (sides[winner] === "T") {
		return { kind: "execute", team: winner, site: pickSite(mapId, rng) };
	}
	return { kind: "hold", team: winner, site: pickSite(mapId, rng) };
}

/** Rebuild a summary for older persisted rounds that predate the field. */
export function resolveRoundSummary(round: RoundResult, mapId = ""): RoundSummary {
	if (round.summary) return round.summary;
	return chooseRoundSummary({
		winner: round.winner,
		sides: round.sides,
		buys: [round.economy[0]?.buy ?? "full-buy", round.economy[1]?.buy ?? "full-buy"],
		kills: round.kills,
		sequences: [],
		timeout: round.timeout,
		pistol: round.economy[0]?.buy === "pistol",
		phase: round.phase,
		mapId,
		rng: createRng(round.round),
	});
}

export function formatRoundSummary(
	summary: RoundSummary,
	teamLabels: readonly [string, string],
	playerName: (id: string) => string,
): string {
	const team = teamLabels[summary.team];
	switch (summary.kind) {
		case "eco-win":
			return `An unexpected eco-round win for ${team}.`;
		case "force-win":
			return `${team} convert a force buy and steal the round.`;
		case "ace":
			return `${playerName(summary.playerId)} aces and brings the round to ${team}.`;
		case "clutch":
			return `${playerName(summary.playerId)} clutches the 1v${summary.against} for ${team}.`;
		case "multikill":
			return `${playerName(summary.playerId)} ${summary.kills} kills bring the round to ${team}.`;
		case "timeout-payoff":
			return `The timeout pays off — ${team} take the round.`;
		case "pistol":
			return summary.side === "T" ? `${team} smash the T pistol.` : `${team} win the CT pistol.`;
		case "overtime":
			return `${team} steal the overtime round.`;
		case "clean-sweep":
			return `${team} sweep the site on ${summary.site} without dropping a player.`;
		case "execute":
			return `Great ${summary.site} execution by ${team}, winning the round.`;
		case "hold":
			return `${team} hold ${summary.site} and take the round.`;
		case "default":
			return `${team} take the round.`;
	}
}
