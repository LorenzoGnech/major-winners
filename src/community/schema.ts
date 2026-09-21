import { z } from "zod";
import { TEAM_NAME_MAX } from "../components/teamName";
import { ROLES } from "../data/schema";
import { BONUS_IDS } from "../engine/bonuses";

export const DEFAULT_AUTHOR_NAME = "Anonymous";
export const AUTHOR_NAME_MAX = TEAM_NAME_MAX;
export const COMMUNITY_FETCH_RUNS = 25;
export const COMMUNITY_FETCH_TEAMS = 100;
export const COMMUNITY_BOARD_SIZE = 10;
export const PROFILE_BEST_TEAMS = 3;

export const communityModeSchema = z.enum(["daily", "free", "community"]);
export type CommunityGameMode = z.infer<typeof communityModeSchema>;

export const rosterSnapshotSchema = z.object({
	awp: z.string().min(1),
	igl: z.string().min(1),
	entry: z.string().min(1),
	support: z.string().min(1),
	lurker: z.string().min(1),
});
export type RosterSnapshot = z.infer<typeof rosterSnapshotSchema>;

export const traitsSnapshotSchema = z.record(z.string().min(1), z.array(z.enum(BONUS_IDS)));
export type TraitsSnapshot = z.infer<typeof traitsSnapshotSchema>;

export const savedTeamSnapshotSchema = z.object({
	id: z.string().min(1),
	userId: z.string().min(1).nullable(),
	authorName: z.string().min(1).max(AUTHOR_NAME_MAX),
	teamName: z.string().min(1).max(TEAM_NAME_MAX),
	seed: z.coerce.number().int(),
	roster: rosterSnapshotSchema,
	coachId: z.string().min(1),
	traits: traitsSnapshotSchema.default({}),
	createdAt: z.string().min(1),
});
export type SavedTeamSnapshot = z.infer<typeof savedTeamSnapshotSchema>;

export const publishedRunSnapshotSchema = z.object({
	id: z.string().min(1),
	team: savedTeamSnapshotSchema,
	mode: communityModeSchema,
	wins: z.number().int().min(0).max(9),
	losses: z.number().int().min(0).max(5),
	mapsWon: z.number().int().min(0),
	mapsLost: z.number().int().min(0),
	roundsWon: z.number().int().min(0),
	roundsLost: z.number().int().min(0),
	finish: z.string().min(1),
	perfect: z.boolean(),
	fingerprint: z.string().min(1),
	createdAt: z.string().min(1),
});
export type PublishedRunSnapshot = z.infer<typeof publishedRunSnapshotSchema>;

export function parseAuthorName(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_AUTHOR_NAME;
	const name = value.trim().replace(/\s+/g, " ");
	if (name.length < 1 || name.length > AUTHOR_NAME_MAX) return DEFAULT_AUTHOR_NAME;
	return name;
}

export function authorNameFromProfile(displayName: string | null | undefined): string {
	return parseAuthorName(displayName ?? "");
}

export function rosterSignature(roster: RosterSnapshot): string {
	return ROLES.map((role) => roster[role]).join(",");
}

export function runFingerprint(input: {
	roster: RosterSnapshot;
	coachId: string;
	mode: CommunityGameMode;
	wins: number;
	losses: number;
	mapsWon: number;
	mapsLost: number;
	roundsWon: number;
	roundsLost: number;
}): string {
	return [
		rosterSignature(input.roster),
		input.coachId,
		input.mode,
		`${input.wins}-${input.losses}`,
		`${input.mapsWon}-${input.mapsLost}`,
		`${input.roundsWon}-${input.roundsLost}`,
	].join("|");
}

export function teamFingerprint(input: {
	roster: RosterSnapshot;
	coachId: string;
	tag: string;
}): string {
	return [rosterSignature(input.roster), input.coachId, input.tag].join("|");
}

export const duelResultSnapshotSchema = z.object({
	roomCode: z.string().min(1),
	won: z.boolean(),
	mapsWon: z.number().int().min(0).max(3),
	mapsLost: z.number().int().min(0).max(3),
	roundsWon: z.number().int().min(0),
	roundsLost: z.number().int().min(0),
	createdAt: z.string().min(1),
});
export type DuelResultSnapshot = z.infer<typeof duelResultSnapshotSchema>;

export const rankedProfileSchema = z.object({
	userId: z.string().min(1),
	displayName: z.string().min(1).max(16),
	elo: z.number().int().min(100),
	wins: z.number().int().min(0),
	losses: z.number().int().min(0),
	streak: z.number().int().min(0).default(0),
});
export type RankedProfile = z.infer<typeof rankedProfileSchema>;

export const rankedEloSideSchema = z.object({
	displayName: z.string().min(1),
	elo: z.number().int(),
	delta: z.number().int().nullable().optional(),
});
export type RankedEloSide = z.infer<typeof rankedEloSideSchema>;

export const rankedResultSchema = z.object({
	pending: z.boolean(),
	eloApplied: z.boolean(),
	mismatch: z.boolean().optional().default(false),
	you: rankedEloSideSchema.nullable(),
	opponent: rankedEloSideSchema.nullable(),
});
export type RankedResult = z.infer<typeof rankedResultSchema>;

export type SiteStats = {
	gamesPlayed: number;
	savedTeams: number;
	wins: number;
};

function asCount(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return Math.trunc(value);
	}
	if (typeof value === "string" && /^\d+$/.test(value)) {
		const parsed = Number(value);
		return Number.isSafeInteger(parsed) ? parsed : null;
	}
	return null;
}

export function parseSiteStats(value: unknown): SiteStats | null {
	const row = Array.isArray(value) ? value[0] : value;
	if (!row || typeof row !== "object") return null;
	const record = row as Record<string, unknown>;
	const gamesPlayed = asCount(record.gamesPlayed ?? record.games_played);
	const savedTeams = asCount(record.savedTeams ?? record.saved_teams);
	const wins = asCount(record.wins);
	if (gamesPlayed === null || savedTeams === null || wins === null) return null;
	return { gamesPlayed, savedTeams, wins };
}
