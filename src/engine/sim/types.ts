import type { TeamProfile } from "../team";

export type SeriesFormat = "BO1" | "BO3";
export type Side = "CT" | "T";
export type RoundPhase = "regulation" | "overtime";
export type BuyType = "pistol" | "full-buy" | "force" | "eco";

/** Reserved for the maps phase. Unknown map metadata can already flow through results. */
export type MapContext = {
	label?: string;
	mapId?: string;
	[key: string]: unknown;
};

export type EconomyState = {
	bank: number;
	lossBonus: number;
	losses: number;
};

export type EconomyRound = {
	buy: BuyType;
	bankBefore: number;
	bankAfter: number;
	lossBonusBefore: number;
	lossBonusAfter: number;
};

export type KillEvent = {
	killerTeam: 0 | 1;
	killerId: string;
	victimTeam: 0 | 1;
	victimId: string;
	assisterId?: string;
};

export type RoundResult = {
	round: number;
	phase: RoundPhase;
	overtimeBlock?: number;
	sides: readonly [Side, Side];
	winner: 0 | 1;
	winProbabilityTeamA: number;
	scoreAfter: readonly [number, number];
	economy: readonly [EconomyRound, EconomyRound];
	kills: readonly KillEvent[];
};

type HighlightBase = {
	round: number;
	team: 0 | 1;
};

export type HighlightEvent =
	| (HighlightBase & {
			type: "opening-duel";
			playerId: string;
			victimId: string;
	  })
	| (HighlightBase & {
			type: "clutch";
			playerId: string;
			against: number;
	  })
	| (HighlightBase & {
			type: "multikill";
			playerId: string;
			kills: 3 | 4;
	  })
	| (HighlightBase & {
			type: "ace";
			playerId: string;
	  })
	| (HighlightBase & {
			type: "coach-timeout";
			coachId: string;
	  })
	| (HighlightBase & {
			type: "comeback";
			fromDeficit: number;
	  });

export type PlayerMapStats = {
	playerId: string;
	nick: string;
	kills: number;
	deaths: number;
	assists: number;
	adr: number;
	kast: number;
	rating: number;
};

export type MapResult = {
	label: string;
	mapContext?: MapContext;
	winner: 0 | 1;
	score: readonly [number, number];
	regulationScore: readonly [number, number];
	overtimeBlocks: number;
	rounds: readonly RoundResult[];
	scoreboard: readonly [readonly PlayerMapStats[], readonly PlayerMapStats[]];
	highlights: readonly HighlightEvent[];
};

export type SeriesResult = {
	seed: number;
	format: SeriesFormat;
	teams: readonly [TeamProfile, TeamProfile];
	winner: 0 | 1;
	score: readonly [number, number];
	maps: readonly MapResult[];
};

export type SimulateSeriesInput = {
	teams: readonly [TeamProfile, TeamProfile];
	seed: number | string;
	format: SeriesFormat;
	mapContext?: MapContext | readonly MapContext[];
};
