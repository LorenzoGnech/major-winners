import { describe, expect, it } from "vitest";
import { DUEL_SERIES_FORMAT, MAP_POOL, pickVetoDecider } from "../engine";
import type { DuelRoom } from "./duel";
import {
	applyRoomVeto,
	mapContextsFromRows,
	normalizeDuelCode,
	parseDuelCode,
	parsePersistedDuel,
	sideIndex,
	vetoStateFromRoom,
} from "./duel";

function room(overrides: Partial<DuelRoom> = {}): DuelRoom {
	return {
		code: "K7M2QX",
		status: "veto",
		seriesSeed: 11,
		side: "host",
		kind: "casual",
		hostRoster: null,
		guestRoster: null,
		vetoLog: [],
		mapQueue: null,
		...overrides,
	};
}

describe("duel helpers", () => {
	it("normalizes room codes", () => {
		expect(parseDuelCode("k7m2qx")).toBe("K7M2QX");
		expect(normalizeDuelCode("ab i o")).toBe("AB");
		expect(parseDuelCode("short")).toBeNull();
	});

	it("applies veto turns from the room log", () => {
		const first = applyRoomVeto(room(), "host", "mirage");
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.value.actions[0]).toMatchObject({ side: 0, kind: "ban", mapId: "mirage" });
		const guest = applyRoomVeto(room({ vetoLog: first.value.actions }), "guest", "dust2");
		expect(guest.ok).toBe(true);
		expect(sideIndex("guest")).toBe(1);
	});

	it("hydrates a map queue with pick sides", () => {
		const maps = mapContextsFromRows([
			{ mapId: "nuke", pickedBy: 0 },
			{ mapId: "mirage", pickedBy: 1 },
			{ mapId: "inferno" },
		]);
		expect(maps[0]).toMatchObject({ mapId: "nuke", pickedBy: 0, homePick: true });
		expect(maps[1]).toMatchObject({ mapId: "mirage", pickedBy: 1, homePick: false });
		expect(maps[2]?.pickedBy).toBeUndefined();
		expect(MAP_POOL.some((map) => map.id === maps[2]?.mapId)).toBe(true);
	});

	it("rebuilds veto state from a room", () => {
		const state = vetoStateFromRoom(
			room({
				vetoLog: [{ side: 0, kind: "ban", mapId: "mirage" }],
			}),
		);
		expect(state.next).toEqual({ side: 1, kind: "ban" });
		expect(state.remaining).not.toContain("mirage");
		const afterGuestBan = vetoStateFromRoom(
			room({
				vetoLog: [
					{ side: 0, kind: "ban", mapId: "mirage" },
					{ side: 1, kind: "ban", mapId: "dust2" },
				],
			}),
		);
		expect(afterGuestBan.next).toEqual({ side: 0, kind: "pick" });
		const finished = vetoStateFromRoom(
			room({
				seriesSeed: 11,
				vetoLog: [
					{ side: 0, kind: "ban", mapId: "mirage" },
					{ side: 1, kind: "ban", mapId: "dust2" },
					{ side: 0, kind: "pick", mapId: "inferno" },
					{ side: 1, kind: "pick", mapId: "nuke" },
				],
			}),
		);
		expect(finished.complete).toBe(true);
		expect(finished.mapQueue[2]?.mapId).toBe(
			pickVetoDecider(["ancient", "anubis", "overpass", "cache", "cobble"], 11),
		);
	});

	it("rejects a persisted duel without a secret", () => {
		expect(
			parsePersistedDuel(JSON.stringify({ version: 1, code: "K7M2QX", side: "host" })),
		).toBeNull();
	});

	it("plays private and ranked series as BO3", () => {
		expect(DUEL_SERIES_FORMAT).toBe("BO3");
	});

	it("keeps a ranked kind on restore", () => {
		const parsed = parsePersistedDuel(
			JSON.stringify({
				version: 1,
				code: "K7M2QX",
				side: "host",
				secret: "abcd1234secret",
				kind: "ranked",
			}),
		);
		expect(parsed?.kind).toBe("ranked");
	});
});
