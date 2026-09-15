import type { Role } from "../../data/schema";

export const ROLE_FIT = {
	primary: 1,
	secondary: 0.9,
	offRole: 0.75,
} as const;

export type RoleFit = (typeof ROLE_FIT)[keyof typeof ROLE_FIT];

export type RoleFitPlayer = {
	primaryRole: Role;
	roles: readonly Role[];
};

export function roleFit(player: RoleFitPlayer, slot: Role): RoleFit {
	if (player.primaryRole === slot) {
		return ROLE_FIT.primary;
	}
	if (player.roles.includes(slot)) {
		return ROLE_FIT.secondary;
	}
	return ROLE_FIT.offRole;
}
