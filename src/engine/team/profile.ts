import { type Coach, type PlayerSeason, ROLES, type Role } from "../../data/schema";
import { clamp } from "../math";
import type { Attributes } from "../ratings/attributes";
import type { RatedPlayer } from "../ratings/rate";
import type {
	CoachingDetail,
	CommunicationDetail,
	StructureDetail,
	TeamMemberProfile,
	TeamProfile,
	TeamProfileInputs,
} from "./types";

export const TEAM_PROFILE_WEIGHTS = {
	chemistry: 0.08,
	communication: 0.05,
	structure: 0.12,
} as const;

export const TEAM_PROFILE_BASELINES = {
	chemistry: 50,
	communication: 75,
	structure: 75,
} as const;

export const CHEMISTRY_PAIR_BONUS = 4;
export const CHEMISTRY_BONUS_CAP = 32;
export const COACH_COMMUNICATION_WEIGHT = 0.1;
export const COACH_OVR_PER_MODIFIER = 0.25;

const ATTRIBUTE_KEYS = [
	"aim",
	"entry",
	"clutch",
	"utility",
	"consistency",
	"igl",
] as const satisfies readonly (keyof Attributes)[];

const LANGUAGE_GROUPS: Readonly<Record<string, readonly string[]>> = {
	BR: ["portuguese"],
	CA: ["english"],
	DK: ["english", "scandinavian"],
	EE: ["english", "baltic"],
	GB: ["english"],
	IE: ["english"],
	LV: ["english", "baltic"],
	NO: ["english", "scandinavian"],
	RU: ["russian", "east-slavic"],
	SE: ["english", "scandinavian"],
	UA: ["russian", "east-slavic"],
	US: ["english"],
};

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

function average(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function pairCompatibility(left: string, right: string): number {
	if (left === right) {
		return 1;
	}
	const leftGroups = LANGUAGE_GROUPS[left] ?? [];
	const rightGroups = LANGUAGE_GROUPS[right] ?? [];
	if (leftGroups.some((language) => rightGroups.includes(language))) {
		return 0.92;
	}
	return 0.68;
}

function pairValues<T>(rows: readonly T[], value: (left: T, right: T) => number): number[] {
	const values: number[] = [];
	for (let left = 0; left < rows.length; left += 1) {
		for (let right = left + 1; right < rows.length; right += 1) {
			const leftRow = rows[left];
			const rightRow = rows[right];
			if (leftRow !== undefined && rightRow !== undefined) {
				values.push(value(leftRow, rightRow));
			}
		}
	}
	return values;
}

function memberFor(
	role: Role,
	season: PlayerSeason,
	rated: RatedPlayer,
	fit: TeamMemberProfile["fit"],
): TeamMemberProfile {
	return {
		id: season.id,
		nick: season.nick,
		nationality: season.nationality,
		orgId: season.orgId,
		year: season.year,
		slot: role,
		primaryRole: season.primaryRole,
		roles: season.roles,
		fit,
		ovr: rated.ovr,
		effectiveOvr: round1(rated.ovr * fit),
		attributes: rated.attributes,
	};
}

function aggregateAttributes(members: readonly TeamMemberProfile[]): Attributes {
	return Object.fromEntries(
		ATTRIBUTE_KEYS.map((key) => [
			key,
			round1(average(members.map((member) => member.attributes[key] * member.fit))),
		]),
	) as Attributes;
}

function communication(members: readonly TeamMemberProfile[], coach: Coach): CommunicationDetail {
	const playerPairCompatibility = average(
		pairValues(members, (left, right) => pairCompatibility(left.nationality, right.nationality)),
	);
	const coachCompatibility = average(
		members.map((member) => pairCompatibility(member.nationality, coach.nationality)),
	);
	const score = round1(
		(playerPairCompatibility * (1 - COACH_COMMUNICATION_WEIGHT) +
			coachCompatibility * COACH_COMMUNICATION_WEIGHT) *
			100,
	);
	return {
		score,
		playerPairCompatibility: round1(playerPairCompatibility * 100),
		coachCompatibility: round1(coachCompatibility * 100),
		heuristic: "conservative-language-family",
	};
}

function structure(members: readonly TeamMemberProfile[]): StructureDetail {
	const naturalRoleCount = members.filter((member) => member.fit === 1).length;
	const secondaryRoleCount = members.filter((member) => member.fit === 0.9).length;
	const offRoleCount = members.length - naturalRoleCount - secondaryRoleCount;
	const igl = members.find((member) => member.slot === "igl");
	const iglFit =
		igl?.primaryRole === "igl" ? "primary" : igl?.roles.includes("igl") ? "secondary" : "missing";
	const primaryAwpCount = members.filter((member) => member.primaryRole === "awp").length;
	const roleCoverage = 50 + naturalRoleCount * 8 + secondaryRoleCount * 4;
	const iglAdjustment = iglFit === "primary" ? 10 : iglFit === "secondary" ? 3 : -25;
	const awpPenalty = Math.max(0, primaryAwpCount - 1) * 6;
	return {
		score: round1(clamp(roleCoverage + iglAdjustment - awpPenalty, 0, 100)),
		naturalRoleCount,
		secondaryRoleCount,
		offRoleCount,
		iglFit,
		primaryAwpCount,
	};
}

function coaching(attributes: Attributes, coach: Coach): CoachingDetail {
	const comebackResilience = round1(
		clamp(
			attributes.clutch * 0.55 + attributes.consistency * 0.45 + coach.modifiers.comeback * 3,
			0,
			100,
		),
	);
	const economyDiscipline = round1(
		clamp(
			attributes.utility * 0.55 + attributes.consistency * 0.45 + coach.modifiers.economy * 3,
			0,
			100,
		),
	);
	const antiStrat = round1(
		clamp(
			attributes.igl * 0.55 + attributes.utility * 0.45 + coach.modifiers.antistrat * 3,
			0,
			100,
		),
	);
	const modifierTotal =
		coach.modifiers.comeback + coach.modifiers.economy + coach.modifiers.antistrat;
	return {
		score: round1(clamp(50 + modifierTotal * 5, 0, 100)),
		overallImpact: round1(modifierTotal * COACH_OVR_PER_MODIFIER),
		comebackResilience,
		economyDiscipline,
		antiStrat,
	};
}

function labels(
	baseStrength: number,
	chemistryScore: number,
	communicationScore: number,
	structureDetail: StructureDetail,
	coachingDetail: CoachingDetail,
): Pick<TeamProfile, "strengths" | "weaknesses"> {
	const strengths: string[] = [];
	const weaknesses: string[] = [];

	if (baseStrength >= 88) strengths.push("Elite individual firepower");
	else if (baseStrength >= 82) strengths.push("Strong individual quality");
	else if (baseStrength < 74) weaknesses.push("Limited fit-adjusted firepower");

	if (chemistryScore >= 75) strengths.push("Proven teammate chemistry");
	else if (chemistryScore === TEAM_PROFILE_BASELINES.chemistry)
		weaknesses.push("No shared org-year history");

	if (communicationScore >= 88) strengths.push("Clear communication bridge");
	else if (communicationScore < 75) weaknesses.push("Communication may need adaptation");

	if (structureDetail.naturalRoleCount === ROLES.length) strengths.push("Natural role coverage");
	if (structureDetail.offRoleCount >= 2) weaknesses.push("Multiple off-role assignments");
	if (structureDetail.iglFit === "missing") weaknesses.push("No proven caller in the IGL slot");
	if (structureDetail.primaryAwpCount > 1) weaknesses.push("Overlapping primary AWP roles");

	if (coachingDetail.score >= 70) strengths.push("High-impact tactical coaching");
	else if (coachingDetail.score <= 35) weaknesses.push("Limited coaching modifiers");

	return { strengths, weaknesses };
}

export function buildTeamProfile({
	draft,
	playerSeasons,
	ratedPlayers,
	coach,
}: TeamProfileInputs): TeamProfile {
	if (coach.id !== draft.coachId) {
		throw new Error(`draft coach "${draft.coachId}" does not match supplied coach "${coach.id}"`);
	}
	const seasonsById = new Map(playerSeasons.map((season) => [season.id, season]));
	const ratingsById = new Map(ratedPlayers.map((rated) => [rated.id, rated]));
	const members = ROLES.map((role) => {
		const pick = draft.roster[role];
		const season = seasonsById.get(pick.playerSeasonId);
		const rated = ratingsById.get(pick.playerSeasonId);
		if (!season || !rated) {
			throw new Error(`missing season or rating for drafted player "${pick.playerSeasonId}"`);
		}
		return memberFor(role, season, rated, pick.fit);
	});
	const baseStrength = round1(average(members.map((member) => member.ovr * member.fit)));
	const sharedOrgYearPairs = pairValues(members, (left, right) =>
		left.orgId === right.orgId && left.year === right.year ? 1 : 0,
	).reduce((total, value) => total + value, 0);
	const chemistryBonus = Math.min(CHEMISTRY_BONUS_CAP, sharedOrgYearPairs * CHEMISTRY_PAIR_BONUS);
	const chemistryScore = TEAM_PROFILE_BASELINES.chemistry + chemistryBonus;
	const communicationDetail = communication(members, coach);
	const structureDetail = structure(members);
	const attributes = aggregateAttributes(members);
	const coachingDetail = coaching(attributes, coach);
	const overall = round1(
		clamp(
			baseStrength +
				(chemistryScore - TEAM_PROFILE_BASELINES.chemistry) * TEAM_PROFILE_WEIGHTS.chemistry +
				(communicationDetail.score - TEAM_PROFILE_BASELINES.communication) *
					TEAM_PROFILE_WEIGHTS.communication +
				(structureDetail.score - TEAM_PROFILE_BASELINES.structure) *
					TEAM_PROFILE_WEIGHTS.structure +
				coachingDetail.overallImpact,
			0,
			100,
		),
	);
	const profileLabels = labels(
		baseStrength,
		chemistryScore,
		communicationDetail.score,
		structureDetail,
		coachingDetail,
	);

	return {
		seed: draft.seed,
		overall,
		components: {
			baseStrength,
			chemistry: chemistryScore,
			communication: communicationDetail.score,
			structure: structureDetail.score,
			coaching: coachingDetail.score,
		},
		details: {
			chemistry: {
				score: chemistryScore,
				sharedOrgYearPairs,
				bonus: chemistryBonus,
			},
			communication: communicationDetail,
			structure: structureDetail,
			coaching: coachingDetail,
		},
		attributes,
		members,
		coach: { id: coach.id, nick: coach.nick },
		...profileLabels,
	};
}
