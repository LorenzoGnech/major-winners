import type { PlayerSeason, Role, RoleOverride } from "../schema";

export const TEAM_CARD_ROLES: readonly Role[] = ["igl", "awp", "entry", "support", "lurker"];

export function isRoleLocked(
	season: PlayerSeason | undefined,
	override: RoleOverride | undefined,
): boolean {
	return override !== undefined || season?.roleProvenance.kind === "curated";
}

export function importRolesFor(
	slot: number,
	existing: PlayerSeason | undefined,
	override: RoleOverride | undefined,
): Pick<PlayerSeason, "roles" | "primaryRole" | "roleProvenance"> {
	if (override) {
		return {
			roles: override.roles,
			primaryRole: override.primaryRole,
			roleProvenance: { kind: "curated", source: "role-overrides.json" },
		};
	}
	if (existing?.roleProvenance.kind === "curated" || existing?.roleProvenance.kind === "inferred") {
		return {
			roles: existing.roles,
			primaryRole: existing.primaryRole,
			roleProvenance: existing.roleProvenance,
		};
	}
	const role = TEAM_CARD_ROLES[slot] ?? "support";
	return {
		roles: [role],
		primaryRole: role,
		roleProvenance: { kind: "teamcard-slot", source: "TeamCard listing order" },
	};
}
