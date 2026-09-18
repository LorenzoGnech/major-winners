import { getMap, MAP_POOL, mapContextFrom, type SimMapId } from "./maps";
import type { MapContext } from "./types";

export type VetoKind = "ban" | "pick";

export type VetoStep = {
	side: 0 | 1;
	kind: VetoKind;
};

export type VetoAction = VetoStep & {
	mapId: SimMapId;
};

export type VetoErrorCode = "WRONG_TURN" | "MAP_GONE" | "UNKNOWN_MAP" | "ALREADY_COMPLETE";

export const DUEL_VETO_STEPS: readonly VetoStep[] = [
	{ side: 0, kind: "ban" },
	{ side: 1, kind: "ban" },
	{ side: 0, kind: "ban" },
	{ side: 1, kind: "ban" },
	{ side: 0, kind: "pick" },
	{ side: 1, kind: "pick" },
	{ side: 0, kind: "pick" },
	{ side: 1, kind: "pick" },
];

export type VetoState = {
	actions: VetoAction[];
	remaining: SimMapId[];
	next?: VetoStep;
	complete: boolean;
	mapQueue: MapContext[];
};

export type VetoResult = { ok: true; value: VetoState } | { ok: false; error: VetoErrorCode };

function remainingFrom(actions: readonly VetoAction[]): SimMapId[] {
	const used = new Set(actions.map((action) => action.mapId));
	return MAP_POOL.map((map) => map.id).filter((id) => !used.has(id));
}

export function mapQueueFromVeto(actions: readonly VetoAction[]): MapContext[] | null {
	if (actions.length < DUEL_VETO_STEPS.length) return null;
	const picks = actions.filter((action) => action.kind === "pick");
	const leftover = remainingFrom(actions);
	if (picks.length !== 4 || leftover.length !== 1) return null;
	const deciderId = leftover[0];
	if (!deciderId) return null;
	const decider = getMap(deciderId);
	if (!decider) return null;
	const pickContexts: MapContext[] = [];
	for (const pick of picks) {
		const map = getMap(pick.mapId);
		if (!map) return null;
		pickContexts.push(mapContextFrom(map, pick.side === 0, pick.side));
	}
	return [...pickContexts, mapContextFrom(decider, false)];
}

export function vetoFromActions(actions: readonly VetoAction[]): VetoState {
	const remaining = remainingFrom(actions);
	const complete = actions.length >= DUEL_VETO_STEPS.length;
	return {
		actions: [...actions],
		remaining,
		next: complete ? undefined : DUEL_VETO_STEPS[actions.length],
		complete,
		mapQueue: complete ? (mapQueueFromVeto(actions) ?? []) : [],
	};
}

export function emptyVeto(): VetoState {
	return vetoFromActions([]);
}

export function applyVetoAction(
	state: VetoState,
	action: { side: 0 | 1; mapId: string },
): VetoResult {
	if (state.complete || !state.next) {
		return { ok: false, error: "ALREADY_COMPLETE" };
	}
	if (action.side !== state.next.side) {
		return { ok: false, error: "WRONG_TURN" };
	}
	const map = getMap(action.mapId);
	if (!map) {
		return { ok: false, error: "UNKNOWN_MAP" };
	}
	if (!state.remaining.includes(map.id)) {
		return { ok: false, error: "MAP_GONE" };
	}
	return {
		ok: true,
		value: vetoFromActions([
			...state.actions,
			{ side: action.side, kind: state.next.kind, mapId: map.id },
		]),
	};
}
