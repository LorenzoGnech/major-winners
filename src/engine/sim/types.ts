import type { LingeringBonus, RoundBonus } from "../bonuses";
import type { TeamProfile } from "../team";
import type { GamePlanId } from "./gamePlan";
import type { MapStyle } from "./maps";

export type SeriesFormat = "BO1" | "BO3" | "BO5";
export type Side = "CT" | "T";
export type RoundPhase = "regulation" | "overtime";
export type BuyType = "pistol" | "full-buy" | "force" | "eco";

export type WeaponId =
	| "glock"
	| "usp_s"
	| "p250"
	| "deagle"
	| "cz75"
	| "tec9"
	| "fiveseven"
	| "mac10"
	| "mp9"
	| "mp7"
	| "ump45"
	| "p90"
	| "ppbizon"
	| "galil"
	| "famas"
	| "ak47"
	| "m4a1s"
	| "m4a4"
	| "aug"
	| "sg553"
	| "ssg08"
	| "awp"
	| "autosniper"
	| "mag7"
	| "nova"
	| "sawedoff"
	| "negev";

export type MapContext = {
	mapId: string;
	label: string;
	homePick: boolean;
	pickedBy?: 0 | 1;
	style: MapStyle;
	background: string;
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
	weapon: WeaponId;
};

export type RoundSummary =
	| { kind: "eco-win"; team: 0 | 1 }
	| { kind: "force-win"; team: 0 | 1 }
	| { kind: "ace"; team: 0 | 1; playerId: string }
	| { kind: "clutch"; team: 0 | 1; playerId: string; against: 2 | 3 | 4 | 5 }
	| { kind: "multikill"; team: 0 | 1; playerId: string; kills: 3 | 4 }
	| { kind: "timeout-payoff"; team: 0 | 1 }
	| { kind: "pistol"; team: 0 | 1; side: Side }
	| { kind: "overtime"; team: 0 | 1 }
	| { kind: "clean-sweep"; team: 0 | 1; site: string }
	| { kind: "execute"; team: 0 | 1; site: string }
	| { kind: "hold"; team: 0 | 1; site: string }
	| { kind: "default"; team: 0 | 1 };

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
	moraleAfter: readonly [number, number];
	timeout: boolean;
	summary: RoundSummary;
	bonus?: RoundBonus;
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
			type: "clutch-sequence";
			playerId: string;
			against: 2 | 3 | 4 | 5;
			startKillIndex: number;
			won: boolean;
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
			type: "player-timeout";
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
	gamePlan?: GamePlanId;
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
	playerMapId?: string;
};

export type SimulateSeriesInput = {
	teams: readonly [TeamProfile, TeamProfile];
	seed: number | string;
	format: SeriesFormat;
	playerMapId?: string;
	mapContext?: MapContext | readonly MapContext[];
	gamePlan?: GamePlanId;
	bothSidesPlayer?: boolean;
};

export type RoundWinContext = {
	mapStyle?: MapStyle;
	homePick?: boolean;
	pickedBy?: 0 | 1;
	morale?: readonly [number, number];
	timeoutTeam?: 0 | 1;
	pistolBias?: number;
	earlyRoundBias?: number;
	bonusWinProb?: number;
};

export type LiveMapState = {
	mapIndex: number;
	mapContext: MapContext;
	score: [number, number];
	regulationScore: [number, number] | null;
	sides: [Side, Side];
	overtimeBlocks: number;
	overtimeBlockWins: [number, number];
	overtimeLocalRound: number;
	safetyRound: boolean;
	phase: RoundPhase;
	economies: [EconomyState, EconomyState];
	morale: [number, number];
	rounds: RoundResult[];
	highlights: HighlightEvent[];
	maxDeficit: [number, number];
	comebackEmitted: [boolean, boolean];
	timeoutsRemaining: number;
	awayTimeoutsRemaining?: number;
	pendingTimeout: boolean;
	pendingTimeoutTeam?: 0 | 1;
	lingeringBonuses: LingeringBonus[];
	gamePlan: GamePlanId;
	complete: boolean;
	winner?: 0 | 1;
	scoreboard?: [PlayerMapStats[], PlayerMapStats[]];
};

export type LiveSeriesState = {
	seed: number;
	rngState: number;
	format: SeriesFormat;
	teams: readonly [TeamProfile, TeamProfile];
	playerMapId?: string;
	bothSidesPlayer?: boolean;
	mapQueue: MapContext[];
	maps: MapResult[];
	seriesScore: [number, number];
	current: LiveMapState | null;
	complete: boolean;
	winner?: 0 | 1;
};

export type SimErrorCode =
	| "SERIES_COMPLETE"
	| "NO_TIMEOUTS"
	| "ALREADY_QUEUED"
	| "MAP_COMPLETE"
	| "MAP_IN_PROGRESS"
	| "NEED_GAME_PLAN"
	| "UNKNOWN_MAP";

export type LiveSeriesResult =
	| { ok: true; value: LiveSeriesState }
	| { ok: false; error: { code: SimErrorCode; message: string } };
