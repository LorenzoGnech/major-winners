import type { Rng } from "../rng";
import type { TeamMemberProfile, TeamProfile } from "../team";
import type { FeaturedAgainst } from "./clutch";
import type { KillEvent, WeaponId } from "./types";

function other(team: 0 | 1): 0 | 1 {
	return team === 0 ? 1 : 0;
}

export function combatWeight(member: TeamMemberProfile): number {
	const roleBoost = member.slot === "entry" ? 6 : member.slot === "awp" ? 4 : 0;
	return (
		member.attributes.aim * 0.45 +
		member.attributes.entry * 0.2 +
		member.attributes.clutch * 0.15 +
		member.effectiveOvr * 0.2 +
		roleBoost
	);
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

export type ClutchSequence = {
	team: 0 | 1;
	playerId: string;
	against: 2 | 3 | 4 | 5;
	startKillIndex: number;
	won: boolean;
};

export type ClutchIntent = "none" | "win" | "lose";

function asAgainst(count: number): 2 | 3 | 4 | 5 | undefined {
	if (count === 2 || count === 3 || count === 4 || count === 5) return count;
	return undefined;
}

export function makeKills(
	teams: readonly [TeamProfile, TeamProfile],
	winner: 0 | 1,
	rng: Rng,
	loadouts: ReadonlyMap<string, WeaponId>,
	intent: ClutchIntent = "none",
	against?: FeaturedAgainst,
): { kills: KillEvent[]; sequences: ClutchSequence[] } {
	const loser = other(winner);
	const alive: [Set<string>, Set<string>] = [
		new Set(teams[0].members.map((member) => member.id)),
		new Set(teams[1].members.map((member) => member.id)),
	];
	const kills: KillEvent[] = [];

	const living = (team: 0 | 1): TeamMemberProfile[] =>
		teams[team].members.filter((member) => alive[team].has(member.id));

	const recordKill = (killerTeam: 0 | 1): boolean => {
		const victimTeam = other(killerTeam);
		const killers = living(killerTeam);
		const victims = living(victimTeam);
		if (killers.length === 0 || victims.length === 0) return false;
		const killer = weightedMember(killers, combatWeight, rng);
		const victim = weightedMember(victims, (member) => 125 - member.attributes.consistency, rng);
		const assist =
			rng.next() < 0.42
				? weightedMember(
						killers,
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
			weapon: loadouts.get(killer.id) ?? "ak47",
			...(assist ? { assisterId: assist.id } : {}),
		});
		alive[victimTeam].delete(victim.id);
		return true;
	};

	if (intent !== "none" && against) {
		const clutcherTeam = intent === "win" ? winner : loser;
		const facingTeam = other(clutcherTeam);
		let clutcherDeathsNeeded = living(clutcherTeam).length - 1;
		let facingDeathsNeeded = living(facingTeam).length - against;
		while (clutcherDeathsNeeded > 0 || facingDeathsNeeded > 0) {
			const canDropClutcher = clutcherDeathsNeeded > 0;
			const canDropFacing = facingDeathsNeeded > 0;
			let killerTeam: 0 | 1;
			if (canDropClutcher && canDropFacing) {
				killerTeam = rng.next() < 0.5 ? facingTeam : clutcherTeam;
			} else if (canDropClutcher) {
				killerTeam = facingTeam;
			} else {
				killerTeam = clutcherTeam;
			}
			if (!recordKill(killerTeam)) break;
			if (killerTeam === facingTeam) clutcherDeathsNeeded -= 1;
			else facingDeathsNeeded -= 1;
		}
		const survivor = living(clutcherTeam)[0];
		const facing = asAgainst(alive[facingTeam].size);
		const sequences: ClutchSequence[] = [];
		if (survivor && facing) {
			sequences.push({
				team: clutcherTeam,
				playerId: survivor.id,
				against: facing,
				startKillIndex: kills.length,
				won: intent === "win",
			});
		}
		if (intent === "win") {
			while (alive[loser].size > 0) recordKill(winner);
		} else if (alive[loser].size > 0) {
			recordKill(winner);
		}
		return { kills, sequences };
	}

	const targetWinnerAlive =
		intent === "win" ? 1 : intent === "lose" ? 2 + rng.nextInt(3) : 5 - rng.nextInt(5);
	let wonClutch: ClutchSequence | undefined;
	let lostClutch: ClutchSequence | undefined;

	while (alive[loser].size > 0) {
		const canKillWinner = alive[winner].size > targetWinnerAlive;
		let killerTeam: 0 | 1;
		if (intent === "win" && alive[winner].size > 1) {
			killerTeam = alive[loser].size > 2 && rng.next() < 0.35 ? winner : loser;
		} else if (!canKillWinner) {
			killerTeam = winner;
		} else {
			const winnerWeight = living(winner).reduce((sum, member) => sum + combatWeight(member), 0);
			const loserWeight = living(loser).reduce((sum, member) => sum + combatWeight(member), 0);
			killerTeam = rng.next() * (winnerWeight + loserWeight) < winnerWeight ? winner : loser;
		}
		if (!recordKill(killerTeam)) break;

		if (!wonClutch && alive[winner].size === 1 && alive[loser].size >= 2) {
			const survivor = living(winner)[0];
			const facing = asAgainst(alive[loser].size);
			if (survivor && facing) {
				wonClutch = {
					team: winner,
					playerId: survivor.id,
					against: facing,
					startKillIndex: kills.length,
					won: true,
				};
			}
		}
		if (!lostClutch && alive[loser].size === 1 && alive[winner].size >= 2) {
			const survivor = living(loser)[0];
			const facing = asAgainst(alive[winner].size);
			if (survivor && facing) {
				lostClutch = {
					team: loser,
					playerId: survivor.id,
					against: facing,
					startKillIndex: kills.length,
					won: false,
				};
			}
		}
	}

	const sequences: ClutchSequence[] = [];
	if (intent === "win" && wonClutch) sequences.push(wonClutch);
	if (intent === "lose" && lostClutch) sequences.push(lostClutch);
	return { kills, sequences };
}
