import type { PlayerSeason } from "../../data/schema";
import { clamp } from "../math";
import { ACCOLADE_CAP } from "./reference";

export function accoladeBonus(season: PlayerSeason): number {
	const { majorWins, majorMvps, eventMvps, top20Rank } = season.accolades;
	const majors = clamp(majorWins * 1.5, 0, 3);
	const mvps = clamp(majorMvps * 1.5, 0, 3);
	const events = clamp(eventMvps * 0.3, 0, 1.5);
	const rank = top20Bonus(top20Rank);
	return clamp(majors + mvps + events + rank, 0, ACCOLADE_CAP);
}

function top20Bonus(rank: number | undefined): number {
	if (rank === undefined) {
		return 0;
	}
	if (rank === 1) {
		return 1.5;
	}
	if (rank <= 3) {
		return 1;
	}
	if (rank <= 10) {
		return 0.5;
	}
	return 0.25;
}
