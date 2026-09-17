import {
	type OrgYear,
	type PlayerSeason,
	ROLES,
	type Role,
	type RoleOverridesFile,
} from "../schema";
import { type CareerTag, careerTagFor, mergeCareerTags } from "./careerTags";
import { isRoleLocked, TEAM_CARD_ROLES } from "./locked";

export type RoleInferenceInput = {
	seasons: PlayerSeason[];
	orgYears: OrgYear[];
	overrides: RoleOverridesFile;
	liquipediaTags?: Readonly<Record<string, CareerTag>>;
};

export type RoleInferenceResult = {
	seasons: PlayerSeason[];
	inferred: number;
	locked: number;
	unchanged: number;
};

type ScoredPlayer = {
	season: PlayerSeason;
	tag: CareerTag;
	scores: Record<Role, number>;
	hasSignal: boolean;
};

function permutations<T>(items: readonly T[]): T[][] {
	if (items.length <= 1) return [[...(items as T[])]];
	const result: T[][] = [];
	for (let index = 0; index < items.length; index++) {
		const head = items[index] as T;
		const rest = items.filter((_, restIndex) => restIndex !== index);
		for (const tail of permutations(rest)) result.push([head, ...tail]);
	}
	return result;
}

function combinations<T>(items: readonly T[], count: number): T[][] {
	if (count === 0) return [[]];
	if (count > items.length) return [];
	const result: T[][] = [];
	for (let index = 0; index <= items.length - count; index++) {
		const head = items[index] as T;
		for (const tail of combinations(items.slice(index + 1), count - 1)) {
			result.push([head, ...tail]);
		}
	}
	return result;
}

function roleSetsFor(freeCount: number, unused: readonly Role[]): Role[][] {
	if (freeCount === 0) return [[]];
	if (unused.length === freeCount) return [[...unused]];
	if (unused.length > freeCount) return combinations(unused, freeCount);
	const padded = [...unused];
	const fillers: Role[] = ["entry", "support", "lurker"];
	let fillIndex = 0;
	while (padded.length < freeCount) {
		padded.push(fillers[fillIndex % fillers.length] as Role);
		fillIndex += 1;
	}
	return [padded];
}

function scoreRole(
	tag: CareerTag,
	season: PlayerSeason,
	role: Role,
	slotPrior: Role | undefined,
): number {
	const stats = season.stats;
	let score = 0;
	switch (role) {
		case "awp":
			if (tag.awp) score += 100;
			if (tag.igl && !tag.awp) score -= 50;
			if (tag.rifle && !tag.awp) score -= 30;
			if (tag.awp && tag.igl) score -= 15;
			if (slotPrior === "awp") score += 4;
			if (stats?.rating !== undefined) score += (stats.rating - 1) * (tag.awp ? 40 : 10);
			if (stats?.impact !== undefined) score += (stats.impact - 1) * (tag.awp ? 25 : 8);
			break;
		case "igl":
			if (tag.igl) score += 100;
			if (tag.awp && !tag.igl) score -= 50;
			if (tag.awp && tag.igl) score += 20;
			if (slotPrior === "igl") score += 4;
			if (stats?.rating !== undefined && stats.rating < 1.0) score += 6;
			if (tag.rifle && !tag.igl) score -= 8;
			break;
		case "entry":
			if (tag.awp) score -= 20;
			if (tag.igl && !tag.awp) score -= 10;
			if (stats?.openingKpr !== undefined) {
				if (stats.openingKpr >= 0.14) score += 40;
				else if (stats.openingKpr >= 0.11) score += 22;
				else if (stats.openingKpr <= 0.08) score -= 8;
			}
			if (stats?.impact !== undefined && stats.impact >= 1.15) score += 16;
			if (stats?.adr !== undefined && stats.adr >= 80) score += 10;
			if (slotPrior === "entry") score += 6;
			break;
		case "support":
			if (tag.awp) score -= 25;
			if (tag.igl) score += 4;
			if (stats?.kast !== undefined && stats.kast >= 73) score += 12;
			if (stats?.impact !== undefined && stats.impact <= 1.0) score += 10;
			if (stats?.adr !== undefined && stats.adr <= 70) score += 8;
			if (slotPrior === "support") score += 6;
			break;
		case "lurker":
			if (tag.awp) score -= 15;
			if (stats?.openingKpr !== undefined && stats.openingKpr <= 0.09) score += 18;
			if (stats?.openingKpr !== undefined && stats.openingKpr >= 0.14) score -= 10;
			if (slotPrior === "lurker") score += 6;
			if (stats?.impact !== undefined && stats.impact >= 1.1 && stats.openingKpr === undefined) {
				score += 4;
			}
			break;
	}
	return score;
}

function hasInferenceSignal(tag: CareerTag, season: PlayerSeason): boolean {
	return Boolean(
		tag.awp ||
			tag.igl ||
			tag.rifle ||
			season.stats?.openingKpr !== undefined ||
			season.stats?.impact !== undefined ||
			season.stats?.adr !== undefined,
	);
}

function secondaries(primary: Role, tag: CareerTag, season: PlayerSeason): Role[] {
	switch (primary) {
		case "awp":
			return tag.igl ? ["awp", "igl"] : ["awp", "entry"];
		case "igl":
			if (tag.awp) return ["igl", "awp"];
			if (season.stats?.openingKpr !== undefined && season.stats.openingKpr < 0.09) {
				return ["igl", "lurker"];
			}
			return ["igl", "support"];
		case "entry":
			return tag.awp ? ["entry", "awp"] : ["entry", "lurker"];
		case "support":
			return tag.igl ? ["support", "igl"] : ["support", "lurker"];
		case "lurker":
			return ["lurker", "entry"];
	}
}

function withAssignedRole(season: PlayerSeason, primary: Role, tag: CareerTag): PlayerSeason {
	return {
		...season,
		primaryRole: primary,
		roles: secondaries(primary, tag, season),
		roleProvenance: { kind: "inferred", source: "roster-assignment" },
	};
}

function scoredPlayer(
	season: PlayerSeason,
	slotPrior: Role | undefined,
	liquipediaTags: Readonly<Record<string, CareerTag>>,
): ScoredPlayer {
	const tag = mergeCareerTags(careerTagFor(season.playerId), liquipediaTags[season.playerId] ?? {});
	const scores = Object.fromEntries(
		ROLES.map((role) => [role, scoreRole(tag, season, role, slotPrior)]),
	) as Record<Role, number>;
	return { season, tag, scores, hasSignal: hasInferenceSignal(tag, season) };
}

function bestFreeAssignment(
	free: ScoredPlayer[],
	unused: readonly Role[],
	locked: Readonly<Record<string, Role>>,
): Record<string, Role> {
	let bestScore = Number.NEGATIVE_INFINITY;
	let bestSignature = "";
	let best: Record<string, Role> = { ...locked };
	for (const roleSet of roleSetsFor(free.length, unused)) {
		for (const perm of permutations(roleSet)) {
			let score = 0;
			const assignment: Record<string, Role> = { ...locked };
			for (let index = 0; index < free.length; index++) {
				const player = free[index];
				const role = perm[index];
				if (!player || !role) continue;
				assignment[player.season.id] = role;
				score += player.scores[role];
			}
			const signature = ROLES.map((role) => {
				const id = Object.entries(assignment).find(([, assigned]) => assigned === role)?.[0] ?? "";
				return `${role}:${id}`;
			}).join("|");
			if (score > bestScore || (score === bestScore && signature < bestSignature)) {
				bestScore = score;
				bestSignature = signature;
				best = assignment;
			}
		}
	}
	return best;
}

function assignRoster(
	players: ScoredPlayer[],
	overrides: RoleOverridesFile,
	priorPrimaries: Readonly<Record<string, Role>> = {},
): Map<string, PlayerSeason> {
	const lockedRoles: Record<string, Role> = { ...priorPrimaries };
	for (const player of players) {
		const override = overrides[player.season.id];
		if (override) lockedRoles[player.season.id] = override.primaryRole;
		else if (isRoleLocked(player.season, undefined)) {
			lockedRoles[player.season.id] = player.season.primaryRole;
		}
	}
	const free = players.filter((player) => lockedRoles[player.season.id] === undefined);
	const used = new Set(Object.values(lockedRoles));
	const unused = ROLES.filter((role) => !used.has(role));
	const assigned = bestFreeAssignment(free, unused, lockedRoles);
	const next = new Map<string, PlayerSeason>();
	for (const player of players) {
		const override = overrides[player.season.id];
		if (override) {
			next.set(player.season.id, {
				...player.season,
				roles: override.roles,
				primaryRole: override.primaryRole,
				roleProvenance: { kind: "curated", source: "role-overrides.json" },
			});
			continue;
		}
		if (player.season.roleProvenance.kind === "curated") {
			next.set(player.season.id, player.season);
			continue;
		}
		const primary = assigned[player.season.id];
		if (!primary) {
			next.set(player.season.id, player.season);
			continue;
		}
		next.set(player.season.id, withAssignedRole(player.season, primary, player.tag));
	}
	return next;
}

function inferSolo(player: ScoredPlayer, overrides: RoleOverridesFile): PlayerSeason {
	const override = overrides[player.season.id];
	if (override) {
		return {
			...player.season,
			roles: override.roles,
			primaryRole: override.primaryRole,
			roleProvenance: { kind: "curated", source: "role-overrides.json" },
		};
	}
	if (player.season.roleProvenance.kind === "curated") return player.season;
	if (!player.hasSignal) {
		return {
			...player.season,
			roleProvenance: player.season.roleProvenance.kind
				? player.season.roleProvenance
				: { kind: "teamcard-slot", source: "TeamCard listing order" },
		};
	}
	if (player.tag.awp && player.tag.igl) return withAssignedRole(player.season, "igl", player.tag);
	if (player.tag.awp) return withAssignedRole(player.season, "awp", player.tag);
	if (player.tag.igl) return withAssignedRole(player.season, "igl", player.tag);
	let best: Role = player.season.primaryRole;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const role of ROLES) {
		const score = player.scores[role];
		if (score > bestScore) {
			bestScore = score;
			best = role;
		}
	}
	if (bestScore <= 0) {
		return {
			...player.season,
			roleProvenance: { kind: "teamcard-slot", source: "TeamCard listing order" },
		};
	}
	return withAssignedRole(player.season, best, player.tag);
}

export function inferPlayerRoles(input: RoleInferenceInput): RoleInferenceResult {
	const liquipediaTags = input.liquipediaTags ?? {};
	const byId = new Map(input.seasons.map((season) => [season.id, season]));
	const written = new Map<string, PlayerSeason>();

	for (const orgYear of input.orgYears) {
		const starters = orgYear.playerSeasonIds.flatMap((id, slot) => {
			const season = byId.get(id);
			if (!season) return [];
			return [scoredPlayer(season, TEAM_CARD_ROLES[slot], liquipediaTags)];
		});
		if (starters.length !== 5) continue;
		const rosterHasSignal = starters.some((player) => player.hasSignal);
		if (!rosterHasSignal) {
			for (const player of starters) {
				if (written.has(player.season.id)) continue;
				written.set(player.season.id, inferSolo(player, input.overrides));
			}
			continue;
		}
		const priorPrimaries: Record<string, Role> = {};
		for (const player of starters) {
			const existing = written.get(player.season.id);
			if (existing) priorPrimaries[player.season.id] = existing.primaryRole;
		}
		for (const [id, season] of assignRoster(starters, input.overrides, priorPrimaries)) {
			if (written.has(id)) continue;
			written.set(id, season);
		}
	}

	const seasons = input.seasons.map((season) => {
		const already = written.get(season.id);
		if (already) return already;
		return inferSolo(scoredPlayer(season, undefined, liquipediaTags), input.overrides);
	});

	let inferred = 0;
	let locked = 0;
	let unchanged = 0;
	for (const season of seasons) {
		if (season.roleProvenance.kind === "curated") locked += 1;
		else if (season.roleProvenance.kind === "inferred") inferred += 1;
		else unchanged += 1;
	}
	return { seasons, inferred, locked, unchanged };
}
