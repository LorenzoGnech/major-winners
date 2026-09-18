import { z } from "zod";
import { TEAM_NAME_MAX } from "../components/teamName";
import type { Dataset } from "../data/schema";
import type { CompletedDraft, DraftState } from "../engine/draft";
import type { RatedPlayer } from "../engine/ratings/rate";
import { startLiveSeries } from "../engine/sim/live";
import { getMap, mapContextFrom } from "../engine/sim/maps";
import type { LiveSeriesState, MapContext } from "../engine/sim/types";
import {
	applyVetoAction,
	emptyVeto,
	type VetoAction,
	type VetoState,
	vetoFromActions,
} from "../engine/sim/veto";
import { buildTeamProfile, type TeamProfile } from "../engine/team";
import { completedDraftFromSnapshot } from "./draft";
import { rosterSnapshotSchema, type SavedTeamSnapshot, traitsSnapshotSchema } from "./schema";

export const DUEL_CODE_LENGTH = 6;
export const DUEL_STORAGE_KEY = "major-winners:duel:v1";
export const DUEL_STORAGE_VERSION = 1;
export const DUEL_POLL_MS = 2000;

export const duelStatusSchema = z.enum(["open", "drafting", "veto", "playing"]);
export type DuelStatus = z.infer<typeof duelStatusSchema>;

export const duelSideSchema = z.enum(["host", "guest"]);
export type DuelSide = z.infer<typeof duelSideSchema>;

export const duelRosterSchema = z.object({
	seed: z.coerce.number().int(),
	roster: rosterSnapshotSchema,
	coachId: z.string().min(1),
	traits: traitsSnapshotSchema.default({}),
	teamName: z.string().min(1).max(TEAM_NAME_MAX),
});
export type DuelRosterSnapshot = z.infer<typeof duelRosterSchema>;

export const duelVetoActionSchema = z.object({
	side: z.union([z.literal(0), z.literal(1)]),
	kind: z.enum(["ban", "pick"]),
	mapId: z.string().min(1),
});

export const duelMapQueueRowSchema = z.object({
	mapId: z.string().min(1),
	pickedBy: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type DuelMapQueueRow = z.infer<typeof duelMapQueueRowSchema>;

export const duelRoomSchema = z.object({
	code: z.string().min(DUEL_CODE_LENGTH).max(DUEL_CODE_LENGTH),
	status: duelStatusSchema,
	seriesSeed: z.coerce.number().int(),
	side: duelSideSchema,
	hostRoster: duelRosterSchema.nullable(),
	guestRoster: duelRosterSchema.nullable(),
	vetoLog: z.array(duelVetoActionSchema),
	mapQueue: z.array(duelMapQueueRowSchema).nullable(),
});
export type DuelRoom = z.infer<typeof duelRoomSchema>;

export type DuelClaim = {
	code: string;
	secret: string;
	side: DuelSide;
};

export type PersistedDuel = {
	version: typeof DUEL_STORAGE_VERSION;
	code: string;
	secret: string;
	side: DuelSide;
	draft?: DraftState;
	teamName?: string;
	liveSeries?: LiveSeriesState;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeDuelCode(value: string): string {
	return value
		.trim()
		.toUpperCase()
		.replace(/[^A-HJ-NP-Z2-9]/g, "")
		.slice(0, DUEL_CODE_LENGTH);
}

export function parseDuelCode(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const code = normalizeDuelCode(value);
	return code.length === DUEL_CODE_LENGTH ? code : null;
}

export function sideIndex(side: DuelSide): 0 | 1 {
	return side === "host" ? 0 : 1;
}

export function otherSide(side: DuelSide): DuelSide {
	return side === "host" ? "guest" : "host";
}

export function rosterForSide(room: DuelRoom, side: DuelSide): DuelRosterSnapshot | null {
	return side === "host" ? room.hostRoster : room.guestRoster;
}

export function vetoStateFromRoom(room: DuelRoom): VetoState {
	const actions = room.vetoLog.filter((action): action is VetoAction =>
		[
			"mirage",
			"dust2",
			"inferno",
			"nuke",
			"ancient",
			"anubis",
			"overpass",
			"cache",
			"cobble",
		].includes(action.mapId),
	) as VetoAction[];
	return actions.length > 0 ? vetoFromActions(actions) : emptyVeto();
}

export function applyRoomVeto(room: DuelRoom, side: DuelSide, mapId: string) {
	return applyVetoAction(vetoStateFromRoom(room), { side: sideIndex(side), mapId });
}

export function parsePersistedDuel(raw: string): PersistedDuel | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!isObject(value) || value.version !== DUEL_STORAGE_VERSION) return null;
		const code = parseDuelCode(value.code);
		const side = duelSideSchema.safeParse(value.side);
		if (!code || !side.success || typeof value.secret !== "string" || value.secret.length < 8) {
			return null;
		}
		return {
			version: DUEL_STORAGE_VERSION,
			code,
			secret: value.secret,
			side: side.data,
			...(isObject(value.draft) ? { draft: value.draft as DraftState } : {}),
			...(typeof value.teamName === "string" ? { teamName: value.teamName } : {}),
			...(isObject(value.liveSeries) ? { liveSeries: value.liveSeries as LiveSeriesState } : {}),
		};
	} catch {
		return null;
	}
}

export function loadPersistedDuel(storage: Pick<Storage, "getItem">): PersistedDuel | null {
	try {
		return parsePersistedDuel(storage.getItem(DUEL_STORAGE_KEY) ?? "");
	} catch {
		return null;
	}
}

export function savePersistedDuel(storage: Pick<Storage, "setItem">, value: PersistedDuel): void {
	storage.setItem(DUEL_STORAGE_KEY, JSON.stringify(value));
}

export function clearPersistedDuel(storage: Pick<Storage, "removeItem">): void {
	storage.removeItem(DUEL_STORAGE_KEY);
}

export function savedTeamFromDuelRoster(roster: DuelRosterSnapshot, id: string): SavedTeamSnapshot {
	return {
		id,
		userId: null,
		authorName: roster.teamName,
		teamName: roster.teamName,
		seed: roster.seed,
		roster: roster.roster,
		coachId: roster.coachId,
		traits: roster.traits,
		createdAt: "1970-01-01T00:00:00.000Z",
	};
}

export function draftFromDuelRoster(
	roster: DuelRosterSnapshot,
	dataset: Dataset,
	id: string,
): CompletedDraft | null {
	return completedDraftFromSnapshot(savedTeamFromDuelRoster(roster, id), dataset);
}

export function profileFromDuelRoster(
	roster: DuelRosterSnapshot,
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
	id: string,
): TeamProfile | null {
	const draft = draftFromDuelRoster(roster, dataset, id);
	const coach = dataset.coaches.find((row) => row.id === roster.coachId);
	if (!draft || !coach) return null;
	return buildTeamProfile({
		draft,
		playerSeasons: dataset.playerSeasons,
		ratedPlayers,
		coach,
	});
}

export function liveSeriesFromDuelRoom(
	room: DuelRoom,
	dataset: Dataset,
	ratedPlayers: readonly RatedPlayer[],
): LiveSeriesState | null {
	if (room.status !== "playing" || !room.hostRoster || !room.guestRoster || !room.mapQueue) {
		return null;
	}
	const host = profileFromDuelRoster(room.hostRoster, dataset, ratedPlayers, `${room.code}-host`);
	const guest = profileFromDuelRoster(
		room.guestRoster,
		dataset,
		ratedPlayers,
		`${room.code}-guest`,
	);
	if (!host || !guest) return null;
	return startLiveSeries({
		teams: [host, guest],
		seed: room.seriesSeed,
		format: "BO5",
		mapQueue: mapContextsFromRows(room.mapQueue),
		bothSidesPlayer: true,
	});
}

export function mapContextsFromRows(rows: readonly DuelMapQueueRow[]): MapContext[] {
	const maps: MapContext[] = [];
	for (const row of rows) {
		const map = getMap(row.mapId);
		if (!map) continue;
		maps.push(mapContextFrom(map, row.pickedBy === 0, row.pickedBy));
	}
	return maps;
}
