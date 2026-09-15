import type { Coach, PlayerSeason, Role } from "../../data/schema";
import type { CompletedDraft, RoleFit } from "../draft";
import type { Attributes } from "../ratings/attributes";
import type { RatedPlayer } from "../ratings/rate";

export type TeamMemberProfile = {
	id: string;
	nick: string;
	nationality: string;
	orgId: string;
	year: number;
	slot: Role;
	primaryRole: Role;
	roles: readonly Role[];
	fit: RoleFit;
	ovr: number;
	effectiveOvr: number;
	attributes: Attributes;
};

export type ChemistryDetail = {
	score: number;
	sharedOrgYearPairs: number;
	bonus: number;
};

export type CommunicationDetail = {
	score: number;
	playerPairCompatibility: number;
	coachCompatibility: number;
	heuristic: "conservative-language-family";
};

export type StructureDetail = {
	score: number;
	naturalRoleCount: number;
	secondaryRoleCount: number;
	offRoleCount: number;
	iglFit: "primary" | "secondary" | "missing";
	primaryAwpCount: number;
};

export type CoachingDetail = {
	score: number;
	overallImpact: number;
	comebackResilience: number;
	economyDiscipline: number;
	antiStrat: number;
};

export type TeamProfile = {
	seed: number;
	overall: number;
	components: {
		baseStrength: number;
		chemistry: number;
		communication: number;
		structure: number;
		coaching: number;
	};
	details: {
		chemistry: ChemistryDetail;
		communication: CommunicationDetail;
		structure: StructureDetail;
		coaching: CoachingDetail;
	};
	attributes: Attributes;
	members: readonly TeamMemberProfile[];
	coach: {
		id: string;
		nick: string;
	};
	strengths: readonly string[];
	weaknesses: readonly string[];
};

export type TeamProfileInputs = {
	draft: CompletedDraft;
	playerSeasons: readonly PlayerSeason[];
	ratedPlayers: readonly RatedPlayer[];
	coach: Coach;
};
