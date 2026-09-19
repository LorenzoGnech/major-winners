import assert from "node:assert/strict";
import type { Role } from "../src/data";
import type { TeamMemberProfile, TeamProfile } from "../src/engine";
import { simulateSeries } from "../src/engine";

const SAMPLES = 2_000;
const roles: readonly Role[] = ["awp", "igl", "entry", "support", "lurker"];

function makeTeam(prefix: string, overall: number): TeamProfile {
	const attributes = {
		aim: 80,
		entry: 80,
		clutch: 80,
		utility: 80,
		consistency: 80,
		igl: 80,
	};
	const members: TeamMemberProfile[] = roles.map((slot, index) => ({
		id: `${prefix}-${index}`,
		playerId: `${prefix}-${index}`,
		nick: `${prefix}${index}`,
		nationality: "DK",
		orgId: prefix,
		year: 2020,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: overall,
		effectiveOvr: overall,
		attributes,
	}));
	return {
		seed: 0,
		overall,
		components: {
			baseStrength: overall,
			chemistry: 75,
			communication: 90,
			structure: 90,
			coaching: 60,
		},
		details: {
			chemistry: {
				score: 75,
				sharedOrgYearPairs: 5,
				sharedTeamPairs: 5,
				sharedNationalityPairs: 10,
				bonus: 25,
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
		members,
		coach: { id: `${prefix}-coach`, nick: `${prefix} coach` },
		strengths: [],
		weaknesses: [],
	};
}

function run(left: TeamProfile, right: TeamProfile) {
	let leftWins = 0;
	let rounds = 0;
	let overtimeMaps = 0;
	for (let seed = 0; seed < SAMPLES; seed += 1) {
		const map = simulateSeries({
			teams: [left, right],
			seed: `harness-${seed}`,
			format: "BO1",
		}).maps[0];
		if (!map) throw new Error("simulation returned no map");
		leftWins += map.winner === 0 ? 1 : 0;
		rounds += map.rounds.length;
		overtimeMaps += map.overtimeBlocks > 0 ? 1 : 0;
	}
	return {
		winRate: leftWins / SAMPLES,
		averageRounds: rounds / SAMPLES,
		overtimeRate: overtimeMaps / SAMPLES,
	};
}

const equal = run(makeTeam("equal-a", 80), makeTeam("equal-b", 80));
const stronger = run(makeTeam("strong", 90), makeTeam("baseline", 80));

console.log(`Sim harness (${SAMPLES.toLocaleString()} deterministic BO1s per matchup)`);
console.log(
	`Equal teams: ${(equal.winRate * 100).toFixed(1)}% team A wins, ${equal.averageRounds.toFixed(1)} avg rounds, ${(equal.overtimeRate * 100).toFixed(1)}% OT`,
);
console.log(
	`+10 OVR team: ${(stronger.winRate * 100).toFixed(1)}% wins, ${stronger.averageRounds.toFixed(1)} avg rounds, ${(stronger.overtimeRate * 100).toFixed(1)}% OT`,
);

assert(equal.winRate >= 0.45 && equal.winRate <= 0.55, "equal-team win rate left 45–55%");
assert(
	stronger.winRate >= 0.78 && stronger.winRate <= 0.93,
	"+10 OVR team should be favored without certainty",
);
assert(equal.averageRounds >= 18 && equal.averageRounds <= 27, "average map length is implausible");
