import type { KillEvent, RoundResult } from "../engine";

const MULTI_KILL_LABEL: Record<number, string> = {
	2: "double",
	3: "triple",
	4: "quad",
	5: "ace",
};

export function openingCastLine(
	round: RoundResult,
	teamLabels: readonly [string, string],
): string | undefined {
	const buyA = round.economy[0]?.buy;
	const buyB = round.economy[1]?.buy;
	if (buyA === "pistol" || buyB === "pistol") {
		return `Pistol round. ${teamLabels[0]} start on ${round.sides[0]}.`;
	}
	if (buyA === "eco" && (buyB === "full-buy" || buyB === "force")) {
		return `${teamLabels[0]} is forced to eco.`;
	}
	if (buyB === "eco" && (buyA === "full-buy" || buyA === "force")) {
		return `${teamLabels[1]} is forced to eco.`;
	}
	if (buyA === "force" && buyB === "full-buy") {
		return `${teamLabels[0]} is on a force buy.`;
	}
	if (buyB === "force" && buyA === "full-buy") {
		return `${teamLabels[1]} is on a force buy.`;
	}
	if (buyA === "force" && buyB === "force") {
		return "Both teams force.";
	}
	if (buyA === "eco" && buyB === "eco") {
		return "A double eco.";
	}
	return undefined;
}

function multiKillLines(kills: readonly KillEvent[], playerName: (id: string) => string): string[] {
	const counts = new Map<string, number>();
	for (const kill of kills) {
		counts.set(kill.killerId, (counts.get(kill.killerId) ?? 0) + 1);
	}
	const lines: string[] = [];
	for (const [playerId, count] of counts) {
		const label = MULTI_KILL_LABEL[count];
		if (!label) continue;
		lines.push(
			count === 5
				? `${playerName(playerId)} with the ace.`
				: `${playerName(playerId)} with the ${label}.`,
		);
	}
	return lines;
}

export function lineupDeadIds(
	revealedKills: readonly KillEvent[],
	clutchStartKillIndex: number | undefined,
): ReadonlySet<string> {
	const freezeAt =
		clutchStartKillIndex === undefined ? revealedKills.length : Math.max(0, clutchStartKillIndex);
	return new Set(revealedKills.slice(0, freezeAt).map((kill) => kill.victimId));
}

export function liveCastLines({
	round,
	kills,
	teamLabels,
	playerName,
	clutchLine,
}: {
	round: RoundResult;
	kills: readonly KillEvent[];
	teamLabels: readonly [string, string];
	playerName: (id: string) => string;
	clutchLine?: string;
}): string[] {
	const lines: string[] = [];
	const economy = openingCastLine(round, teamLabels);
	if (economy) lines.push(economy);
	const opening = kills[0];
	if (opening) {
		lines.push(`${playerName(opening.killerId)} opens on ${playerName(opening.victimId)}.`);
	}
	lines.push(...multiKillLines(kills, playerName));
	if (clutchLine) lines.push(clutchLine);
	return lines;
}
