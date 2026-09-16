export const DEFAULT_TEAM_NAME = "Your legends";
export const TEAM_NAME_MAX = 32;

export function parseTeamName(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const name = value.trim().replace(/\s+/g, " ");
	if (name.length < 1 || name.length > TEAM_NAME_MAX) return null;
	return name;
}
