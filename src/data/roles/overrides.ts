import type { PlayerSeason, RoleOverride, RoleOverridesFile } from "../schema";
import { roleOverridesFileSchema } from "../schema";

export function parseRoleOverrides(input: unknown): RoleOverridesFile {
	return roleOverridesFileSchema.parse(input);
}

export function applyRoleOverrides(
	seasons: PlayerSeason[],
	overrides: RoleOverridesFile,
): { seasons: PlayerSeason[]; applied: number } {
	let applied = 0;
	const next = seasons.map((season) => {
		const override = overrides[season.id];
		if (!override) return season;
		applied += 1;
		return {
			...season,
			roles: override.roles,
			primaryRole: override.primaryRole,
			roleProvenance: {
				kind: "curated" as const,
				source: "role-overrides.json",
			},
		};
	});
	return { seasons: next, applied };
}

export function overrideFor(id: string, overrides: RoleOverridesFile): RoleOverride | undefined {
	return overrides[id];
}
