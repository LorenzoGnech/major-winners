import { useEffect, useMemo, useRef, useState } from "react";
import type { Org, PlayerSeason, Role } from "../data";
import {
	applyGamePlan,
	canQueueTimeout,
	equipmentValue,
	formatRoundSummary,
	gamePlanById,
	getMap,
	type HighlightEvent,
	initialMorale,
	type KillEvent,
	type LiveSeriesState,
	type MapResult,
	type PlayerMapStats,
	playbackBanks,
	playRound,
	queueTimeout,
	type RoundResult,
	type RoundSummary,
	resolveGamePlan,
	resolveRoundSummary,
	type SeriesResult,
	type Side,
	scoreboardRating,
	seriesFromLive,
	shouldShowFeaturedClutch,
	skipRemaining,
	type TeamMemberProfile,
	TIMEOUT_MORALE,
} from "../engine";
import { ClutchMoment } from "./ClutchMoment";
import {
	activeClutchSequence,
	clutchBeatLine,
	clutchEnemiesLeft,
	clutchMomentLines,
	clutchMomentStartIndex,
	clutchOpponents,
} from "./clutchNarrative";
import { OrgCrest } from "./OrgCrest";
import { PlayerCrest } from "./PlayerCrest";
import { lineupDeadIds, liveCastLines } from "./roundCast";
import { TimeoutMoment } from "./TimeoutMoment";
import { WeaponIcon } from "./WeaponIcon";

type MatchPlaybackProps = {
	result?: SeriesResult;
	live?: LiveSeriesState;
	onLiveChange?: (live: LiveSeriesState) => void;
	teamLabels: readonly [string, string];
	opponentOrg?: Pick<Org, "id" | "name" | "logo">;
	playersById?: ReadonlyMap<string, PlayerSeason>;
	eyebrow?: string;
	onComplete?: () => void;
};

type LiveLine = {
	kills: number;
	deaths: number;
	assists: number;
};

const CONTROL_CLASS =
	"rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-white/30 enabled:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40";

const TEAM_TEXT = ["text-emerald-300", "text-amber-300"] as const;
const FEED_BOX_CLASS = "flex h-44 flex-col overflow-hidden";

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

export function playbackTickMs(speed: PlaybackSpeed): number {
	return PLAYBACK_TICK_MS / speed;
}

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

export const TIMEOUT_MOMENT_MS = 2_200;
export const TIMEOUT_MOMENT_REDUCED_MS = 400;

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

function playerName(result: SeriesResult, playerId: string): string {
	for (const team of result.teams) {
		const player = team.members.find((member) => member.id === playerId);
		if (player) return player.nick;
	}
	return playerId;
}

function KillFeedLine({ kill, result }: { kill: KillEvent; result: SeriesResult }) {
	const killer = playerName(result, kill.killerId);
	const victim = playerName(result, kill.victimId);
	const assist = kill.assisterId ? playerName(result, kill.assisterId) : null;
	return (
		<span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-zinc-300">
			<span className={`font-medium ${TEAM_TEXT[kill.killerTeam]}`}>{killer}</span>
			{assist ? (
				<span className={`text-[0.95em] ${TEAM_TEXT[kill.killerTeam]} opacity-70`}>+ {assist}</span>
			) : null}
			<WeaponIcon weapon={kill.weapon} className={TEAM_TEXT[kill.killerTeam]} />
			<span className={TEAM_TEXT[kill.victimTeam]}>{victim}</span>
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
			className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-3"
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
}: {
	teams: readonly [readonly PlayerMapStats[], readonly PlayerMapStats[]];
	teamLabels: readonly [string, string];
	roundsWon: readonly [number, number];
}) {
	return (
		<div className="mt-5 space-y-4">
			{teams.map((teamRows, teamIndex) => (
				<div key={teamLabels[teamIndex]}>
					<div className="mb-2 flex items-baseline justify-between gap-3">
						<h4 className="text-sm font-semibold text-zinc-100">{teamLabels[teamIndex]}</h4>
						<span className="text-xs tabular-nums text-zinc-500">
							{roundsWon[teamIndex]} rounds
						</span>
					</div>
					<div className="overflow-x-auto rounded-xl border border-white/10">
						<table className="w-full min-w-lg text-left text-xs">
							<thead className="bg-white/5 text-[10px] uppercase tracking-wider text-zinc-500">
								<tr>
									<th className="px-3 py-2 font-semibold">Player</th>
									<th className="px-2 py-2 text-right font-semibold">K-D-A</th>
									<th className="px-2 py-2 text-right font-semibold">ADR</th>
									<th className="px-2 py-2 text-right font-semibold">KAST</th>
									<th className="px-3 py-2 text-right font-semibold">Rating</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/8">
								{teamRows
									.toSorted((left, right) => right.rating - left.rating)
									.map((player) => (
										<tr key={player.playerId} className="bg-black/15 text-zinc-300">
											<th className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-100">
												{player.nick}
											</th>
											<td className="px-2 py-2 text-right tabular-nums">
												{player.kills}-{player.deaths}-{player.assists}
											</td>
											<td className="px-2 py-2 text-right tabular-nums">{player.adr}</td>
											<td className="px-2 py-2 text-right tabular-nums">{player.kast}%</td>
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
							} ${dead ? "opacity-40 grayscale" : hot ? "bg-white/8 ring-1 ring-white/15" : ""}`}
						>
							<PlayerCrest player={crestFor(member, playersById)} size="md" />
							<div className={`min-w-0 flex-1 ${isRight ? "text-right" : ""}`}>
								<p className="truncate text-sm font-semibold text-zinc-100">{member.nick}</p>
								<p className="text-[10px] uppercase tracking-wider text-zinc-500">
									{ROLE_LABELS[member.slot]}
								</p>
							</div>
							<span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-300">
								{line.kills}-{line.deaths}
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

function resolvedSummary(round: RoundResult): RoundSummary {
	return resolveRoundSummary(round);
}

function RoundFeedItem({
	round,
	kills,
	settled,
	result,
	shortLabels,
}: {
	round: RoundResult;
	kills: readonly KillEvent[];
	settled: boolean;
	result: SeriesResult;
	shortLabels: readonly [string, string];
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
			<ul className="feed-stack-fade mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-hidden">
				{[...kills].toReversed().map((kill) => (
					<li
						key={`${round.round}-${kill.killerId}-${kill.victimId}-${kill.assisterId ?? "none"}`}
						aria-label={`${playerName(result, kill.killerId)} killed ${playerName(result, kill.victimId)}`}
						className="feed-stack-in"
					>
						<div className="feed-stack-in-inner">
							<KillFeedLine kill={kill} result={result} />
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
	leftCaption: string;
	rightCaption: string;
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
				leftCaption={`${labels[0]} · ${buyLabel(buys[0])} · $${roundValues[0].toLocaleString()}`}
				rightCaption={`$${roundValues[1].toLocaleString()} · ${buyLabel(buys[1])} · ${labels[1]}`}
			/>
			<CompareBar
				label="Bank"
				left={totals[0]}
				right={totals[1]}
				leftCaption={`${labels[0]} · $${totals[0].toLocaleString()}`}
				rightCaption={`$${totals[1].toLocaleString()} · ${labels[1]}`}
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
					{label}
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
	opponentOrg,
	playersById,
	eyebrow,
	onComplete,
}: MatchPlaybackProps) {
	const result = live ? seriesFromLive(live) : completedResult;
	const shortLabels = [teamLabels[0], opponentOrg?.name ?? teamLabels[1]] as const;
	const maps = result?.maps ?? [];
	const playbackTicks = useMemo(() => buildPlaybackTicks(maps), [maps]);
	const [revealedCount, setRevealedCount] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState<PlaybackSpeed>(1);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [announcement, setAnnouncement] = useState("Replay ready.");
	const [reducedMotion, setReducedMotion] = useState(false);
	const [timeoutMoment, setTimeoutMoment] = useState(false);
	const completionReported = useRef(false);

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
	const waitingForPlan = Boolean(live && !live.complete && !live.current);
	const waitingForRound = Boolean(live && !live.complete && live.current && caughtUp);

	useEffect(() => {
		if (
			!playing ||
			timeoutMoment ||
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
	}, [playing, timeoutMoment, live, onLiveChange, caughtUp]);

	useEffect(() => {
		if (!timeoutMoment) return;
		const hold = window.setTimeout(
			() => setTimeoutMoment(false),
			reducedMotion ? TIMEOUT_MOMENT_REDUCED_MS : TIMEOUT_MOMENT_MS,
		);
		return () => window.clearTimeout(hold);
	}, [timeoutMoment, reducedMotion]);

	const featuredPlayerClutch = cursor.inProgressRound
		? (maps[cursor.mapIndex] ?? maps[0])?.highlights.find(
				(highlight) =>
					highlight.type === "clutch-sequence" &&
					highlight.team === 0 &&
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
		if (!playing || complete || waitingForRound || waitingForPlan) return;
		const timer = window.setInterval(
			() => {
				setRevealedCount((count) => Math.min(playbackTicks.length, count + 1));
			},
			clutchSlow ? 1_400 : playbackTickMs(speed),
		);
		return () => window.clearInterval(timer);
	}, [complete, playbackTicks.length, playing, speed, waitingForPlan, waitingForRound, clutchSlow]);

	useEffect(() => {
		if (waitingForPlan && playing) {
			setPlaying(false);
			setAnnouncement("Pick a game plan for the next map.");
		}
	}, [playing, waitingForPlan]);

	useEffect(() => {
		if (clutchMomentActive || timeoutMoment) setSettingsOpen(false);
	}, [clutchMomentActive, timeoutMoment]);

	useEffect(() => {
		if (complete && playing) {
			setPlaying(false);
			setAnnouncement(
				`Final: ${shortLabels[0]} ${result?.score[0] ?? 0}, ${shortLabels[1]} ${result?.score[1] ?? 0}.`,
			);
		}
	}, [complete, playing, result?.score, shortLabels]);

	useEffect(() => {
		if (complete && !completionReported.current) {
			completionReported.current = true;
			onComplete?.();
		}
	}, [complete, onComplete]);

	if (!result) return null;

	const activeMap = (maps[cursor.mapIndex] ?? maps[0]) as MapResult | undefined;
	if (!activeMap) {
		return (
			<section className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6">
				<p className="text-center text-sm text-zinc-400">Press play to start the match.</p>
				<div className="mt-4 flex justify-center">
					<button type="button" onClick={() => setPlaying(true)} className={CONTROL_CLASS}>
						Play
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
		featuredClutch && featuredClutch.type === "clutch-sequence" && featuredClutch.team === 0
			? featuredClutch
			: undefined;
	const clutcher = momentClutch
		? result.teams[0].members.find((member) => member.id === momentClutch.playerId)
		: undefined;
	const momentOpponents = momentClutch
		? clutchOpponents(
				result.teams[1].members,
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
					clutchTeam: 0,
					against: momentClutch.against,
					won: momentClutch.won,
					startKillIndex: momentClutch.startKillIndex,
					kills: cursor.inProgressRound?.kills ?? [],
					revealedCount: cursor.inProgressKills.length,
					nameOf: (id) => playerName(result, id),
				})
			: [];
	const showClutchMoment = Boolean(clutchMomentActive && clutcher && momentClutch);

	function announceTick(tick: PlaybackTick | undefined) {
		if (!tick) {
			setAnnouncement("Final result revealed.");
			return;
		}
		if (tick.kind === "kill") {
			const kill = maps[tick.mapIndex]?.rounds[tick.roundIndex]?.kills[tick.killIndex];
			if (kill) {
				setAnnouncement(
					`${playerName(result as SeriesResult, kill.killerId)} killed ${playerName(result as SeriesResult, kill.victimId)}.`,
				);
				return;
			}
		}
		const round = maps[tick.mapIndex]?.rounds[tick.roundIndex];
		if (round) {
			const summary = formatRoundSummary(resolvedSummary(round), shortLabels, (id) =>
				playerName(result as SeriesResult, id),
			);
			setAnnouncement(
				`Round ${round.round}: ${summary} ${round.scoreAfter[0]}–${round.scoreAfter[1]}.`,
			);
			return;
		}
		setAnnouncement("Replay advanced.");
	}

	function dismissTimeoutMoment() {
		setTimeoutMoment(false);
	}

	function playPause() {
		if (complete || timeoutMoment) return;
		setPlaying((value) => !value);
		setAnnouncement(playing ? "Replay paused." : "Replay playing.");
	}

	function step() {
		setPlaying(false);
		if (live && onLiveChange && !live.complete && live.current && caughtUp) {
			const played = playRound(live);
			if (played.ok) {
				onLiveChange(played.value);
				setRevealedCount((count) => count + 1);
			}
			return;
		}
		const next = playbackTicks[revealedCount];
		setRevealedCount((count) => Math.min(playbackTicks.length, count + 1));
		announceTick(next);
	}

	function skip() {
		setPlaying(false);
		setTimeoutMoment(false);
		if (live && onLiveChange && !live.complete) {
			const done = skipRemaining(live);
			onLiveChange(done);
			setRevealedCount(buildPlaybackTicks(done.maps).length);
			setAnnouncement("Skipped to the final result.");
			return;
		}
		setRevealedCount(playbackTicks.length);
		setAnnouncement("Skipped to the final result.");
	}

	function restart() {
		setPlaying(false);
		setRevealedCount(0);
		setAnnouncement("Replay restarted.");
	}

	function timeout() {
		if (!live || !onLiveChange) return;
		setPlaying(false);
		setSettingsOpen(false);
		const queued = queueTimeout(live);
		if (queued.ok) {
			onLiveChange(queued.value);
			setTimeoutMoment(true);
			setAnnouncement(`Timeout called. Morale up ${TIMEOUT_MORALE}.`);
			return;
		}
		setAnnouncement(queued.error.message);
	}

	const headingEyebrow = eyebrow ?? `${result.format} match`;
	const background =
		getMap(activeMap.mapContext?.mapId ?? "")?.background ?? activeMap.mapContext?.background;
	const roundWinner = settleWinner(maps, playbackTicks, revealedCount);
	const settleSide = roundWinner === 0 ? "player" : roundWinner === 1 ? "opponent" : undefined;

	return (
		<section
			aria-labelledby="match-heading"
			className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6"
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
			{timeoutMoment && live?.current ? (
				<TimeoutMoment
					teamLabel={shortLabels[0]}
					coachNick={result.teams[0].coach.nick}
					members={result.teams[0].members}
					crestFor={(member) => crestFor(member, playersById)}
					moraleGain={TIMEOUT_MORALE}
					footer={
						<button type="button" onClick={dismissTimeoutMoment} className={CONTROL_CLASS}>
							Continue
						</button>
					}
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
					footer={
						<fieldset className="flex flex-wrap justify-center gap-2">
							<legend className="sr-only">Clutch replay controls</legend>
							<button
								type="button"
								onClick={playPause}
								disabled={complete || waitingForPlan}
								className={CONTROL_CLASS}
							>
								{playing ? "Pause" : "Play"}
							</button>
							<button
								type="button"
								onClick={step}
								disabled={complete || waitingForPlan}
								className={CONTROL_CLASS}
							>
								Next
							</button>
						</fieldset>
					}
				/>
			) : null}

			<div className="relative z-20 text-center">
				<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
					{headingEyebrow}
				</p>
				<h3 id="match-heading" className="mt-1 text-xl font-semibold tracking-tight text-white">
					{shortLabels[0]} <span className="text-zinc-600">vs</span> {shortLabels[1]}
				</h3>
				<p className="mt-1 text-xs text-zinc-500">
					Series {cursor.seriesScore[0]}–{cursor.seriesScore[1]} · {activeMap.label}
					{activeMap.mapContext?.homePick ? " · home pick" : ""}
					{activeMap.gamePlan ? ` · ${gamePlanById(activeMap.gamePlan).label}` : ""}
					{activeMap.overtimeBlocks > 0 ? ` · ${activeMap.overtimeBlocks}× OT` : ""}
				</p>
			</div>

			<div className="mt-5 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(15rem,18rem)]">
				<div className="max-lg:order-2">
					<TeamLineup
						align="left"
						label={teamLabels[0]}
						members={result.teams[0].members}
						coachNick={result.teams[0].coach.nick}
						overall={result.teams[0].overall}
						side={currentSides?.[0]}
						stats={stats}
						involvedIds={involvedIds}
						deadIds={boardDeadIds}
						playersById={playersById}
					/>
				</div>

				<div className="relative min-w-0 max-lg:order-1 max-lg:col-span-full">
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
							<strong className="relative text-5xl tabular-nums text-emerald-300 sm:text-6xl">
								{cursor.score[0]}
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
							<strong className="relative text-5xl tabular-nums text-amber-300 sm:text-6xl">
								{cursor.score[1]}
							</strong>
						</span>
					</section>

					<RoundTimeline
						map={activeMap}
						revealed={cursor.settledRoundCount}
						teamLabels={shortLabels}
					/>

					<EconomyBars roundValues={roundValues} totals={totals} buys={buys} labels={shortLabels} />
					<MoraleBars
						values={morale}
						labels={shortLabels}
						boosted={Boolean(timeoutMoment || live?.current?.pendingTimeout)}
					/>

					<fieldset className="mt-5 flex flex-wrap items-start justify-center gap-2">
						<legend className="sr-only">Replay controls</legend>
						<button
							type="button"
							onClick={playPause}
							disabled={complete || waitingForPlan || timeoutMoment}
							className={CONTROL_CLASS}
						>
							{playing ? "Pause" : "Play"}
						</button>
						<button
							type="button"
							onClick={step}
							disabled={complete || waitingForPlan || timeoutMoment}
							className={CONTROL_CLASS}
						>
							Next
						</button>
						{live ? (
							<button
								type="button"
								onClick={timeout}
								disabled={!canQueueTimeout(live) || timeoutMoment}
								className={CONTROL_CLASS}
							>
								{live.current?.pendingTimeout
									? "Timeout called"
									: `Timeout (${live.current?.timeoutsRemaining ?? 0})`}
							</button>
						) : null}
						<div className="relative">
							<button
								type="button"
								aria-expanded={settingsOpen}
								aria-controls="playback-settings"
								onClick={() => setSettingsOpen((open) => !open)}
								className={CONTROL_CLASS}
							>
								Settings
							</button>
							{settingsOpen ? (
								<div
									id="playback-settings"
									className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-white/15 bg-zinc-950/95 p-2 shadow-xl"
								>
									<button
										type="button"
										onClick={skip}
										disabled={complete}
										className={`${CONTROL_CLASS} w-full`}
									>
										Skip to result
									</button>
									<button
										type="button"
										onClick={restart}
										disabled={revealedCount === 0}
										className={`${CONTROL_CLASS} mt-1.5 w-full`}
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
													onClick={() => {
														setSpeed(option);
														setAnnouncement(`Replay speed ${option}×.`);
													}}
													className={`${CONTROL_CLASS} min-w-11 flex-1 ${
														selected
															? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100"
															: ""
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
					<p className="sr-only" aria-live="polite" aria-atomic="true">
						{announcement}
					</p>

					<div className="mt-5">
						<h4 className="text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
							Play-by-play
						</h4>
						<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(13rem,16rem)]">
							{feed ? (
								<ol>
									<RoundFeedItem
										key={feed.round.round}
										round={feed.round}
										kills={feed.kills}
										settled={feed.settled}
										result={result}
										shortLabels={shortLabels}
									/>
								</ol>
							) : (
								<div
									className={`${FEED_BOX_CLASS} items-center justify-center rounded-xl border border-white/12 bg-zinc-950/70 px-3 py-2.5`}
								>
									<p className="text-center text-sm text-zinc-600">
										Press play, step forward, or skip to the result.
									</p>
								</div>
							)}
							<RoundCast lines={castLines} />
						</div>
					</div>
				</div>

				<div className="max-lg:order-3">
					<TeamLineup
						align="right"
						label={teamLabels[1]}
						members={result.teams[1].members}
						coachNick={result.teams[1].coach.nick}
						overall={result.teams[1].overall}
						org={opponentOrg}
						side={currentSides?.[1]}
						stats={stats}
						involvedIds={involvedIds}
						deadIds={boardDeadIds}
						playersById={playersById}
					/>
				</div>
			</div>

			{complete && (
				<div className="mt-6 border-t border-white/10 pt-5">
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Final result
					</p>
					<h4 className="mt-1 text-2xl font-semibold text-white">
						{shortLabels[result.winner]} win {result.score[0]}–{result.score[1]}
					</h4>
					{result.maps.length > 1 ? (
						<p className="mt-1 text-sm text-zinc-500">
							{result.maps.map((map) => `${map.label} ${map.score[0]}–${map.score[1]}`).join(" · ")}
						</p>
					) : null}
					<section aria-label="Series scoreboard">
						<Scoreboard
							teams={aggregateSeriesScoreboard(result.maps)}
							teamLabels={shortLabels}
							roundsWon={seriesRoundsWon(result.maps)}
						/>
					</section>
				</div>
			)}
		</section>
	);
}
