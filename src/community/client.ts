import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { ROLES } from "../data/schema";
import {
	COMMUNITY_BOARD_SIZE,
	COMMUNITY_FETCH_RUNS,
	COMMUNITY_FETCH_TEAMS,
	type DuelResultSnapshot,
	duelResultSnapshotSchema,
	type PublishedRunSnapshot,
	publishedRunSnapshotSchema,
	type RankedProfile,
	rankedProfileSchema,
	runFingerprint,
	type SavedTeamSnapshot,
	savedTeamSnapshotSchema,
} from "./schema";
import type { PublishRunInput, PublishTeamInput } from "./snapshot";
import { snapshotDraftFields } from "./snapshot";

type SavedTeamRow = {
	id: string;
	user_id: string | null;
	author_name: string;
	team_name: string;
	seed: number | string;
	roster: unknown;
	coach_id: string;
	traits: unknown;
	created_at: string;
};

type PublishedRunRow = {
	id: string;
	mode: string;
	wins: number;
	losses: number;
	maps_won: number;
	maps_lost: number;
	rounds_won: number;
	rounds_lost: number;
	finish: string;
	perfect: boolean;
	fingerprint: string;
	created_at: string;
	saved_teams: SavedTeamRow | SavedTeamRow[] | null;
};

function supabaseUrl(): string | undefined {
	return import.meta.env.PUBLIC_SUPABASE_URL;
}

function supabaseAnonKey(): string | undefined {
	return import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
}

export function isCommunityEnabled(): boolean {
	return Boolean(supabaseUrl() && supabaseAnonKey());
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
	if (!isCommunityEnabled()) return null;
	if (!client) {
		const url = supabaseUrl();
		const key = supabaseAnonKey();
		if (!url || !key) return null;
		client = createClient(url, key, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
		});
	}
	return client;
}

function parseTeamRow(row: SavedTeamRow): SavedTeamSnapshot | null {
	const parsed = savedTeamSnapshotSchema.safeParse({
		id: row.id,
		userId: row.user_id,
		authorName: row.author_name,
		teamName: row.team_name,
		seed: row.seed,
		roster: row.roster,
		coachId: row.coach_id,
		traits: row.traits ?? {},
		createdAt: row.created_at,
	});
	return parsed.success ? parsed.data : null;
}

function nestedTeam(value: PublishedRunRow["saved_teams"]): SavedTeamRow | null {
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

function parseRunRow(row: PublishedRunRow): PublishedRunSnapshot | null {
	const team = nestedTeam(row.saved_teams);
	if (!team) return null;
	const parsedTeam = parseTeamRow(team);
	if (!parsedTeam) return null;
	const parsed = publishedRunSnapshotSchema.safeParse({
		id: row.id,
		team: parsedTeam,
		mode: row.mode,
		wins: row.wins,
		losses: row.losses,
		mapsWon: row.maps_won,
		mapsLost: row.maps_lost,
		roundsWon: row.rounds_won,
		roundsLost: row.rounds_lost,
		finish: row.finish,
		perfect: row.perfect,
		fingerprint: row.fingerprint,
		createdAt: row.created_at,
	});
	return parsed.success ? parsed.data : null;
}

export async function fetchBestRuns(): Promise<PublishedRunSnapshot[]> {
	const supabase = getSupabase();
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("published_runs")
		.select(
			"id, mode, wins, losses, maps_won, maps_lost, rounds_won, rounds_lost, finish, perfect, fingerprint, created_at, saved_teams (id, user_id, author_name, team_name, seed, roster, coach_id, traits, created_at)",
		)
		.order("wins", { ascending: false })
		.order("losses", { ascending: true })
		.order("maps_lost", { ascending: true })
		.order("rounds_lost", { ascending: true })
		.order("maps_won", { ascending: false })
		.order("rounds_won", { ascending: false })
		.order("created_at", { ascending: true })
		.limit(COMMUNITY_FETCH_RUNS);
	if (error || !data) return [];
	return (data as PublishedRunRow[]).flatMap((row) => {
		const parsed = parseRunRow(row);
		return parsed ? [parsed] : [];
	});
}

export async function fetchSavedTeams(): Promise<SavedTeamSnapshot[]> {
	const supabase = getSupabase();
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("saved_teams")
		.select("id, user_id, author_name, team_name, seed, roster, coach_id, traits, created_at")
		.order("created_at", { ascending: false })
		.limit(COMMUNITY_FETCH_TEAMS);
	if (error || !data) return [];
	return (data as SavedTeamRow[]).flatMap((row) => {
		const parsed = parseTeamRow(row);
		return parsed ? [parsed] : [];
	});
}

export type PublishResult =
	| { ok: true; fingerprint: string; duplicate: boolean }
	| { ok: false; error: string };

export async function publishSavedTeam(
	input: PublishTeamInput & { fingerprint: string },
): Promise<PublishResult> {
	const supabase = getSupabase();
	if (!supabase) return { ok: false, error: "Community features are not configured." };
	const fields = snapshotDraftFields(input.draft);
	const { error } = await supabase.from("saved_teams").insert({
		user_id: input.userId,
		author_name: input.authorName,
		team_name: input.teamName,
		seed: fields.seed,
		roster: fields.roster,
		coach_id: fields.coachId,
		traits: fields.traits,
	});
	if (error) return { ok: false, error: error.message };
	return { ok: true, fingerprint: input.fingerprint, duplicate: false };
}

export async function publishFinishedRun(input: PublishRunInput): Promise<PublishResult> {
	const supabase = getSupabase();
	if (!supabase) return { ok: false, error: "Community features are not configured." };
	const fields = snapshotDraftFields(input.draft);
	const fingerprint = runFingerprint({
		roster: fields.roster,
		coachId: fields.coachId,
		mode: input.mode,
		wins: input.summary.wins,
		losses: input.summary.losses,
		mapsWon: input.summary.mapsWon,
		mapsLost: input.summary.mapsLost,
		roundsWon: input.summary.roundsWon,
		roundsLost: input.summary.roundsLost,
	});
	const { data: team, error: teamError } = await supabase
		.from("saved_teams")
		.insert({
			user_id: input.userId,
			author_name: input.authorName,
			team_name: input.teamName,
			seed: fields.seed,
			roster: fields.roster,
			coach_id: fields.coachId,
			traits: fields.traits,
		})
		.select("id")
		.single();
	if (teamError || !team) {
		return { ok: false, error: teamError?.message ?? "Could not save this team." };
	}
	const { error: runError } = await supabase.from("published_runs").insert({
		team_id: team.id,
		mode: input.mode,
		wins: input.summary.wins,
		losses: input.summary.losses,
		maps_won: input.summary.mapsWon,
		maps_lost: input.summary.mapsLost,
		rounds_won: input.summary.roundsWon,
		rounds_lost: input.summary.roundsLost,
		finish: input.summary.finish,
		perfect: input.summary.perfect,
		fingerprint,
	});
	if (runError) {
		if (runError.code === "23505") return { ok: true, fingerprint, duplicate: true };
		return { ok: false, error: runError.message };
	}
	return { ok: true, fingerprint, duplicate: false };
}

type DuelResultRow = {
	room_code: string;
	won: boolean;
	maps_won: number;
	maps_lost: number;
	rounds_won: number;
	rounds_lost: number;
	created_at: string;
};

function parseDuelResultRow(row: DuelResultRow): DuelResultSnapshot | null {
	const parsed = duelResultSnapshotSchema.safeParse({
		roomCode: row.room_code,
		won: row.won,
		mapsWon: row.maps_won,
		mapsLost: row.maps_lost,
		roundsWon: row.rounds_won,
		roundsLost: row.rounds_lost,
		createdAt: row.created_at,
	});
	return parsed.success ? parsed.data : null;
}

export async function recordDuelResult(input: {
	userId: string;
	roomCode: string;
	won: boolean;
	mapsWon: number;
	mapsLost: number;
	roundsWon: number;
	roundsLost: number;
}): Promise<string | null> {
	const supabase = getSupabase();
	if (!supabase) return "Community features are not configured.";
	const { error } = await supabase.from("duel_results").insert({
		user_id: input.userId,
		room_code: input.roomCode,
		won: input.won,
		maps_won: input.mapsWon,
		maps_lost: input.mapsLost,
		rounds_won: input.roundsWon,
		rounds_lost: input.roundsLost,
	});
	if (!error || error.code === "23505") return null;
	return error.message;
}

export async function fetchMyDuelResults(userId: string): Promise<DuelResultSnapshot[]> {
	const supabase = getSupabase();
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("duel_results")
		.select("room_code, won, maps_won, maps_lost, rounds_won, rounds_lost, created_at")
		.eq("user_id", userId)
		.order("created_at", { ascending: false });
	if (error || !data) return [];
	return (data as DuelResultRow[]).flatMap((row) => {
		const parsed = parseDuelResultRow(row);
		return parsed ? [parsed] : [];
	});
}

type ProfileRow = {
	user_id: string;
	display_name: string;
	elo: number;
	wins: number;
	losses: number;
};

function parseProfileRow(row: ProfileRow): RankedProfile | null {
	const parsed = rankedProfileSchema.safeParse({
		userId: row.user_id,
		displayName: row.display_name,
		elo: row.elo,
		wins: row.wins,
		losses: row.losses,
	});
	return parsed.success ? parsed.data : null;
}

export async function fetchMyProfile(userId: string): Promise<RankedProfile | null> {
	const supabase = getSupabase();
	if (!supabase) return null;
	const { data, error } = await supabase
		.from("profiles")
		.select("user_id, display_name, elo, wins, losses")
		.eq("user_id", userId)
		.maybeSingle();
	if (error || !data) return null;
	return parseProfileRow(data as ProfileRow);
}

export async function fetchEloLeaderboard(): Promise<RankedProfile[]> {
	const supabase = getSupabase();
	if (!supabase) return [];
	const { data, error } = await supabase
		.from("profiles")
		.select("user_id, display_name, elo, wins, losses")
		.order("elo", { ascending: false })
		.order("display_name", { ascending: true })
		.limit(COMMUNITY_BOARD_SIZE);
	if (error || !data) return [];
	return (data as ProfileRow[]).flatMap((row) => {
		const parsed = parseProfileRow(row);
		return parsed ? [parsed] : [];
	});
}

export async function signInWithMagicLink(
	email: string,
	redirectTo: string,
): Promise<string | null> {
	const supabase = getSupabase();
	if (!supabase) return "Community features are not configured.";
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: redirectTo },
	});
	return error?.message ?? null;
}

export async function signOut(): Promise<void> {
	await getSupabase()?.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
	const supabase = getSupabase();
	if (!supabase) return null;
	const { data } = await supabase.auth.getSession();
	return data.session;
}

export function onAuthChange(handler: (session: Session | null) => void): () => void {
	const supabase = getSupabase();
	if (!supabase) return () => {};
	const { data } = supabase.auth.onAuthStateChange((_event, session) => {
		handler(session);
	});
	return () => data.subscription.unsubscribe();
}

export function rosterNicks(
	snapshot: SavedTeamSnapshot,
	nicksBySeasonId: ReadonlyMap<string, string>,
): string[] {
	return ROLES.map((role) => nicksBySeasonId.get(snapshot.roster[role]) ?? snapshot.roster[role]);
}
