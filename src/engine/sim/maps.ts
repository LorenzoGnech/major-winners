import type { Rng } from "../rng";
import { shuffle } from "../rng";
import type { MapContext, SeriesFormat } from "./types";

export type MapStyle = "aim" | "tactical" | "hybrid";

export type SimMapId =
	| "mirage"
	| "dust2"
	| "inferno"
	| "nuke"
	| "ancient"
	| "anubis"
	| "overpass"
	| "cache"
	| "cobble";

export type SimMap = {
	id: SimMapId;
	label: string;
	background: string;
	style: MapStyle;
};

export const MAP_POOL: readonly SimMap[] = [
	{ id: "mirage", label: "Mirage", background: "/maps/mirage.webp", style: "aim" },
	{ id: "dust2", label: "Dust II", background: "/maps/dust2.webp", style: "aim" },
	{ id: "inferno", label: "Inferno", background: "/maps/inferno.webp", style: "tactical" },
	{ id: "nuke", label: "Nuke", background: "/maps/nuke.webp", style: "tactical" },
	{ id: "ancient", label: "Ancient", background: "/maps/ancient.webp", style: "tactical" },
	{ id: "anubis", label: "Anubis", background: "/maps/anubis.webp", style: "hybrid" },
	{ id: "overpass", label: "Overpass", background: "/maps/overpass.webp", style: "hybrid" },
	{ id: "cache", label: "Cache", background: "/maps/cache.webp", style: "aim" },
	{ id: "cobble", label: "Cobblestone", background: "/maps/cobble.webp", style: "tactical" },
];

const MAP_BY_ID = new Map(MAP_POOL.map((map) => [map.id, map]));

export const MAP_SITES: Record<SimMapId, readonly string[]> = {
	mirage: ["A", "B", "mid"],
	dust2: ["A", "B", "long"],
	inferno: ["A", "B", "banana"],
	nuke: ["A", "B", "ramp"],
	ancient: ["A", "B", "mid"],
	anubis: ["A", "B"],
	overpass: ["A", "B", "monster"],
	cache: ["A", "B", "mid"],
	cobble: ["A", "B", "drop"],
};

export function getMap(id: string): SimMap | undefined {
	return MAP_BY_ID.get(id as SimMapId);
}

export function mapContextFrom(map: SimMap, homePick: boolean): MapContext {
	return {
		mapId: map.id,
		label: map.label,
		homePick,
		style: map.style,
		background: map.background,
	};
}

/** Optional player pick is map 1 with a home bonus. Otherwise the series is a seed shuffle with no home map. Remaining BO3 maps are without replacement. */
export function chooseSeriesMaps(
	rng: Rng,
	format: SeriesFormat,
	playerMapId?: string,
): MapContext[] {
	const count = format === "BO1" ? 1 : 3;
	if (playerMapId) {
		const picked = getMap(playerMapId);
		if (!picked) {
			throw new RangeError(`unknown map "${playerMapId}"`);
		}
		const rest = shuffle(
			MAP_POOL.filter((map) => map.id !== picked.id),
			rng,
		);
		return [
			mapContextFrom(picked, true),
			...rest.slice(0, count - 1).map((map) => mapContextFrom(map, false)),
		];
	}
	return shuffle([...MAP_POOL], rng)
		.slice(0, count)
		.map((map) => mapContextFrom(map, false));
}
