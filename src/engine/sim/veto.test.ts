import { describe, expect, it } from "vitest";
import { MAP_POOL } from "./maps";
import {
	applyVetoAction,
	emptyVeto,
	mapQueueFromVeto,
	pickVetoDecider,
	vetoFromActions,
} from "./veto";

describe("duel veto", () => {
	it("runs ban-ban-pick-pick, then a seed-picked leftover decider", () => {
		const order = MAP_POOL.map((map) => map.id);
		const seed = 11;
		let state = emptyVeto(seed);
		expect(state.next).toEqual({ side: 0, kind: "ban" });
		for (const mapId of order.slice(0, 4)) {
			const next = applyVetoAction(state, { side: state.next?.side ?? 0, mapId });
			expect(next.ok).toBe(true);
			if (next.ok) state = next.value;
		}
		expect(state.actions.map((action) => action.kind)).toEqual(["ban", "ban", "pick", "pick"]);
		expect(state.complete).toBe(true);
		expect(state.mapQueue).toHaveLength(3);
		expect(state.mapQueue[0]).toMatchObject({ mapId: order[2], pickedBy: 0, homePick: true });
		expect(state.mapQueue[1]).toMatchObject({ mapId: order[3], pickedBy: 1, homePick: false });
		expect(state.mapQueue[2]).toMatchObject({
			mapId: pickVetoDecider(order.slice(4), seed),
			homePick: false,
		});
		expect(state.mapQueue[2]?.pickedBy).toBeUndefined();
		expect(mapQueueFromVeto(state.actions, seed)?.map((map) => map.mapId)).toEqual(
			state.mapQueue.map((map) => map.mapId),
		);
	});

	it("picks the leftover decider from the unsigned series seed", () => {
		expect(pickVetoDecider(["nuke", "ancient", "anubis"], 11)).toBe("anubis");
		expect(pickVetoDecider(["nuke", "ancient", "anubis"], 0)).toBe("nuke");
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
			MAP_POOL.slice(0, 4).map((map, index) => ({
				side: (index % 2 === 0 ? 0 : 1) as 0 | 1,
				kind: index < 2 ? "ban" : "pick",
				mapId: map.id,
			})),
		);
		const extra = applyVetoAction(finished, { side: 0, mapId: "cobble" });
		expect(extra.ok).toBe(false);
		if (!extra.ok) expect(extra.error).toBe("ALREADY_COMPLETE");
	});
});
