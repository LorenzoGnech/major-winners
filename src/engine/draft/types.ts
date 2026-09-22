import type { OrgTier, Role, RosterKind } from "../../data/schema";
import type { BonusId } from "../bonuses";
import type { RoleFit } from "./fit";

export type DraftablePlayer = {
	id: string;
	playerId: string;
	primaryRole: Role;
	roles: readonly Role[];
	revealedTraitIds?: readonly BonusId[];
};

export type RolledOrgYearCard = {
	orgYearId: string;
	majorId: string | null;
	kind: RosterKind;
	tier: OrgTier;
	players: readonly DraftablePlayer[];
};

export type PlayerPick = {
	orgYearId: string;
	playerSeasonId: string;
	role: Role;
	fit: RoleFit;
};

export type DraftPhase =
	| { type: "player"; round: number }
	| { type: "coach" }
	| { type: "complete" };

export type DraftState = {
	seed: number;
	phase: DraftPhase;
	cards: readonly RolledOrgYearCard[];
	coachIds: readonly string[];
	rerolls: {
		majorRemaining: number;
		teamRemaining: number;
	};
	roster: Partial<Record<Role, PlayerPick>>;
	coachId: string | null;
};

export type CompletedDraft = {
	seed: number;
	cards: readonly RolledOrgYearCard[];
	roster: Record<Role, PlayerPick>;
	coachId: string;
};

export type PickPlayerAction = {
	type: "pickPlayer";
	playerSeasonId: string;
	role: Role;
};

export type MovePlayerAction = {
	type: "movePlayer";
	playerSeasonId: string;
	role: Role;
};

export type PickCoachAction = {
	type: "pickCoach";
	coachId: string;
};

export type RerollMajorAction = {
	type: "rerollMajor";
};

export type RerollTeamAction = {
	type: "rerollTeam";
};

export type DraftAction =
	| PickPlayerAction
	| MovePlayerAction
	| PickCoachAction
	| RerollMajorAction
	| RerollTeamAction;
