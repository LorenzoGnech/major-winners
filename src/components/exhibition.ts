import { type Dataset, ROLES, type Role } from "../data";
import {
	buildTeamProfile,
	type CompletedDraft,
	createRng,
	hashStringToSeed,
	type RatedPlayer,
	roleFit,
	simulateSeries,
	type TeamProfile,
} from "../engine";
import { DEFAULT_TEAM_NAME } from "./teamName";

export type ExhibitionMatch = {
	result: ReturnType<typeof simulateSeries>;
	teamLabels: readonly [string, string];
};

type RoleAssignment = {
	score: number;
	playerIds: Record<Role, string>;
};

function bestRoleAssignment(
	playerIds: readonly string[],
	playersById: Map<string, Dataset["playerSeasons"][number]>,
): Record<Role, string> {
	let best: RoleAssignment | null = null;

	function assign(
		roleIndex: number,
		available: readonly string[],
		playerIdsByRole: Partial<Record<Role, string>>,
		score: number,
	) {
		if (roleIndex === ROLES.length) {
			const candidate = {
				score,
				playerIds: playerIdsByRole as Record<Role, string>,
			};
			if (!best || candidate.score > best.score) best = candidate;
			return;
		}

		const role = ROLES[roleIndex] as Role;
		for (const playerId of available) {
			const player = playersById.get(playerId);
			if (!player) throw new Error(`missing historical player "${playerId}"`);
			assign(
				roleIndex + 1,
				available.filter((id) => id !== playerId),
				{ ...playerIdsByRole, [role]: playerId },
				score + roleFit(player, role),
			);
		}
	}

	assign(0, playerIds, {}, 0);
	const result = best as RoleAssignment | null;
	if (!result) throw new Error("historical opponent has no valid role assignment");
	return result.playerIds;
}

function sameRoster(left: ReadonlySet<string>, right: readonly string[]): boolean {
	return left.size === right.length && right.every((id) => left.has(id));
}

export function createExhibitionMatch({
	dataset,
	draft,
	draftedTeam,
	ratedPlayers,
}: {
	dataset: Dataset;
	draft: CompletedDraft;
	draftedTeam: TeamProfile;
	ratedPlayers: readonly RatedPlayer[];
}): ExhibitionMatch {
	const draftedIds = new Set(ROLES.map((role) => draft.roster[role].playerSeasonId));
	const eligible = dataset.orgYears.filter(
		(orgYear) => orgYear.coachId && dataset.coaches.some((coach) => coach.id === orgYear.coachId),
	);
	const distinct = eligible.filter((orgYear) => !sameRoster(draftedIds, orgYear.playerSeasonIds));
	const candidates = distinct.length > 0 ? distinct : eligible;
	if (candidates.length === 0) throw new Error("no coached historical opponent is available");

	const selectionSeed = hashStringToSeed(`${draft.seed}:exhibition-opponent`);
	const opponentOrgYear = candidates[createRng(selectionSeed).nextInt(candidates.length)];
	if (!opponentOrgYear?.coachId) throw new Error("selected historical opponent has no coach");

	const playersById = new Map(dataset.playerSeasons.map((player) => [player.id, player]));
	const playerIdsByRole = bestRoleAssignment(opponentOrgYear.playerSeasonIds, playersById);
	const opponentDraft: CompletedDraft = {
		seed: selectionSeed,
		cards: [],
		coachId: opponentOrgYear.coachId,
		roster: Object.fromEntries(
			ROLES.map((role) => {
				const playerSeasonId = playerIdsByRole[role];
				const player = playersById.get(playerSeasonId);
				if (!player) throw new Error(`missing historical player "${playerSeasonId}"`);
				return [
					role,
					{
						orgYearId: opponentOrgYear.id,
						playerSeasonId,
						role,
						fit: roleFit(player, role),
					},
				];
			}),
		) as CompletedDraft["roster"],
	};
	const coach = dataset.coaches.find((candidate) => candidate.id === opponentOrgYear.coachId);
	if (!coach) throw new Error(`missing historical coach "${opponentOrgYear.coachId}"`);
	const opponent = buildTeamProfile({
		draft: opponentDraft,
		playerSeasons: dataset.playerSeasons,
		ratedPlayers,
		coach,
	});
	const org = dataset.orgs.find((candidate) => candidate.id === opponentOrgYear.orgId);
	const opponentLabel = `${org?.name ?? opponentOrgYear.orgId} ${opponentOrgYear.year}`;

	return {
		result: simulateSeries({
			teams: [draftedTeam, opponent],
			seed: hashStringToSeed(`${draft.seed}:exhibition-series`),
			format: "BO1",
			playerMapId: "mirage",
		}),
		teamLabels: [DEFAULT_TEAM_NAME, opponentLabel],
	};
}
