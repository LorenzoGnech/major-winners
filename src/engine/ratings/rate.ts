import type { PlayerSeason } from "../../data/schema";
import { type Attributes, rateAttributes } from "./attributes";
import { type OvrBreakdown, rateOvr } from "./ovr";

export type RatedPlayer = {
	id: string;
	ovr: number;
	breakdown: OvrBreakdown;
	attributes: Attributes;
};

export function ratePlayer(season: PlayerSeason): RatedPlayer {
	const { ovr, breakdown } = rateOvr(season);
	return {
		id: season.id,
		ovr,
		breakdown,
		attributes: rateAttributes(season, ovr),
	};
}

export function ratePlayers(seasons: readonly PlayerSeason[]): RatedPlayer[] {
	return seasons.map(ratePlayer);
}
