import { describe, expect, it } from "vitest";
import { MAP_POOL } from "./maps";
import { applyVetoAction, emptyVeto, mapQueueFromVeto, vetoFromActions } from "./veto";

describe("duel veto", () => {
	it("runs four bans, four picks, leftover decider", () => {
		const order = MAP_POOL.map((map) => map.id);
		let state = emptyVeto();
		for (const mapId of order.slice(0, 8)) {
			const next = applyVetoAction(state, { side: state.next?.side ?? 0, mapId });
			expect(next.ok).toBe(true);
			if (next.ok) state = next.value;
		}
		expect(state.complete).toBe(true);
		expect(state.mapQueue).toHaveLength(5);
		expect(state.mapQueue[0]).toMatchObject({ mapId: order[4], pickedBy: 0, homePick: true });
		expect(state.mapQueue[1]).toMatchObject({ mapId: order[5], pickedBy: 1, homePick: false });
		expect(state.mapQueue[2]).toMatchObject({ mapId: order[6], pickedBy: 0, homePick: true });
		expect(state.mapQueue[3]).toMatchObject({ mapId: order[7], pickedBy: 1, homePick: false });
		expect(state.mapQueue[4]).toMatchObject({ mapId: order[8], homePick: false });
		expect(state.mapQueue[4]?.pickedBy).toBeUndefined();
		expect(mapQueueFromVeto(state.actions)?.map((map) => map.mapId)).toEqual(
			state.mapQueue.map((map) => map.mapId),
		);
	});

	it("rejects the wrong side, a used map, and extra actions", () => {
		const first = applyVetoAction(emptyVeto(), { side: 1, mapId: "mirage" });
		expect(first.ok).toBe(false);
		if (!first.ok) expect(first.error).toBe("WRONG_TURN");

		const banned = applyVetoAction(emptyVeto(), { side: 0, mapId: "mirage" });
		expect(banned.ok).toBe(true);
		if (!banned.ok) return;
		const repeat = applyVetoAction(banned.value, { side: 1, mapId: "mirage" });
		expect(repeat.ok).toBe(false);
		if (!repeat.ok) expect(repeat.error).toBe("MAP_GONE");

		const unknown = applyVetoAction(emptyVeto(), { side: 0, mapId: "office" });
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) expect(unknown.error).toBe("UNKNOWN_MAP");

		const finished = vetoFromActions(
			MAP_POOL.slice(0, 8).map((map, index) => ({
				side: (index % 2 === 0 ? 0 : 1) as 0 | 1,
				kind: index < 4 ? "ban" : "pick",
				mapId: map.id,
			})),
		);
		const extra = applyVetoAction(finished, { side: 0, mapId: "cobble" });
		expect(extra.ok).toBe(false);
		if (!extra.ok) expect(extra.error).toBe("ALREADY_COMPLETE");
	});
});
