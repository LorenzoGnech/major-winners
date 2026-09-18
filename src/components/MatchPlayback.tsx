import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Org, PlayerSeason, Role } from "../data";
import {
	applyGamePlan,
	type BonusId,
	equipmentValue,
	getMap,
	type HighlightEvent,
	initialMorale,
	type KillEvent,
	type LiveSeriesState,
	type MapResult,
	type PlayerMapStats,
	playbackBanks,
	playRound,
	type RoundResult,
	resolveGamePlan,
	type SeriesResult,
	type Side,
	scoreboardRating,
	seriesFromLive,
	shouldShowFeaturedClutch,
	skipCurrentMap,
	type TeamMemberProfile,
	TIMEOUT_MORALE,
} from "../engine";
import { bonusById } from "../engine/bonuses";
import { BonusMoment } from "./BonusMoment";
import { ClutchMoment } from "./ClutchMoment";
import {
	activeClutchSequence,
	clutchBeatLine,
	clutchEnemiesLeft,
	clutchMomentLines,
	clutchMomentStartIndex,
	clutchOpponents,
} from "./clutchNarrative";
import { MapWinMoment } from "./MapWinMoment";
import { preloadMapArt } from "./mapArt";
import { OrgCrest } from "./OrgCrest";
import { PlayerCrest } from "./PlayerCrest";
import { lineupDeadIds, liveCastLines } from "./roundCast";
import { TimeoutMoment } from "./TimeoutMoment";
import { TraitIcons } from "./TraitBadge";
import { WeaponIcon } from "./WeaponIcon";

type MatchPlaybackProps = {
	result?: SeriesResult;
	live?: LiveSeriesState;
	onLiveChange?: (live: LiveSeriesState) => void;
	teamLabels: readonly [string, string];
	viewerSide?: 0 | 1;
	opponentOrg?: Pick<Org, "id" | "name" | "logo">;
	playersById?: ReadonlyMap<string, PlayerSeason>;
	eyebrow?: string;
	onComplete?: () => void;
	onAwaitingNextMap?: () => void;
	onContinueMatch?: () => void;
	continueLabel?: string;
};

type LiveLine = {
	kills: number;
	deaths: number;
	assists: number;
};

const CONTROL_CLASS =
	"min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-white/30 enabled:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40";
const CONTINUE_MATCH_CLASS =
	"rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";
const SPEED_BUTTON_CLASS =
	"min-w-11 flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";

const TEAM_TEXT = ["text-emerald-300", "text-amber-300"] as const;

function otherSideIndex(side: 0 | 1): 0 | 1 {
	return side === 0 ? 1 : 0;
}

function pairFromViewer<T>(pair: readonly [T, T], viewer: 0 | 1): [T, T] {
	return viewer === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];
}

function viewOf(team: 0 | 1, viewer: 0 | 1): 0 | 1 {
	return team === viewer ? 0 : 1;
}

function mapPickCaption(
	context: { homePick?: boolean; pickedBy?: 0 | 1 } | undefined,
	viewer: 0 | 1,
	labels: readonly [string, string],
): string {
	if (!context) return "";
	if (context.pickedBy === viewer) return " · your pick";
	if (context.pickedBy !== undefined) return ` · ${labels[context.pickedBy]} pick`;
	if (context.homePick) return viewer === 0 ? " · your pick" : ` · ${labels[0]} pick`;
	return "";
}
const FEED_BOX_CLASS = "flex h-60 flex-col overflow-hidden sm:h-64 lg:h-44";

const ROLE_LABELS: Record<Role, string> = {
	awp: "AWP",
	igl: "IGL",
	entry: "Entry",
	support: "Support",
	lurker: "Lurker",
};

export function aggregateSeriesScoreboard(
	maps: readonly MapResult[],
): readonly [readonly PlayerMapStats[], readonly PlayerMapStats[]] {
	return ([0, 1] as const).map((teamIndex) => {
		const byPlayer = new Map<
			string,
			{
				nick: string;
				kills: number;
				deaths: number;
				assists: number;
				adrWeight: number;
				kastWeight: number;
				rounds: number;
			}
		>();
		for (const map of maps) {
			const rounds = map.rounds.length;
			for (const player of map.scoreboard[teamIndex] ?? []) {
				const row = byPlayer.get(player.playerId) ?? {
					nick: player.nick,
					kills: 0,
					deaths: 0,
					assists: 0,
					adrWeight: 0,
					kastWeight: 0,
					rounds: 0,
				};
				row.kills += player.kills;
				row.deaths += player.deaths;
				row.assists += player.assists;
				row.adrWeight += player.adr * rounds;
				row.kastWeight += player.kast * rounds;
				row.rounds += rounds;
				byPlayer.set(player.playerId, row);
			}
		}
		return [...byPlayer.entries()].map(([playerId, row]) => {
			const adr = row.rounds === 0 ? 0 : Math.round(row.adrWeight / row.rounds);
			const kast = row.rounds === 0 ? 0 : Math.round(row.kastWeight / row.rounds);
			return {
				playerId,
				nick: row.nick,
				kills: row.kills,
				deaths: row.deaths,
				assists: row.assists,
				adr,
				kast,
				rating: scoreboardRating({
					kills: row.kills,
					deaths: row.deaths,
					assists: row.assists,
					adr,
					kast,
					rounds: row.rounds,
				}),
			};
		});
	}) as [PlayerMapStats[], PlayerMapStats[]];
}

export function seriesRoundsWon(maps: readonly MapResult[]): readonly [number, number] {
	return maps.reduce(
		(score, map) => [score[0] + map.score[0], score[1] + map.score[1]] as [number, number],
		[0, 0],
	);
}

export function liveLines(
	rounds: readonly RoundResult[],
	settledCount: number,
	extraKills: readonly KillEvent[] = [],
): Map<string, LiveLine> {
	const stats = new Map<string, LiveLine>();
	const bump = (id: string, key: keyof LiveLine) => {
		const row = stats.get(id) ?? { kills: 0, deaths: 0, assists: 0 };
		row[key] += 1;
		stats.set(id, row);
	};
	for (const round of rounds.slice(0, settledCount)) {
		for (const kill of round.kills) {
			bump(kill.killerId, "kills");
			bump(kill.victimId, "deaths");
			if (kill.assisterId) bump(kill.assisterId, "assists");
		}
	}
	for (const kill of extraKills) {
		bump(kill.killerId, "kills");
		bump(kill.victimId, "deaths");
		if (kill.assisterId) bump(kill.assisterId, "assists");
	}
	return stats;
}

export type PlaybackTick =
	| { kind: "kill"; mapIndex: number; roundIndex: number; killIndex: number }
	| { kind: "settle"; mapIndex: number; roundIndex: number };

export type PlaybackCursor = {
	mapIndex: number;
	settledRoundCount: number;
	inProgressRound: RoundResult | undefined;
	inProgressKills: readonly KillEvent[];
	deadIds: ReadonlySet<string>;
	score: readonly [number, number];
	seriesScore: readonly [number, number];
	complete: boolean;
};

export function buildPlaybackTicks(maps: readonly MapResult[]): PlaybackTick[] {
	const ticks: PlaybackTick[] = [];
	for (const [mapIndex, map] of maps.entries()) {
		for (const [roundIndex, round] of map.rounds.entries()) {
			for (const killIndex of round.kills.keys()) {
				ticks.push({ kind: "kill", mapIndex, roundIndex, killIndex });
			}
			ticks.push({ kind: "settle", mapIndex, roundIndex });
		}
	}
	return ticks;
}

export const PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const PLAYBACK_TICK_MS = 750;
export const PLAYBACK_CLUTCH_TICK_MS = 1_400;
export const PLAYBACK_SPEED_STORAGE_KEY = "major-winners:playback-speed:v1";

export function playbackTickMs(speed: PlaybackSpeed): number {
	return PLAYBACK_TICK_MS / speed;
}

export function playbackClutchTickMs(speed: PlaybackSpeed): number {
	return PLAYBACK_CLUTCH_TICK_MS / speed;
}

export function parsePlaybackSpeed(raw: string | null): PlaybackSpeed {
	if (raw === "1" || raw === "2" || raw === "4") return Number(raw) as PlaybackSpeed;
	return 1;
}

export function loadPlaybackSpeed(storage: Pick<Storage, "getItem">): PlaybackSpeed {
	try {
		return parsePlaybackSpeed(storage.getItem(PLAYBACK_SPEED_STORAGE_KEY));
	} catch {
		return 1;
	}
}

export function savePlaybackSpeed(storage: Pick<Storage, "setItem">, speed: PlaybackSpeed): void {
	try {
		storage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(speed));
	} catch {
		// Unavailable storage must not block play.
	}
}

let rememberedSpeed: PlaybackSpeed | null = null;

export function latestRoundFeed(
	cursor: PlaybackCursor,
	map: MapResult,
): {
	round: RoundResult;
	kills: readonly KillEvent[];
	settled: boolean;
	highlights: readonly HighlightEvent[];
} | null {
	if (cursor.inProgressRound) {
		return {
			round: cursor.inProgressRound,
			kills: cursor.inProgressKills,
			settled: false,
			highlights: [],
		};
	}
	const settled = map.rounds[cursor.settledRoundCount - 1];
	if (!settled) return null;
	return {
		round: settled,
		kills: settled.kills,
		settled: true,
		highlights: map.highlights.filter((highlight) => highlight.round === settled.round),
	};
}

export function playbackMorale(
	rounds: readonly RoundResult[],
	settledRoundCount: number,
	fallback: readonly [number, number],
): readonly [number, number] {
	if (settledRoundCount <= 0) return fallback;
	const round = rounds[settledRoundCount - 1];
	return round?.moraleAfter ?? fallback;
}

export function liveBoardMorale(
	rounds: readonly RoundResult[],
	settledRoundCount: number,
	fallback: readonly [number, number],
	liveMorale: readonly [number, number] | undefined,
	caughtUp: boolean,
): readonly [number, number] {
	if (caughtUp && liveMorale) return liveMorale;
	return playbackMorale(rounds, settledRoundCount, fallback);
}

/** Huddle overlay and bar pulse wait until the in-progress round has settled. */
export function timeoutBoostVisible(
	caughtUp: boolean,
	pendingTimeout: boolean,
	timeoutMoment: boolean,
): boolean {
	return timeoutMoment || (caughtUp && pendingTimeout);
}

export function shouldRevealTimeoutMoment(
	armed: boolean,
	caughtUp: boolean,
	mapOpen: boolean,
): boolean {
	return armed && caughtUp && mapOpen;
}

export function shouldHoldForCoachTimeout(
	pendingTimeout: boolean,
	caughtUp: boolean,
	mapOpen: boolean,
	huddleDone: boolean,
): boolean {
	return pendingTimeout && caughtUp && mapOpen && !huddleDone;
}

export function upcomingBonusRound(
	maps: readonly MapResult[],
	ticks: readonly PlaybackTick[],
	revealedCount: number,
): { round: RoundResult; mapIndex: number } | undefined {
	const tick = ticks[revealedCount];
	if (tick?.kind !== "kill" || tick.killIndex !== 0) return undefined;
	const round = maps[tick.mapIndex]?.rounds[tick.roundIndex];
	if (!round?.bonus) return undefined;
	return { round, mapIndex: tick.mapIndex };
}

export function shouldRevealBonusMoment(
	upcoming: { round: RoundResult; mapIndex: number } | undefined,
	shownKey: string | null,
): boolean {
	if (!upcoming) return false;
	return shownKey !== `${upcoming.mapIndex}:${upcoming.round.round}`;
}

export const TIMEOUT_MOMENT_MS = 2_200;
export const TIMEOUT_MOMENT_REDUCED_MS = 400;
export const BONUS_MOMENT_MS = 2_800;
export const BONUS_MOMENT_REDUCED_MS = TIMEOUT_MOMENT_REDUCED_MS;

export function formatMoralePercent(value: number): string {
	return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

export function resolvePlayback(
	maps: readonly MapResult[],
	ticks: readonly PlaybackTick[],
	revealedCount: number,
): PlaybackCursor {
	const empty: PlaybackCursor = {
		mapIndex: 0,
		settledRoundCount: 0,
		inProgressRound: undefined,
		inProgressKills: [],
		deadIds: new Set(),
		score: [0, 0],
		seriesScore: [0, 0],
		complete: false,
	};
	if (maps.length === 0 || ticks.length === 0) return empty;
	const clamped = Math.min(Math.max(revealedCount, 0), ticks.length);
	const complete = clamped >= ticks.length;
	const last = ticks[clamped - 1];
	if (!last) return empty;

	const seriesScore: [number, number] = [0, 0];
	for (let mapIndex = 0; mapIndex < last.mapIndex; mapIndex += 1) {
		const prior = maps[mapIndex];
		if (prior) seriesScore[prior.winner] += 1;
	}

	const map = maps[last.mapIndex];
	if (last.kind === "settle") {
		const round = map?.rounds[last.roundIndex];
		const lastRoundOfMap = last.roundIndex === (map?.rounds.length ?? 0) - 1;
		if (lastRoundOfMap && map) seriesScore[map.winner] += 1;
		return {
			mapIndex: last.mapIndex,
			settledRoundCount: last.roundIndex + 1,
			inProgressRound: undefined,
			inProgressKills: [],
			deadIds: new Set(),
			score: round?.scoreAfter ?? [0, 0],
			seriesScore,
			complete,
		};
	}

	const round = map?.rounds[last.roundIndex];
	const kills = round?.kills.slice(0, last.killIndex + 1) ?? [];
	const previous =
		last.roundIndex === 0
			? ([0, 0] as const)
			: (map?.rounds[last.roundIndex - 1]?.scoreAfter ?? ([0, 0] as const));
	return {
		mapIndex: last.mapIndex,
		settledRoundCount: last.roundIndex,
		inProgressRound: round,
		inProgressKills: kills,
		deadIds: new Set(kills.map((kill) => kill.victimId)),
		score: previous,
		seriesScore,
		complete,
	};
}

/** Winner of the round that just settled, while that settle beat is on screen. */
export function settleWinner(
	maps: readonly MapResult[],
	ticks: readonly PlaybackTick[],
	revealedCount: number,
): 0 | 1 | undefined {
	const tick = ticks[revealedCount - 1];
	if (tick?.kind !== "settle") return undefined;
	return maps[tick.mapIndex]?.rounds[tick.roundIndex]?.winner;
}

export type MapWinReveal = {
	mapIndex: number;
	winner: 0 | 1;
	score: readonly [number, number];
	label: string;
};

export function endOfMapRevealedCount(ticks: readonly PlaybackTick[], mapIndex: number): number {
	let end = 0;
	for (const [index, tick] of ticks.entries()) {
		if (tick.mapIndex === mapIndex) end = index + 1;
	}
	return end;
}

export function mapWinAt(
	maps: readonly MapResult[],
	ticks: readonly PlaybackTick[],
	revealedCount: number,
	live?: LiveSeriesState,
): MapWinReveal | undefined {
	const tick = ticks[revealedCount - 1];
	if (tick?.kind !== "settle") return undefined;
	const map = maps[tick.mapIndex];
	if (!map || tick.roundIndex !== map.rounds.length - 1) return undefined;
	if (live && !live.complete && tick.mapIndex >= live.maps.length) return undefined;
	return {
		mapIndex: tick.mapIndex,
		winner: map.winner,
		score: map.score,
		label: map.label,
	};
}

export function isWaitingForNextMap(live: LiveSeriesState | undefined, caughtUp: boolean): boolean {
	return Boolean(live && !live.complete && !live.current && caughtUp);
}

export function mapWinContinueKind(
	live: LiveSeriesState | undefined,
): "next-map" | "next-match" | "dismiss" {
	if (!live) return "dismiss";
	if (live.complete) return "next-match";
	if (!live.current) return "next-map";
	return "dismiss";
}

export const MAP_WIN_MOMENT_MS = 2_600;
export const MAP_WIN_MOMENT_REDUCED_MS = 500;

function playerName(result: SeriesResult, playerId: string): string {
	for (const team of result.teams) {
		const player = team.members.find((member) => member.id === playerId);
		if (player) return player.nick;
	}
	return playerId;
}

function KillFeedLine({
	kill,
	result,
	viewerSide,
}: {
	kill: KillEvent;
	result: SeriesResult;
	viewerSide: 0 | 1;
}) {
	const killer = playerName(result, kill.killerId);
	const victim = playerName(result, kill.victimId);
	const assist = kill.assisterId ? playerName(result, kill.assisterId) : null;
	const killerTone = TEAM_TEXT[viewOf(kill.killerTeam, viewerSide)];
	const victimTone = TEAM_TEXT[viewOf(kill.victimTeam, viewerSide)];
	return (
		<span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-zinc-300">
			<span className={`font-medium ${killerTone}`}>{killer}</span>
			{assist ? <span className={`text-[0.95em] ${killerTone} opacity-70`}>+ {assist}</span> : null}
			<WeaponIcon weapon={kill.weapon} className={killerTone} />
			<span className={victimTone}>{victim}</span>
		</span>
	);
}

function roundGroupKey(round: RoundResult): string {
	if (round.phase === "regulation") return round.round <= 12 ? "First half" : "Second half";
	const localOvertimeRound = round.round - 25;
	const half = (localOvertimeRound - 1) % 6 < 3 ? 1 : 2;
	return `OT${round.overtimeBlock ?? 1} H${half}`;
}

function groupedRounds(rounds: readonly RoundResult[]): [string, RoundResult[]][] {
	const groups: [string, RoundResult[]][] = [];
	for (const round of rounds) {
		const key = roundGroupKey(round);
		const last = groups.at(-1);
		if (last?.[0] === key) last[1].push(round);
		else groups.push([key, [round]]);
	}
	return groups;
}

function crestFor(
	member: TeamMemberProfile,
	playersById: ReadonlyMap<string, PlayerSeason> | undefined,
): Pick<PlayerSeason, "playerId" | "nick" | "photo"> {
	const season = playersById?.get(member.id);
	return {
		playerId: season?.playerId ?? member.id,
		nick: member.nick,
		photo: season?.photo,
	};
}

function traitsByPlayerId(
	teams: readonly [
		{ members: readonly TeamMemberProfile[] },
		{ members: readonly TeamMemberProfile[] },
	],
): ReadonlyMap<string, readonly BonusId[]> {
	const map = new Map<string, readonly BonusId[]>();
	for (const team of teams) {
		for (const member of team.members) {
			if (member.bonusIds && member.bonusIds.length > 0) {
				map.set(member.id, member.bonusIds);
			}
		}
	}
	return map;
}

function SideMark({ side }: { side: Side }) {
	return (
		<span
			className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
				side === "CT" ? "bg-sky-300/15 text-sky-200" : "bg-orange-300/15 text-orange-200"
			}`}
		>
			{side}
		</span>
	);
}

function RoundTimeline({
	map,
	revealed,
	teamLabels,
}: {
	map: MapResult;
	revealed: number;
	teamLabels: readonly [string, string];
}) {
	return (
		<section
			className="mt-4 hidden flex-wrap justify-center gap-x-4 gap-y-3 lg:flex"
			aria-label={`${map.label} round timeline`}
		>
			{groupedRounds(map.rounds).map(([label, rounds]) => (
				<div key={label}>
					<p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
						{label}
					</p>
					<div className="flex flex-wrap justify-center gap-1">
						{rounds.map((round) => {
							const isRevealed = round.round <= revealed;
							return (
								<span
									key={round.round}
									role="img"
									title={
										isRevealed
											? `Round ${round.round}: ${teamLabels[round.winner]}`
											: `Round ${round.round}: not played`
									}
									aria-label={
										isRevealed
											? `Round ${round.round}, won by ${teamLabels[round.winner]}`
											: `Round ${round.round}, not yet revealed`
									}
									className={`size-2.5 rounded-sm border motion-safe:transition-colors ${
										isRevealed
											? round.winner === 0
												? "border-emerald-300 bg-emerald-300"
												: "border-amber-300 bg-amber-300"
											: "border-white/10 bg-white/3"
									}`}
								/>
							);
						})}
					</div>
				</div>
			))}
		</section>
	);
}

function Scoreboard({
	teams,
	teamLabels,
	roundsWon,
	traitsByPlayer,
}: {
	teams: readonly [readonly PlayerMapStats[], readonly PlayerMapStats[]];
	teamLabels: readonly [string, string];
	roundsWon: readonly [number, number];
	traitsByPlayer: ReadonlyMap<string, readonly BonusId[]>;
}) {
	return (
		<div className="space-y-4">
			{teams.map((teamRows, teamIndex) => (
				<div key={teamLabels[teamIndex]}>
					<div className="mb-2 flex items-baseline justify-between gap-3">
						<h4 className="text-sm font-semibold text-zinc-100">{teamLabels[teamIndex]}</h4>
						<span className="text-xs tabular-nums text-zinc-500">
							{roundsWon[teamIndex]} rounds
						</span>
					</div>
					<div className="overflow-x-auto rounded-xl border border-white/10">
						<table className="w-full min-w-0 text-left text-xs lg:min-w-lg">
							<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-zinc-500">
								<tr>
									<th className="px-3 py-2 font-semibold">Player</th>
									<th className="px-2 py-2 text-right font-semibold">K-D-A</th>
									<th className="hidden px-2 py-2 text-right font-semibold lg:table-cell">ADR</th>
									<th className="hidden px-2 py-2 text-right font-semibold lg:table-cell">KAST</th>
									<th className="px-3 py-2 text-right font-semibold">Rating</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/8">
								{teamRows
									.toSorted((left, right) => right.rating - left.rating)
									.map((player) => (
										<tr key={player.playerId} className="bg-black/15 text-zinc-300">
											<th className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-100">
												<span className="inline-flex items-center gap-1.5">
													{player.nick}
													<TraitIcons ids={traitsByPlayer.get(player.playerId) ?? []} size="xs" />
												</span>
											</th>
											<td className="px-2 py-2 text-right tabular-nums">
												{player.kills}-{player.deaths}-{player.assists}
											</td>
											<td className="hidden px-2 py-2 text-right tabular-nums lg:table-cell">
												{player.adr}
											</td>
											<td className="hidden px-2 py-2 text-right tabular-nums lg:table-cell">
												{player.kast}%
											</td>
											<td className="px-3 py-2 text-right font-bold tabular-nums text-white">
												{player.rating.toFixed(2)}
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
				</div>
			))}
		</div>
	);
}

function TeamLineup({
	align,
	label,
	members,
	coachNick,
	overall,
	org,
	side,
	stats,
	involvedIds,
	deadIds,
	playersById,
}: {
	align: "left" | "right";
	label: string;
	members: readonly TeamMemberProfile[];
	coachNick: string;
	overall: number;
	org?: Pick<Org, "id" | "name" | "logo">;
	side?: Side;
	stats: ReadonlyMap<string, LiveLine>;
	involvedIds: ReadonlySet<string>;
	deadIds: ReadonlySet<string>;
	playersById?: ReadonlyMap<string, PlayerSeason>;
}) {
	const isRight = align === "right";
	const tone =
		align === "left"
			? "border-emerald-300/25 bg-emerald-300/6"
			: "border-amber-300/25 bg-amber-300/6";
	return (
		<section aria-label={`${label} lineup`} className={`rounded-2xl border p-3 sm:p-4 ${tone}`}>
			<header className={`flex items-center gap-3 ${isRight ? "flex-row-reverse text-right" : ""}`}>
				{org ? <OrgCrest org={org} size="md" /> : null}
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-white">{org?.name ?? label}</p>
					<p
						className={`mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 ${isRight ? "justify-end" : ""}`}
					>
						{isRight ? (
							<>
								{side ? <SideMark side={side} /> : null}
								<span className="tabular-nums">OVR {overall}</span>
							</>
						) : (
							<>
								<span className="tabular-nums">OVR {overall}</span>
								{side ? <SideMark side={side} /> : null}
							</>
						)}
					</p>
					{org ? (
						<p className="mt-0.5 truncate text-[11px] text-zinc-500">
							{label.startsWith(`${org.name} · `) ? label.slice(org.name.length + 3) : label}
						</p>
					) : null}
				</div>
			</header>
			<ul className="mt-3 space-y-1.5">
				{members.map((member) => {
					const line = stats.get(member.id) ?? { kills: 0, deaths: 0, assists: 0 };
					const dead = deadIds.has(member.id);
					const hot = !dead && involvedIds.has(member.id);
					return (
						<li
							key={member.id}
							title={dead ? `${member.nick}, eliminated this round` : undefined}
							aria-label={dead ? `${member.nick}, eliminated this round` : undefined}
							className={`flex items-center gap-2 rounded-xl px-1.5 py-1.5 motion-safe:transition-[opacity,filter,background-color] ${
								isRight ? "flex-row-reverse" : ""
							} ${dead ? "" : hot ? "bg-white/8 ring-1 ring-white/15" : ""}`}
						>
							<div className={`shrink-0 ${dead ? "opacity-40 grayscale" : ""}`}>
								<PlayerCrest player={crestFor(member, playersById)} size="md" />
							</div>
							<div
								className={`min-w-0 flex-1 ${isRight ? "text-right" : ""} ${
									dead ? "opacity-40 grayscale" : ""
								}`}
							>
								<p className="truncate text-sm font-semibold text-zinc-100">{member.nick}</p>
								<p className="text-[10px] uppercase tracking-wider text-zinc-500">
									{ROLE_LABELS[member.slot]}
								</p>
							</div>
							<span
								className={`flex shrink-0 items-center gap-1 ${isRight ? "flex-row-reverse" : ""}`}
							>
								<TraitIcons
									ids={member.bonusIds ?? []}
									size="xs"
									tip={isRight ? "center" : "start"}
								/>
								<span
									className={`text-xs font-semibold tabular-nums text-zinc-300 ${
										dead ? "opacity-40 grayscale" : ""
									}`}
								>
									{line.kills}-{line.deaths}
								</span>
							</span>
						</li>
					);
				})}
			</ul>
			<p className={`mt-3 truncate text-[11px] text-zinc-500 ${isRight ? "text-right" : ""}`}>
				Coach · {coachNick}
			</p>
		</section>
	);
}

function CompactMatchLineups({
	leftLabel,
	rightLabel,
	leftMembers,
	rightMembers,
	stats,
	deadIds,
	involvedIds,
	playersById,
}: {
	leftLabel: string;
	rightLabel: string;
	leftMembers: readonly TeamMemberProfile[];
	rightMembers: readonly TeamMemberProfile[];
	stats: ReadonlyMap<string, LiveLine>;
	deadIds: ReadonlySet<string>;
	involvedIds: ReadonlySet<string>;
	playersById?: ReadonlyMap<string, PlayerSeason>;
}) {
	function column(
		label: string,
		members: readonly TeamMemberProfile[],
		tone: "player" | "opponent",
	) {
		return (
			<div>
				<p
					className={`truncate text-[10px] font-semibold uppercase tracking-wider ${
						tone === "player" ? "text-emerald-300" : "text-amber-300"
					}`}
				>
					{label}
				</p>
				<ul className="mt-1.5 space-y-1">
					{members.map((member) => {
						const line = stats.get(member.id) ?? { kills: 0, deaths: 0, assists: 0 };
						const dead = deadIds.has(member.id);
						const hot = !dead && involvedIds.has(member.id);
						return (
							<li
								key={member.id}
								className={`flex items-center gap-1.5 rounded-lg px-1 py-0.5 ${hot ? "bg-white/8" : ""}`}
							>
								<div className={`shrink-0 ${dead ? "opacity-40 grayscale" : ""}`}>
									<PlayerCrest player={crestFor(member, playersById)} size="sm" />
								</div>
								<p
									className={`min-w-0 flex-1 truncate text-xs font-semibold text-zinc-100 ${
										dead ? "opacity-40 grayscale" : ""
									}`}
								>
									{member.nick}
								</p>
								<TraitIcons ids={member.bonusIds ?? []} size="xs" />
								<span
									className={`shrink-0 text-[11px] font-semibold tabular-nums text-zinc-300 ${
										dead ? "opacity-40 grayscale" : ""
									}`}
								>
									{line.kills}-{line.deaths}
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		);
	}
	return (
		<section aria-label="Lineups" className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
			{column(leftLabel, leftMembers, "player")}
			{column(rightLabel, rightMembers, "opponent")}
		</section>
	);
}

function RoundFeedItem({
	round,
	kills,
	settled,
	result,
	shortLabels,
	viewerSide,
	castLine,
}: {
	round: RoundResult;
	kills: readonly KillEvent[];
	settled: boolean;
	result: SeriesResult;
	shortLabels: readonly [string, string];
	viewerSide: 0 | 1;
	castLine?: string;
}) {
	return (
		<li
			className={`${FEED_BOX_CLASS} rounded-xl border border-white/12 bg-zinc-950/70 px-3 py-2.5 text-xs`}
		>
			<span className="shrink-0 font-semibold text-zinc-100">
				{settled ? (
					<>
						R{round.round} · {shortLabels[round.winner]}{" "}
						<span className="text-zinc-400">
							{round.scoreAfter[0]}–{round.scoreAfter[1]}
						</span>
					</>
				) : (
					<>R{round.round}</>
				)}
			</span>
			{castLine ? (
				<p className="mt-1 shrink-0 text-[11px] leading-snug text-zinc-300 lg:hidden">{castLine}</p>
			) : null}
			<ul className="feed-stack-fade mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-hidden">
				{[...kills].toReversed().map((kill) => (
					<li
						key={`${round.round}-${kill.killerId}-${kill.victimId}-${kill.assisterId ?? "none"}`}
						aria-label={`${playerName(result, kill.killerId)} killed ${playerName(result, kill.victimId)}`}
						className="feed-stack-in"
					>
						<div className="feed-stack-in-inner">
							<KillFeedLine kill={kill} result={result} viewerSide={viewerSide} />
						</div>
					</li>
				))}
			</ul>
		</li>
	);
}

function keyedCastLines(
	lines: readonly string[],
): { key: string; line: string; latest: boolean }[] {
	const seen = new Map<string, number>();
	return lines
		.map((line) => {
			const count = (seen.get(line) ?? 0) + 1;
			seen.set(line, count);
			return {
				key: count === 1 ? line : `${line} #${count}`,
				line,
			};
		})
		.toReversed()
		.map((item, index) => ({ ...item, latest: index === 0 }));
}

function RoundCast({ lines }: { lines: readonly string[] }) {
	return (
		<section
			aria-label="Round cast"
			className={`${FEED_BOX_CLASS} rounded-xl border border-white/15 bg-zinc-950/88 px-3 py-2.5 text-sm leading-snug text-zinc-100 shadow-lg`}
		>
			<p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
				Cast
			</p>
			<ol className="feed-stack-fade mt-2 min-h-0 flex-1 space-y-1.5 overflow-hidden">
				{keyedCastLines(lines).map(({ key, line, latest }) => (
					<li key={key} className="feed-stack-in">
						<div
							className={`feed-stack-in-inner ${latest ? "font-medium text-white" : "text-zinc-400"}`}
						>
							{line}
						</div>
					</li>
				))}
			</ol>
		</section>
	);
}

function formatCash(value: number): string {
	if (value >= 1000) {
		const thousands = value / 1000;
		return `$${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
	}
	return `$${value}`;
}

function buyLabel(buy: string): string {
	if (buy === "full-buy") return "full buy";
	if (buy === "force") return "force";
	if (buy === "eco") return "eco";
	if (buy === "pistol") return "pistol";
	return buy;
}

function CompareBar({
	left,
	right,
	leftCaption,
	rightCaption,
	label,
}: {
	left: number;
	right: number;
	leftCaption: ReactNode;
	rightCaption: ReactNode;
	label: string;
}) {
	const total = left + right;
	const leftPct = total === 0 ? 50 : (left / total) * 100;
	return (
		<div>
			<p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
				{label}
			</p>
			<div className="mb-1 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
				<span className="text-emerald-200/90">{leftCaption}</span>
				<span className="text-right text-amber-200/90">{rightCaption}</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-amber-300/80">
				<div
					className="h-full bg-emerald-300 motion-safe:transition-[width]"
					style={{ width: `${leftPct}%` }}
				/>
			</div>
		</div>
	);
}

function EconomyBars({
	roundValues,
	totals,
	buys,
	labels,
}: {
	roundValues: readonly [number, number];
	totals: readonly [number, number];
	buys: readonly [string, string];
	labels: readonly [string, string];
}) {
	return (
		<section className="mt-4 space-y-3" aria-label="Team economy">
			<CompareBar
				label="This round"
				left={roundValues[0]}
				right={roundValues[1]}
				leftCaption={
					<>
						<span className="lg:hidden">
							You · {buyLabel(buys[0])} · {formatCash(roundValues[0])}
						</span>
						<span className="hidden lg:inline">
							{labels[0]} · {buyLabel(buys[0])} · ${roundValues[0].toLocaleString()}
						</span>
					</>
				}
				rightCaption={
					<>
						<span className="lg:hidden">
							{formatCash(roundValues[1])} · {buyLabel(buys[1])} · Opp
						</span>
						<span className="hidden lg:inline">
							${roundValues[1].toLocaleString()} · {buyLabel(buys[1])} · {labels[1]}
						</span>
					</>
				}
			/>
			<CompareBar
				label="Bank"
				left={totals[0]}
				right={totals[1]}
				leftCaption={
					<>
						<span className="lg:hidden">You · {formatCash(totals[0])}</span>
						<span className="hidden lg:inline">
							{labels[0]} · ${totals[0].toLocaleString()}
						</span>
					</>
				}
				rightCaption={
					<>
						<span className="lg:hidden">{formatCash(totals[1])} · Opp</span>
						<span className="hidden lg:inline">
							${totals[1].toLocaleString()} · {labels[1]}
						</span>
					</>
				}
			/>
		</section>
	);
}

function MoraleMeter({
	value,
	label,
	tone,
	boosted,
}: {
	value: number;
	label: string;
	tone: "player" | "opponent";
	boosted?: boolean;
}) {
	const pct = Math.round(Math.min(100, Math.max(0, value)));
	return (
		<div>
			<div className="mb-1 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
				<span className={tone === "player" ? "text-emerald-200/90" : "text-amber-200/90"}>
					<span className="lg:hidden">{tone === "player" ? "You" : "Opp"}</span>
					<span className="hidden lg:inline">{label}</span>
				</span>
				<span
					className={`tabular-nums ${tone === "player" ? "text-emerald-200" : "text-amber-200"}`}
				>
					{formatMoralePercent(value)}
				</span>
			</div>
			<div
				className={`h-2 overflow-hidden rounded-full bg-white/10 ${
					boosted ? "morale-timeout-pulse" : ""
				}`}
			>
				<div
					className={`h-full motion-safe:transition-[width] ${tone === "player" ? "bg-emerald-300" : "bg-amber-300"}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

function MoraleBars({
	values,
	labels,
	boosted,
}: {
	values: readonly [number, number];
	labels: readonly [string, string];
	boosted?: boolean;
}) {
	return (
		<section className="mt-4 space-y-3" aria-label="Team morale">
			<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Morale</p>
			<MoraleMeter value={values[0]} label={labels[0]} tone="player" boosted={boosted} />
			<MoraleMeter value={values[1]} label={labels[1]} tone="opponent" />
		</section>
	);
}

export function MatchPlayback({
	result: completedResult,
	live,
	onLiveChange,
	teamLabels,
	viewerSide = 0,
	opponentOrg,
	playersById,
	eyebrow,
	onComplete,
	onAwaitingNextMap,
	onContinueMatch,
	continueLabel = "Continue",
}: MatchPlaybackProps) {
	const result = live ? seriesFromLive(live) : completedResult;
	const opponent = otherSideIndex(viewerSide);
	const simLabels = [teamLabels[0], opponentOrg?.name ?? teamLabels[1]] as const;
	const viewLabels = pairFromViewer(simLabels, viewerSide);
	const shortLabels = simLabels;
	const maps = result?.maps ?? [];
	const playerTraits = useMemo(
		() => (result ? traitsByPlayerId(result.teams) : new Map<string, readonly BonusId[]>()),
		[result],
	);
	const playbackTicks = useMemo(() => buildPlaybackTicks(maps), [maps]);
	const mapArt = useMemo(() => {
		const queued = live?.mapQueue.map((map) => map.background) ?? [];
		const played = maps.map((map) => map.mapContext?.background).filter(Boolean) as string[];
		return [...queued, ...played];
	}, [live?.mapQueue, maps]);

	useEffect(() => {
		preloadMapArt(mapArt);
	}, [mapArt]);
	const [revealedCount, setRevealedCount] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [speed, setSpeed] = useState<PlaybackSpeed>(() => rememberedSpeed ?? 1);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [announcement, setAnnouncement] = useState("Replay playing.");
	const [reducedMotion, setReducedMotion] = useState(false);
	const [timeoutMoment, setTimeoutMoment] = useState(false);
	const [timeoutHuddleArmed, setTimeoutHuddleArmed] = useState(false);
	const huddleDoneForTimeout = useRef(false);
	const [bonusMoment, setBonusMoment] = useState(false);
	const shownBonusKey = useRef<string | null>(null);
	const [mapWinMoment, setMapWinMoment] = useState<MapWinReveal | null>(null);
	const completionReported = useRef(false);
	const shownMapWin = useRef<number | null>(null);
	const awaitingNextReported = useRef(false);

	useEffect(() => {
		if (rememberedSpeed != null) {
			setSpeed(rememberedSpeed);
			return;
		}
		const stored = loadPlaybackSpeed(window.localStorage);
		rememberedSpeed = stored;
		setSpeed(stored);
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setReducedMotion(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	const seriesDone = live ? live.complete : Boolean(result);
	const cursor = resolvePlayback(maps, playbackTicks, revealedCount);
	const caughtUp = revealedCount >= playbackTicks.length;
	const complete = cursor.complete && seriesDone && (maps.length > 0 || seriesDone);
	const waitingForPlan = isWaitingForNextMap(live, caughtUp);
	const waitingForRound = Boolean(live && !live.complete && live.current && caughtUp);
	const mapOpen = Boolean(live?.current && !live.current.complete);
	const pendingTimeout = Boolean(live?.current?.pendingTimeout);
	const upcomingBonus = upcomingBonusRound(maps, playbackTicks, revealedCount);
	const holdPlayback = Boolean(
		timeoutMoment ||
			bonusMoment ||
			mapWinMoment ||
			shouldRevealTimeoutMoment(timeoutHuddleArmed, caughtUp, mapOpen) ||
			shouldHoldForCoachTimeout(pendingTimeout, caughtUp, mapOpen, huddleDoneForTimeout.current) ||
			shouldRevealBonusMoment(upcomingBonus, shownBonusKey.current),
	);

	useLayoutEffect(() => {
		if (!pendingTimeout) {
			huddleDoneForTimeout.current = false;
			return;
		}
		if (!huddleDoneForTimeout.current) setTimeoutHuddleArmed(true);
	}, [pendingTimeout]);

	useEffect(() => {
		if (
			!playing ||
			holdPlayback ||
			!live ||
			live.complete ||
			!live.current ||
			!onLiveChange ||
			!caughtUp
		) {
			return;
		}
		const played = playRound(live);
		if (played.ok) onLiveChange(played.value);
	}, [playing, holdPlayback, live, onLiveChange, caughtUp]);

	useEffect(() => {
		if (!timeoutHuddleArmed || !caughtUp) return;
		setTimeoutHuddleArmed(false);
		if (!mapOpen) return;
		setPlaying(false);
		setTimeoutMoment(true);
		setAnnouncement(`Timeout called. Morale up ${TIMEOUT_MORALE}.`);
	}, [timeoutHuddleArmed, caughtUp, mapOpen]);

	useEffect(() => {
		if (!timeoutMoment) return;
		const hold = window.setTimeout(
			() => {
				huddleDoneForTimeout.current = true;
				setTimeoutMoment(false);
				setPlaying(true);
			},
			reducedMotion ? TIMEOUT_MOMENT_REDUCED_MS : TIMEOUT_MOMENT_MS,
		);
		return () => window.clearTimeout(hold);
	}, [timeoutMoment, reducedMotion]);

	useEffect(() => {
		if (timeoutMoment || timeoutHuddleArmed || bonusMoment) return;
		if (!upcomingBonus || !shouldRevealBonusMoment(upcomingBonus, shownBonusKey.current)) return;
		shownBonusKey.current = `${upcomingBonus.mapIndex}:${upcomingBonus.round.round}`;
		setPlaying(false);
		setBonusMoment(true);
		if (upcomingBonus.round.bonus) {
			const trait = bonusById(upcomingBonus.round.bonus.bonusId);
			setAnnouncement(`${trait.name}. ${trait.blurb}`);
		}
	}, [upcomingBonus, timeoutMoment, timeoutHuddleArmed, bonusMoment]);

	useEffect(() => {
		if (!bonusMoment) return;
		const hold = window.setTimeout(
			() => {
				setBonusMoment(false);
				setPlaying(true);
			},
			reducedMotion ? BONUS_MOMENT_REDUCED_MS : BONUS_MOMENT_MS,
		);
		return () => window.clearTimeout(hold);
	}, [bonusMoment, reducedMotion]);

	const featuredPlayerClutch = cursor.inProgressRound
		? (maps[cursor.mapIndex] ?? maps[0])?.highlights.find(
				(highlight) =>
					highlight.type === "clutch-sequence" &&
					highlight.team === viewerSide &&
					highlight.round === cursor.inProgressRound?.round,
			)
		: undefined;
	const clutchMomentActive = Boolean(
		featuredPlayerClutch &&
			featuredPlayerClutch.type === "clutch-sequence" &&
			shouldShowFeaturedClutch(maps, cursor.mapIndex, featuredPlayerClutch.round) &&
			cursor.inProgressKills.length - 1 >=
				clutchMomentStartIndex(featuredPlayerClutch.startKillIndex),
	);
	const clutchSlow = Boolean(!reducedMotion && clutchMomentActive);

	useEffect(() => {
		if (!playing || complete || waitingForRound || waitingForPlan || holdPlayback) return;
		const timer = window.setInterval(
			() => {
				setRevealedCount((count) => Math.min(playbackTicks.length, count + 1));
			},
			clutchSlow ? playbackClutchTickMs(speed) : playbackTickMs(speed),
		);
		return () => window.clearInterval(timer);
	}, [
		complete,
		playbackTicks.length,
		playing,
		speed,
		waitingForPlan,
		waitingForRound,
		clutchSlow,
		holdPlayback,
	]);

	useEffect(() => {
		if ((waitingForPlan || mapWinMoment) && playing) setPlaying(false);
	}, [playing, waitingForPlan, mapWinMoment]);

	useEffect(() => {
		if (clutchMomentActive || timeoutMoment || mapWinMoment) setSettingsOpen(false);
	}, [clutchMomentActive, timeoutMoment, mapWinMoment]);

	useEffect(() => {
		if (live?.current || live?.complete) awaitingNextReported.current = false;
	}, [live?.complete, live?.current]);

	useEffect(() => {
		const win = mapWinAt(maps, playbackTicks, revealedCount, live);
		if (!win || shownMapWin.current === win.mapIndex) return;
		shownMapWin.current = win.mapIndex;
		setMapWinMoment(win);
		setPlaying(false);
		setAnnouncement(
			`${win.winner === 0 ? shortLabels[0] : shortLabels[1]} take ${win.label} ${win.score[0]}–${win.score[1]}.`,
		);
	}, [live, maps, playbackTicks, revealedCount, shortLabels]);

	useEffect(() => {
		if (!mapWinMoment) return;
		const hold = window.setTimeout(
			() => {
				setMapWinMoment(null);
				if (mapWinContinueKind(live) === "next-map" && !awaitingNextReported.current) {
					awaitingNextReported.current = true;
					onAwaitingNextMap?.();
					setAnnouncement("Starting the next map.");
				}
				if (live && !live.complete) setPlaying(true);
			},
			reducedMotion ? MAP_WIN_MOMENT_REDUCED_MS : MAP_WIN_MOMENT_MS,
		);
		return () => window.clearTimeout(hold);
	}, [live, mapWinMoment, onAwaitingNextMap, reducedMotion]);

	useEffect(() => {
		if (complete && playing) {
			setPlaying(false);
			setAnnouncement(
				`Final: ${shortLabels[0]} ${result?.score[0] ?? 0}, ${shortLabels[1]} ${result?.score[1] ?? 0}.`,
			);
		}
	}, [complete, playing, result?.score, shortLabels]);

	useEffect(() => {
		if (complete && !mapWinMoment && !completionReported.current) {
			completionReported.current = true;
			onComplete?.();
		}
	}, [complete, mapWinMoment, onComplete]);

	if (!result) return null;

	function skip() {
		setPlaying(false);
		setTimeoutMoment(false);
		setTimeoutHuddleArmed(false);
		huddleDoneForTimeout.current = true;
		setBonusMoment(false);
		setMapWinMoment(null);
		shownMapWin.current = null;
		if (live && onLiveChange && !live.complete) {
			const mapIndex = live.current?.mapIndex ?? cursor.mapIndex;
			const done = skipCurrentMap(live);
			onLiveChange(done);
			const nextTicks = buildPlaybackTicks(seriesFromLive(done).maps);
			setRevealedCount(endOfMapRevealedCount(nextTicks, mapIndex));
			setAnnouncement("Skipped to the end of the map.");
			return;
		}
		setRevealedCount(endOfMapRevealedCount(playbackTicks, cursor.mapIndex));
		setAnnouncement("Skipped to the end of the map.");
	}

	const activeMap = (maps[cursor.mapIndex] ?? maps[0]) as MapResult | undefined;
	if (!activeMap) {
		return (
			<section className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6">
				<p className="text-center text-sm text-zinc-400">Starting the match.</p>
				<div className="mt-4 flex justify-center">
					<button type="button" onClick={skip} className={CONTROL_CLASS}>
						Skip to end
					</button>
				</div>
			</section>
		);
	}

	const feed = latestRoundFeed(cursor, activeMap);
	const stats = liveLines(activeMap.rounds, cursor.settledRoundCount, cursor.inProgressKills);
	const latestKill = cursor.inProgressKills.at(-1);
	const involvedIds = new Set(
		latestKill
			? latestKill.assisterId
				? [latestKill.killerId, latestKill.victimId, latestKill.assisterId]
				: [latestKill.killerId, latestKill.victimId]
			: [],
	);
	const currentSides =
		cursor.inProgressRound?.sides ??
		activeMap.rounds[cursor.settledRoundCount - 1]?.sides ??
		activeMap.rounds[0]?.sides;
	const buys: [string, string] = feed?.round.economy
		? [feed.round.economy[0]?.buy ?? "—", feed.round.economy[1]?.buy ?? "—"]
		: ["pistol", "pistol"];
	const roundValues: [number, number] = [
		equipmentValue(feed?.round.economy[0]?.buy),
		equipmentValue(feed?.round.economy[1]?.buy),
	];
	const totals = playbackBanks(feed?.round.economy, Boolean(feed?.settled));
	const moraleFallback: readonly [number, number] = [
		initialMorale(applyGamePlan(result.teams[0], resolveGamePlan(activeMap.gamePlan))),
		initialMorale(result.teams[1]),
	];
	const morale = liveBoardMorale(
		activeMap.rounds,
		cursor.settledRoundCount,
		moraleFallback,
		live?.current?.morale,
		caughtUp,
	);
	const killIndex = cursor.inProgressKills.length - 1;
	const clutch =
		cursor.inProgressRound && killIndex >= 0
			? activeClutchSequence(activeMap.highlights, cursor.inProgressRound.round, killIndex)
			: undefined;
	const featuredClutch = cursor.inProgressRound
		? activeMap.highlights.find(
				(highlight) =>
					highlight.type === "clutch-sequence" && highlight.round === cursor.inProgressRound?.round,
			)
		: undefined;
	const remainingAfter = clutch
		? clutchEnemiesLeft(
				cursor.inProgressRound?.kills ?? [],
				clutch.startKillIndex,
				killIndex,
				clutch.team,
				clutch.against,
			)
		: 0;
	const clutchLine =
		clutch && latestKill && cursor.inProgressRound
			? clutchBeatLine({
					player: playerName(result, clutch.playerId),
					against: clutch.against,
					won: clutch.won,
					killIndex,
					startKillIndex: clutch.startKillIndex,
					remainingAfter,
					weapon: latestKill.weapon,
				})
			: "";
	const castLines = feed
		? liveCastLines({
				round: feed.round,
				kills: feed.kills,
				teamLabels: shortLabels,
				playerName: (id) => playerName(result, id),
				clutchLine: clutchLine || undefined,
			})
		: [];
	const boardDeadIds = lineupDeadIds(
		cursor.inProgressKills,
		featuredClutch && featuredClutch.type === "clutch-sequence"
			? featuredClutch.startKillIndex
			: undefined,
	);
	const momentClutch =
		featuredClutch &&
		featuredClutch.type === "clutch-sequence" &&
		featuredClutch.team === viewerSide
			? featuredClutch
			: undefined;
	const clutcher = momentClutch
		? result.teams[viewerSide].members.find((member) => member.id === momentClutch.playerId)
		: undefined;
	const momentOpponents = momentClutch
		? clutchOpponents(
				result.teams[opponent].members,
				cursor.inProgressRound?.kills ?? [],
				momentClutch.startKillIndex,
				cursor.inProgressKills.length,
			)
		: [];
	const momentLines =
		momentClutch && clutcher
			? clutchMomentLines({
					player: clutcher.nick,
					playerId: clutcher.id,
					clutchTeam: viewerSide,
					against: momentClutch.against,
					won: momentClutch.won,
					startKillIndex: momentClutch.startKillIndex,
					kills: cursor.inProgressRound?.kills ?? [],
					revealedCount: cursor.inProgressKills.length,
					nameOf: (id) => playerName(result, id),
				})
			: [];
	const showClutchMoment = Boolean(clutchMomentActive && clutcher && momentClutch);

	function dismissTimeoutMoment() {
		huddleDoneForTimeout.current = true;
		setTimeoutMoment(false);
		setPlaying(true);
	}

	function dismissMapWinMoment() {
		setMapWinMoment(null);
		const kind = mapWinContinueKind(live);
		if (kind === "next-map" && !awaitingNextReported.current) {
			awaitingNextReported.current = true;
			onAwaitingNextMap?.();
			setAnnouncement("Starting the next map.");
			setPlaying(true);
			return;
		}
		if (kind === "next-match") {
			onContinueMatch?.();
		}
	}

	function playPause() {
		if (complete || holdPlayback) return;
		setPlaying((value) => !value);
		setAnnouncement(playing ? "Replay paused." : "Replay playing.");
	}

	function chooseSpeed(option: PlaybackSpeed) {
		rememberedSpeed = option;
		setSpeed(option);
		savePlaybackSpeed(window.localStorage, option);
		setAnnouncement(`Replay speed ${option}×.`);
	}

	function restart() {
		setPlaying(true);
		setMapWinMoment(null);
		shownMapWin.current = null;
		shownBonusKey.current = null;
		setBonusMoment(false);
		setRevealedCount(0);
		setAnnouncement("Replay restarted.");
	}

	const headingEyebrow = eyebrow ?? `${result.format} match`;
	const background =
		getMap(activeMap.mapContext?.mapId ?? "")?.background ?? activeMap.mapContext?.background;
	const roundWinner = settleWinner(maps, playbackTicks, revealedCount);
	const settleSide =
		roundWinner === undefined
			? undefined
			: viewOf(roundWinner, viewerSide) === 0
				? "player"
				: "opponent";
	const displayScore = pairFromViewer(cursor.score, viewerSide);
	const displaySeries = pairFromViewer(cursor.seriesScore, viewerSide);
	const displayMorale = pairFromViewer(morale, viewerSide);
	const displayRoundValues = pairFromViewer(roundValues, viewerSide);
	const displayTotals = pairFromViewer(totals, viewerSide);
	const displayBuys = pairFromViewer(buys, viewerSide);
	const timeoutTeam = live?.current?.pendingTimeoutTeam ?? 0;
	const mapWinMap = mapWinMoment ? maps[mapWinMoment.mapIndex] : undefined;
	const mapWinBoard = mapWinMoment
		? complete
			? {
					teams: pairFromViewer(aggregateSeriesScoreboard(result.maps), viewerSide),
					roundsWon: pairFromViewer(seriesRoundsWon(result.maps), viewerSide),
				}
			: mapWinMap
				? {
						teams: pairFromViewer(mapWinMap.scoreboard, viewerSide),
						roundsWon: pairFromViewer(mapWinMap.score, viewerSide),
					}
				: null
		: null;
	const mapWinKind = mapWinContinueKind(live);
	const showContinueMatch = Boolean(complete && !mapWinMoment && onContinueMatch);

	return (
		<div className="mt-5 space-y-4">
			<section
				aria-labelledby="match-heading"
				className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 p-4 max-lg:pb-32 sm:p-6 sm:max-lg:pb-32"
				style={
					background
						? {
								backgroundImage: `linear-gradient(to bottom, rgb(9 9 11 / 0.58), rgb(9 9 11 / 0.84)), url(${background})`,
								backgroundSize: "cover",
								backgroundPosition: "center",
							}
						: undefined
				}
			>
				{showContinueMatch ? (
					<div className="absolute top-4 right-4 z-30 sm:top-6 sm:right-6">
						<button type="button" onClick={onContinueMatch} className={CONTINUE_MATCH_CLASS}>
							{continueLabel}
						</button>
					</div>
				) : null}
				{mapWinMoment ? (
					<MapWinMoment
						playerWon={mapWinMoment.winner === viewerSide}
						winnerLabel={shortLabels[mapWinMoment.winner]}
						mapLabel={mapWinMoment.label}
						score={pairFromViewer(mapWinMoment.score, viewerSide)}
						seriesScore={displaySeries}
						scoreboard={
							mapWinBoard ? (
								<Scoreboard
									teams={mapWinBoard.teams}
									teamLabels={viewLabels}
									roundsWon={mapWinBoard.roundsWon}
									traitsByPlayer={playerTraits}
								/>
							) : null
						}
						footer={
							<button type="button" onClick={dismissMapWinMoment} className={CONTINUE_MATCH_CLASS}>
								{mapWinKind === "next-match" ? continueLabel : "Continue"}
							</button>
						}
					/>
				) : null}

				{timeoutMoment && live?.current ? (
					<TimeoutMoment
						teamLabel={shortLabels[timeoutTeam]}
						coachNick={result.teams[timeoutTeam].coach.nick}
						members={result.teams[timeoutTeam].members}
						crestFor={(member) => crestFor(member, playersById)}
						moraleGain={TIMEOUT_MORALE}
						footer={
							<button type="button" onClick={dismissTimeoutMoment} className={CONTROL_CLASS}>
								Continue
							</button>
						}
					/>
				) : null}

				{bonusMoment && upcomingBonus?.round.bonus ? (
					<BonusMoment
						trait={bonusById(upcomingBonus.round.bonus.bonusId)}
						player={crestFor(
							result.teams
								.flatMap((team) => team.members)
								.find((member) => member.id === upcomingBonus.round.bonus?.seasonId) ??
								result.teams[viewerSide].members[0],
							playersById,
						)}
					/>
				) : null}

				{showClutchMoment && clutcher && momentClutch ? (
					<ClutchMoment
						player={clutcher.nick}
						playerCrest={crestFor(clutcher, playersById)}
						opponents={momentOpponents.map((row) => ({
							...row,
							crest: crestFor(row.member, playersById),
						}))}
						against={momentClutch.against}
						lines={momentLines}
						speed={speed}
						footer={
							<fieldset className="hidden flex-wrap justify-center gap-2 lg:flex">
								<legend className="sr-only">Clutch replay controls</legend>
								<button
									type="button"
									onClick={playPause}
									disabled={complete || waitingForPlan || holdPlayback}
									className={CONTROL_CLASS}
								>
									{playing ? "Pause" : "Play"}
								</button>
								<button type="button" onClick={skip} disabled={complete} className={CONTROL_CLASS}>
									Skip to end
								</button>
							</fieldset>
						}
					/>
				) : null}

				<div
					className={`relative z-20 text-center ${showContinueMatch ? "max-sm:pt-14 sm:px-28" : ""}`}
				>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						{headingEyebrow}
					</p>
					<h3 id="match-heading" className="mt-1 text-xl font-semibold tracking-tight text-white">
						{viewLabels[0]} <span className="text-zinc-600">vs</span> {viewLabels[1]}
					</h3>
					<p className="mt-1 text-xs text-zinc-500">
						Series {displaySeries[0]}–{displaySeries[1]} · {activeMap.label}
						{mapPickCaption(activeMap.mapContext, viewerSide, simLabels)}
						{activeMap.overtimeBlocks > 0 ? ` · ${activeMap.overtimeBlocks}× OT` : ""}
					</p>
				</div>

				<div className="mt-5 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(15rem,18rem)]">
					<div className="hidden lg:block">
						<TeamLineup
							align="left"
							label={viewLabels[0]}
							members={result.teams[viewerSide].members}
							coachNick={result.teams[viewerSide].coach.nick}
							overall={result.teams[viewerSide].overall}
							side={currentSides?.[viewerSide]}
							stats={stats}
							involvedIds={involvedIds}
							deadIds={boardDeadIds}
							playersById={playersById}
						/>
					</div>

					<div className="relative min-w-0 max-lg:col-span-full">
						<section
							className="flex items-center justify-center gap-4"
							aria-label="Current map score"
							data-round-winner={settleSide}
						>
							<span
								key={settleSide === "player" ? `player-${revealedCount}` : "player"}
								className={`relative inline-flex items-center justify-center ${
									settleSide === "player" ? "round-score-pulse" : ""
								}`}
							>
								{settleSide === "player" ? (
									<span
										aria-hidden
										className="round-score-pulse-ring round-score-pulse-ring-player"
									/>
								) : null}
								<strong className="relative text-4xl tabular-nums text-emerald-300 sm:text-6xl">
									{displayScore[0]}
								</strong>
							</span>
							<span className="text-2xl text-zinc-700">:</span>
							<span
								key={settleSide === "opponent" ? `opponent-${revealedCount}` : "opponent"}
								className={`relative inline-flex items-center justify-center ${
									settleSide === "opponent" ? "round-score-pulse" : ""
								}`}
							>
								{settleSide === "opponent" ? (
									<span
										aria-hidden
										className="round-score-pulse-ring round-score-pulse-ring-opponent"
									/>
								) : null}
								<strong className="relative text-4xl tabular-nums text-amber-300 sm:text-6xl">
									{displayScore[1]}
								</strong>
							</span>
						</section>

						<CompactMatchLineups
							leftLabel={viewLabels[0]}
							rightLabel={viewLabels[1]}
							leftMembers={result.teams[viewerSide].members}
							rightMembers={result.teams[opponent].members}
							stats={stats}
							deadIds={boardDeadIds}
							involvedIds={involvedIds}
							playersById={playersById}
						/>

						<RoundTimeline
							map={activeMap}
							revealed={cursor.settledRoundCount}
							teamLabels={shortLabels}
						/>

						<div className="flex flex-col">
							<div className="order-2 lg:order-1">
								<EconomyBars
									roundValues={displayRoundValues}
									totals={displayTotals}
									buys={displayBuys}
									labels={viewLabels}
								/>
								<MoraleBars
									values={displayMorale}
									labels={viewLabels}
									boosted={timeoutBoostVisible(
										caughtUp,
										Boolean(live?.current?.pendingTimeout && timeoutTeam === viewerSide),
										timeoutMoment && timeoutTeam === viewerSide,
									)}
								/>

								<fieldset className="mt-5 hidden flex-wrap items-start justify-center gap-2 lg:flex">
									<legend className="sr-only">Replay controls</legend>
									<button
										type="button"
										onClick={playPause}
										disabled={complete || waitingForPlan || holdPlayback}
										className={CONTROL_CLASS}
									>
										{playing ? "Pause" : "Play"}
									</button>
									<button
										type="button"
										onClick={skip}
										disabled={complete}
										className={CONTROL_CLASS}
									>
										Skip to end
									</button>
									<div className="relative">
										<button
											type="button"
											aria-expanded={settingsOpen}
											aria-controls="playback-settings"
											onClick={() => setSettingsOpen((open) => !open)}
											className={CONTROL_CLASS}
										>
											Settings · {speed}×
										</button>
										{settingsOpen ? (
											<div
												id="playback-settings"
												className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-white/15 bg-zinc-950/95 p-2 shadow-xl"
											>
												<button
													type="button"
													onClick={restart}
													disabled={revealedCount === 0}
													className={`${CONTROL_CLASS} w-full`}
												>
													Restart replay
												</button>
												<fieldset className="mt-2 flex gap-1.5">
													<legend className="sr-only">Replay speed</legend>
													{PLAYBACK_SPEEDS.map((option) => {
														const selected = option === speed;
														return (
															<button
																key={option}
																type="button"
																aria-pressed={selected}
																onClick={() => chooseSpeed(option)}
																className={`${SPEED_BUTTON_CLASS} ${
																	selected
																		? "border-emerald-300 bg-emerald-300 text-zinc-950"
																		: "border-white/15 bg-white/5 text-zinc-200 hover:border-white/30 hover:bg-white/10"
																}`}
															>
																{option}×
															</button>
														);
													})}
												</fieldset>
											</div>
										) : null}
									</div>
								</fieldset>
							</div>
							<div className="order-1 mt-4 lg:order-2 lg:mt-5">
								<h4 className="text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
									Play-by-play
								</h4>
								<div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(13rem,16rem)]">
									{feed ? (
										<ol>
											<RoundFeedItem
												key={feed.round.round}
												round={feed.round}
												kills={feed.kills}
												settled={feed.settled}
												result={result}
												shortLabels={shortLabels}
												viewerSide={viewerSide}
												castLine={castLines.at(-1)}
											/>
										</ol>
									) : (
										<div
											className={`${FEED_BOX_CLASS} items-center justify-center rounded-xl border border-white/12 bg-zinc-950/70 px-3 py-2.5`}
										>
											<p className="text-center text-sm text-zinc-600">Replay starting.</p>
										</div>
									)}
									<div className="hidden lg:block">
										<RoundCast lines={castLines} />
									</div>
								</div>
							</div>
						</div>
						<p className="sr-only" aria-live="polite" aria-atomic="true">
							{announcement}
						</p>
					</div>

					<div className="hidden lg:block">
						<TeamLineup
							align="right"
							label={viewLabels[1]}
							members={result.teams[opponent].members}
							coachNick={result.teams[opponent].coach.nick}
							overall={result.teams[opponent].overall}
							org={viewerSide === 0 ? opponentOrg : undefined}
							side={currentSides?.[opponent]}
							stats={stats}
							involvedIds={involvedIds}
							deadIds={boardDeadIds}
							playersById={playersById}
						/>
					</div>
				</div>
				<fieldset className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t border-white/12 bg-zinc-950/95 px-3 py-2 pb-[max(0.5rem,var(--safe-bottom))] backdrop-blur-xl lg:hidden">
					<legend className="sr-only">Replay controls</legend>
					<button
						type="button"
						onClick={playPause}
						disabled={complete || waitingForPlan || holdPlayback}
						className={`${CONTROL_CLASS} flex-1`}
					>
						{playing ? "Pause" : "Play"}
					</button>
					<button
						type="button"
						onClick={skip}
						disabled={complete}
						className={`${CONTROL_CLASS} flex-1`}
					>
						Skip to end
					</button>
					<div className="relative">
						<button
							type="button"
							aria-expanded={settingsOpen}
							aria-controls="playback-settings-mobile"
							onClick={() => setSettingsOpen((open) => !open)}
							className={CONTROL_CLASS}
						>
							{speed}×
						</button>
						{settingsOpen ? (
							<div
								id="playback-settings-mobile"
								className="absolute right-0 bottom-full z-20 mb-2 w-52 rounded-xl border border-white/15 bg-zinc-950/95 p-2 shadow-xl"
							>
								<button
									type="button"
									onClick={restart}
									disabled={revealedCount === 0}
									className={`${CONTROL_CLASS} w-full`}
								>
									Restart replay
								</button>
								<fieldset className="mt-2 flex gap-1.5">
									<legend className="sr-only">Replay speed</legend>
									{PLAYBACK_SPEEDS.map((option) => {
										const selected = option === speed;
										return (
											<button
												key={option}
												type="button"
												aria-pressed={selected}
												onClick={() => chooseSpeed(option)}
												className={`${SPEED_BUTTON_CLASS} ${
													selected
														? "border-emerald-300 bg-emerald-300 text-zinc-950"
														: "border-white/15 bg-white/5 text-zinc-200 hover:border-white/30 hover:bg-white/10"
												}`}
											>
												{option}×
											</button>
										);
									})}
								</fieldset>
							</div>
						) : null}
					</div>
				</fieldset>
			</section>
			{complete && !mapWinMoment ? (
				<section
					aria-label="Series scoreboard"
					className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6"
				>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Final result
					</p>
					<h4 className="mt-1 text-2xl font-semibold text-white">
						{viewLabels[viewOf(result.winner, viewerSide)]} win{" "}
						{pairFromViewer(result.score, viewerSide).join("–")}
					</h4>
					{result.maps.length > 1 ? (
						<p className="mt-1 text-sm text-zinc-500">
							{result.maps
								.map((map) => `${map.label} ${pairFromViewer(map.score, viewerSide).join("–")}`)
								.join(" · ")}
						</p>
					) : null}
					<div className="mt-5">
						<Scoreboard
							teams={pairFromViewer(aggregateSeriesScoreboard(result.maps), viewerSide)}
							teamLabels={viewLabels}
							roundsWon={pairFromViewer(seriesRoundsWon(result.maps), viewerSide)}
							traitsByPlayer={playerTraits}
						/>
					</div>
				</section>
			) : null}
		</div>
	);
}
