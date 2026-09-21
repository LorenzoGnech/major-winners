import { getSupabase } from "./client";
import {
	type DuelClaim,
	type DuelMapQueueRow,
	type DuelRoom,
	type DuelRosterSnapshot,
	duelMapQueueRowSchema,
	duelRoomSchema,
	duelRosterSchema,
	duelSideSchema,
	duelStatusSchema,
	duelVetoActionSchema,
	parseDuelCode,
} from "./duel";
import { parseRankedResult, type RankedResult } from "./schema";

export type DuelClientResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): DuelClientResult<T> {
	return { ok: false, error };
}

function parseRoom(value: unknown): DuelRoom | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	const parsed = duelRoomSchema.safeParse({
		code: row.code,
		status: row.status ?? row.Status,
		seriesSeed: row.seriesSeed ?? row.series_seed,
		side: row.side,
		kind: row.kind ?? "casual",
		hostRoster: row.hostRoster ?? row.host_roster ?? null,
		guestRoster: row.guestRoster ?? row.guest_roster ?? null,
		vetoLog: row.vetoLog ?? row.veto_log ?? [],
		mapQueue: row.mapQueue ?? row.map_queue ?? null,
		hostName: row.hostName ?? row.host_name ?? null,
		guestName: row.guestName ?? row.guest_name ?? null,
	});
	return parsed.success ? parsed.data : null;
}

async function rpc(
	name: string,
	args: Record<string, unknown>,
): Promise<DuelClientResult<unknown>> {
	const supabase = getSupabase();
	if (!supabase) return fail("Community features are not configured.");
	const { data, error } = await supabase.rpc(name, args);
	if (error) return fail(error.message);
	return { ok: true, value: data };
}

function asRoom(data: unknown): DuelClientResult<DuelRoom> {
	const room = parseRoom(data);
	if (!room) return fail("Could not read that duel room.");
	return { ok: true, value: room };
}

function asClaim(data: unknown): DuelClientResult<DuelClaim & { room: DuelRoom }> {
	if (!data || typeof data !== "object") return fail("Could not open that duel.");
	const row = data as Record<string, unknown>;
	const secret = typeof row.secret === "string" ? row.secret : "";
	const side = duelSideSchema.safeParse(row.side);
	const room = parseRoom(row.room ?? row);
	if (!secret || !side.success || !room) return fail("Could not open that duel.");
	return { ok: true, value: { code: room.code, secret, side: side.data, room } };
}

export async function createDuel(): Promise<DuelClientResult<DuelClaim & { room: DuelRoom }>> {
	const result = await rpc("create_duel", {});
	if (!result.ok) return result;
	return asClaim(result.value);
}

export async function joinDuel(
	code: string,
): Promise<DuelClientResult<DuelClaim & { room: DuelRoom }>> {
	const normalized = parseDuelCode(code);
	if (!normalized) return fail("Enter a 6-character room code.");
	const result = await rpc("join_duel", { p_code: normalized });
	if (!result.ok) return result;
	return asClaim(result.value);
}

export async function fetchDuel(code: string, secret: string): Promise<DuelClientResult<DuelRoom>> {
	const result = await rpc("fetch_duel", { p_code: code, p_secret: secret });
	if (!result.ok) return result;
	return asRoom(result.value);
}

export async function submitDuelRoster(
	code: string,
	secret: string,
	roster: DuelRosterSnapshot,
): Promise<DuelClientResult<DuelRoom>> {
	const parsed = duelRosterSchema.safeParse(roster);
	if (!parsed.success) return fail("That roster is not valid.");
	const result = await rpc("submit_duel_roster", {
		p_code: code,
		p_secret: secret,
		p_roster: parsed.data,
	});
	if (!result.ok) return result;
	return asRoom(result.value);
}

export async function submitDuelVeto(
	code: string,
	secret: string,
	mapId: string,
): Promise<DuelClientResult<DuelRoom>> {
	const result = await rpc("submit_duel_veto", {
		p_code: code,
		p_secret: secret,
		p_map_id: mapId,
	});
	if (!result.ok) return result;
	return asRoom(result.value);
}

export type RankedQueueWaiting = {
	matched: false;
	elo: number;
	window: number;
	displayName: string;
};

function asRankedQueue(
	data: unknown,
): DuelClientResult<(DuelClaim & { room: DuelRoom }) | RankedQueueWaiting> {
	if (!data || typeof data !== "object") return fail("Could not queue for ranked.");
	const row = data as Record<string, unknown>;
	if (row.matched === true) return asClaim(row);
	const elo = typeof row.elo === "number" ? row.elo : Number(row.elo);
	const window = typeof row.window === "number" ? row.window : Number(row.window);
	const displayName = typeof row.displayName === "string" ? row.displayName : "";
	if (!Number.isFinite(elo) || !Number.isFinite(window) || !displayName) {
		return fail("Could not queue for ranked.");
	}
	return { ok: true, value: { matched: false, elo, window, displayName } };
}

export async function queueRankedMatch(
	displayName?: string,
): Promise<DuelClientResult<(DuelClaim & { room: DuelRoom }) | RankedQueueWaiting>> {
	const result = await rpc("queue_ranked_match", {
		p_display_name: displayName ?? null,
	});
	if (!result.ok) return result;
	return asRankedQueue(result.value);
}

export async function leaveRankedQueue(): Promise<DuelClientResult<true>> {
	const result = await rpc("leave_ranked_queue", {});
	if (!result.ok) return result;
	return { ok: true, value: true };
}

export async function submitRankedResult(input: {
	code: string;
	secret: string;
	mapsWon: number;
	mapsLost: number;
	roundsWon: number;
	roundsLost: number;
}): Promise<DuelClientResult<RankedResult>> {
	const result = await rpc("submit_ranked_result", {
		p_code: input.code,
		p_secret: input.secret,
		p_maps_won: input.mapsWon,
		p_maps_lost: input.mapsLost,
		p_rounds_won: input.roundsWon,
		p_rounds_lost: input.roundsLost,
	});
	if (!result.ok) return result;
	const parsed = parseRankedResult(result.value);
	if (!parsed) return fail("Could not record that ranked result.");
	return { ok: true, value: parsed };
}

export type { DuelMapQueueRow };
export { duelMapQueueRowSchema, duelRosterSchema, duelStatusSchema, duelVetoActionSchema };
