import { type Coach, type Dataset, ROLES, type Role } from "../../data";
import type { CompletedDraft } from "../draft";
import { roleFit } from "../draft";
import type { RatedPlayer } from "../ratings/rate";
import { hashStringToSeed } from "../rng";
import { buildTeamProfile } from "../team";
import type { HistoricalOpponent } from "./types";

type RoleAssignment = {
	score: number;
	signature: string;
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
		assigned: Partial<Record<Role, string>>,
		score: number,
	) {
		if (roleIndex === ROLES.length) {
			const playerIdsByRole = assigned as Record<Role, string>;
			const candidate = {
				score,
				signature: ROLES.map((role) => playerIdsByRole[role]).join(":"),
				playerIds: playerIdsByRole,
			};
			if (
				!best ||
				candidate.score > best.score ||
				(candidate.score === best.score && candidate.signature < best.signature)
			) {
				best = candidate;
			}
			return;
		}
		const role = ROLES[roleIndex] as Role;
		for (const playerId of available) {
			const player = playersById.get(playerId);
			if (!player) throw new Error(`missing historical player "${playerId}"`);
			assign(
				roleIndex + 1,
				available.filter((id) => id !== playerId),
				{ ...assigned, [role]: playerId },
				score + roleFit(player, role),
			);
		}
	}

	assign(0, playerIds, {}, 0);
	if (!best) throw new Error("historical opponent has no valid role assignment");
	return (best as RoleAssignment).playerIds;
}

function fallbackCoach(
	dataset: Dataset,
	orgId: string,
	year: number,
	playerNationalities: string[],
): Coach {
	const nationalityCounts = new Map<string, number>();
	for (const nationality of playerNationalities) {
		nationalityCounts.set(nationality, (nationalityCounts.get(nationality) ?? 0) + 1);
	}
	const coaches = [...dataset.coaches].sort((left, right) => {
		const leftOrg = left.orgId === orgId ? 1 : 0;
		const rightOrg = right.orgId === orgId ? 1 : 0;
		if (leftOrg !== rightOrg) return rightOrg - leftOrg;
		const leftLanguage = nationalityCounts.get(left.nationality) ?? 0;
		const rightLanguage = nationalityCounts.get(right.nationality) ?? 0;
		if (leftLanguage !== rightLanguage) return rightLanguage - leftLanguage;
		const yearDistance = Math.abs(left.year - year) - Math.abs(right.year - year);
		if (yearDistance !== 0) return yearDistance;
		return left.id.localeCompare(right.id);
	});
	const coach = coaches[0];
	if (!coach) throw new Error("historical opponents require at least one coach");
	return coach;
}

export function buildHistoricalOpponents(
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
): HistoricalOpponent[] {
	const playersById = new Map(dataset.playerSeasons.map((player) => [player.id, player]));
	const coachesById = new Map(dataset.coaches.map((coach) => [coach.id, coach]));
	const orgsById = new Map(dataset.orgs.map((org) => [org.id, org]));
	const majorsById = new Map(dataset.majors.map((major) => [major.id, major]));

	const opponents = dataset.orgYears.map((orgYear) => {
		const players = orgYear.playerSeasonIds.map((id) => {
			const player = playersById.get(id);
			if (!player) throw new Error(`missing historical player "${id}"`);
			return player;
		});
		const coach =
			(orgYear.coachId ? coachesById.get(orgYear.coachId) : undefined) ??
			fallbackCoach(
				dataset,
				orgYear.orgId,
				orgYear.year,
				players.map((player) => player.nationality),
			);
		const assigned = bestRoleAssignment(orgYear.playerSeasonIds, playersById);
		const seed = hashStringToSeed(`historical:${orgYear.id}:${coach.id}`);
		const draft: CompletedDraft = {
			seed,
			cards: [],
			coachId: coach.id,
			roster: Object.fromEntries(
				ROLES.map((role) => {
					const playerSeasonId = assigned[role];
					const player = playersById.get(playerSeasonId);
					if (!player) throw new Error(`missing historical player "${playerSeasonId}"`);
					return [
						role,
						{
							orgYearId: orgYear.id,
							playerSeasonId,
							role,
							fit: roleFit(player, role),
						},
					];
				}),
			) as CompletedDraft["roster"],
		};
		const org = orgsById.get(orgYear.orgId);
		return {
			id: orgYear.id,
			label: `${org?.name ?? orgYear.orgId} · ${
				orgYear.majorId
					? (majorsById.get(orgYear.majorId)?.shortName ?? orgYear.year)
					: `Legacy ${orgYear.year}`
			}`,
			org: {
				id: orgYear.orgId,
				name: org?.name ?? orgYear.orgId,
				...(org?.logo ? { logo: org.logo } : {}),
			},
			profile: buildTeamProfile({
				draft,
				playerSeasons: dataset.playerSeasons,
				ratedPlayers,
				coach,
			}),
		};
	});
	return opponents.sort(
		(left, right) =>
			left.profile.overall - right.profile.overall || left.id.localeCompare(right.id),
	);
}
