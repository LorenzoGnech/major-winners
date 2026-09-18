import type {
	HighlightEvent,
	KillEvent,
	RoundResult,
	SeriesFormat,
	TeamMemberProfile,
	WeaponId,
} from "../engine";
import { WEAPON_LABEL } from "../engine";

export function scoreBefore(round: RoundResult): readonly [number, number] {
	const [a, b] = round.scoreAfter;
	return round.winner === 0 ? [a - 1, b] : [a, b - 1];
}

export function isCrucialRound({
	round,
	format,
	mapIndex,
	seriesScore,
}: {
	round: RoundResult;
	format: SeriesFormat;
	mapIndex: number;
	seriesScore: readonly [number, number];
}): boolean {
	if (round.phase === "overtime") return true;
	if (round.economy.some((row) => row.buy === "pistol")) return true;
	const buys = [round.economy[0]?.buy, round.economy[1]?.buy];
	if (
		(buys[0] === "eco" && buys[1] === "full-buy") ||
		(buys[1] === "eco" && buys[0] === "full-buy")
	) {
		return true;
	}
	const before = scoreBefore(round);
	if (before[0] === 11 && before[1] === 11) return true;
	if (before[0] >= 12 || before[1] >= 12) return true;
	if (format === "BO3" && mapIndex >= 2) return true;
	if (format === "BO3" && seriesScore[0] === 1 && seriesScore[1] === 1) return true;
	if (format === "BO5" && mapIndex >= 4) return true;
	if (format === "BO5" && Math.max(seriesScore[0], seriesScore[1]) >= 2) return true;
	return false;
}

export function clutchHeadline(player: string, against: number): string {
	return `${player} · 1 vs ${against}`;
}

/** Overlay opens on the kill that creates the 1vX, one beat before resolution starts. */
export function clutchMomentStartIndex(startKillIndex: number): number {
	return Math.max(0, startKillIndex - 1);
}

export function clutcherWeapon(
	kills: readonly KillEvent[],
	playerId: string,
): WeaponId | undefined {
	return kills.find((kill) => kill.killerId === playerId)?.weapon;
}

export function clutchOpponents(
	members: readonly TeamMemberProfile[],
	kills: readonly KillEvent[],
	startKillIndex: number,
	revealedCount: number,
): { member: TeamMemberProfile; dead: boolean }[] {
	const deadAtStart = new Set(kills.slice(0, startKillIndex).map((kill) => kill.victimId));
	const deadRevealed = new Set(kills.slice(0, revealedCount).map((kill) => kill.victimId));
	return members
		.filter((member) => !deadAtStart.has(member.id))
		.map((member) => ({ member, dead: deadRevealed.has(member.id) }));
}

export function clutchMomentLines({
	player,
	playerId,
	clutchTeam,
	against,
	won,
	startKillIndex,
	kills,
	revealedCount,
	nameOf,
}: {
	player: string;
	playerId: string;
	clutchTeam: 0 | 1;
	against: number;
	won: boolean;
	startKillIndex: number;
	kills: readonly KillEvent[];
	revealedCount: number;
	nameOf: (id: string) => string;
}): string[] {
	const overlayStart = clutchMomentStartIndex(startKillIndex);
	if (revealedCount <= overlayStart) return [];
	const weapon = clutcherWeapon(kills, playerId);
	const lines = [
		weapon
			? `${player} is left 1 vs ${against} with the ${WEAPON_LABEL[weapon]}.`
			: `${player} is left 1 vs ${against}.`,
	];
	for (let index = startKillIndex; index < revealedCount; index += 1) {
		const kill = kills[index];
		if (!kill) continue;
		const remainingAfter = clutchEnemiesLeft(kills, startKillIndex, index, clutchTeam, against);
		if (kill.killerId === playerId) {
			const victim = nameOf(kill.victimId);
			if (remainingAfter <= 0) {
				lines.push(won ? `${player} takes ${victim} and the round.` : `${player} is denied.`);
			} else if (remainingAfter === 1) {
				lines.push(`${player} finds ${victim}. One left.`);
			} else {
				lines.push(`${player} finds ${victim}. Still a 1 vs ${remainingAfter}.`);
			}
		} else if (kill.victimId === playerId) {
			lines.push(`${nameOf(kill.killerId)} shuts down the 1 vs ${against}.`);
		}
	}
	return lines;
}

export function clutchEnemiesLeft(
	kills: readonly KillEvent[],
	startKillIndex: number,
	throughIndex: number,
	clutchTeam: 0 | 1,
	against: number,
): number {
	const dropped = kills
		.slice(startKillIndex, throughIndex + 1)
		.filter((kill) => kill.victimTeam !== clutchTeam).length;
	return Math.max(0, against - dropped);
}

export function clutchBeatLine({
	player,
	against,
	won,
	killIndex,
	startKillIndex,
	remainingAfter,
	weapon,
}: {
	player: string;
	against: number;
	won: boolean;
	killIndex: number;
	startKillIndex: number;
	remainingAfter: number;
	weapon: WeaponId;
}): string {
	const offset = killIndex - startKillIndex;
	if (offset <= 0) {
		return `${player} is left 1 vs ${against} with the ${WEAPON_LABEL[weapon]}.`;
	}
	if (remainingAfter <= 0) {
		return won ? `${player} takes the round.` : `${player} is denied.`;
	}
	if (remainingAfter === 1) {
		return won ? `One left. ${player} waits the peek.` : `One left, and they're collapsing.`;
	}
	return `Still a 1 vs ${remainingAfter}.`;
}

export function activeClutchSequence(
	highlights: readonly HighlightEvent[],
	roundNumber: number,
	killIndex: number,
): Extract<HighlightEvent, { type: "clutch-sequence" }> | undefined {
	const sequences = highlights.filter(
		(highlight): highlight is Extract<HighlightEvent, { type: "clutch-sequence" }> =>
			highlight.type === "clutch-sequence" && highlight.round === roundNumber,
	);
	return sequences
		.filter((sequence) => killIndex >= sequence.startKillIndex)
		.sort((left, right) => right.startKillIndex - left.startKillIndex)[0];
}
