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
		hostRoster: row.hostRoster ?? row.host_roster ?? null,
		guestRoster: row.guestRoster ?? row.guest_roster ?? null,
		vetoLog: row.vetoLog ?? row.veto_log ?? [],
		mapQueue: row.mapQueue ?? row.map_queue ?? null,
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

export type { DuelMapQueueRow };
export { duelMapQueueRowSchema, duelRosterSchema, duelStatusSchema, duelVetoActionSchema };
