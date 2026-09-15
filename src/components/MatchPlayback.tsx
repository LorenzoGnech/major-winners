import { useEffect, useMemo, useState } from "react";
import type { HighlightEvent, MapResult, RoundResult, SeriesResult } from "../engine";

type MatchPlaybackProps = {
	result: SeriesResult;
	teamLabels: readonly [string, string];
};

const CONTROL_CLASS =
	"rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-white/30 enabled:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40";

function playerName(result: SeriesResult, playerId: string): string {
	for (const team of result.teams) {
		const player = team.members.find((member) => member.id === playerId);
		if (player) return player.nick;
	}
	return playerId;
}

function highlightText(
	highlight: HighlightEvent,
	result: SeriesResult,
	teamLabels: readonly [string, string],
): string {
	switch (highlight.type) {
		case "opening-duel":
			return `${playerName(result, highlight.playerId)} won the opening duel against ${playerName(result, highlight.victimId)}.`;
		case "clutch":
			return `${playerName(result, highlight.playerId)} converted a 1v${highlight.against} clutch.`;
		case "multikill":
			return `${playerName(result, highlight.playerId)} landed a ${highlight.kills}K.`;
		case "ace":
			return `${playerName(result, highlight.playerId)} wiped the server with an ace.`;
		case "coach-timeout":
			return `${teamLabels[highlight.team]} called a timeout through ${result.teams[highlight.team].coach.nick}.`;
		case "comeback":
			return `${teamLabels[highlight.team]} erased a ${highlight.fromDeficit}-round deficit.`;
	}
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
			className="mt-4 flex flex-wrap gap-x-4 gap-y-3"
			aria-label={`${map.label} round timeline`}
		>
			{groupedRounds(map.rounds).map(([label, rounds]) => (
				<div key={label}>
					<p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
						{label}
					</p>
					<div className="flex flex-wrap gap-1">
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
	map,
	teamLabels,
}: {
	map: MapResult;
	teamLabels: readonly [string, string];
}) {
	return (
		<div className="mt-5 space-y-4">
			{map.scoreboard.map((teamRows, teamIndex) => (
				<div key={teamLabels[teamIndex]}>
					<div className="mb-2 flex items-baseline justify-between gap-3">
						<h4 className="text-sm font-semibold text-zinc-100">{teamLabels[teamIndex]}</h4>
						<span className="text-xs tabular-nums text-zinc-500">
							{map.score[teamIndex]} rounds
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
												{player.rating.toFixed(1)}
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

export function MatchPlayback({ result, teamLabels }: MatchPlaybackProps) {
	const playbackRounds = useMemo(
		() =>
			result.maps.flatMap((map, mapIndex) =>
				map.rounds.map((round, roundIndex) => ({ mapIndex, roundIndex, round })),
			),
		[result],
	);
	const [revealedCount, setRevealedCount] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [announcement, setAnnouncement] = useState("Replay ready.");
	const complete = revealedCount >= playbackRounds.length;

	useEffect(() => {
		if (!playing || complete) return;
		const timer = window.setInterval(() => {
			setRevealedCount((count) => Math.min(playbackRounds.length, count + 1));
		}, 700);
		return () => window.clearInterval(timer);
	}, [complete, playbackRounds.length, playing]);

	useEffect(() => {
		if (complete && playing) {
			setPlaying(false);
			setAnnouncement(
				`Final: ${teamLabels[0]} ${result.maps.at(-1)?.score[0] ?? 0}, ${teamLabels[1]} ${result.maps.at(-1)?.score[1] ?? 0}.`,
			);
		}
	}, [complete, playing, result.maps, teamLabels]);

	const lastRevealed = playbackRounds[revealedCount - 1];
	const activeMapIndex = complete
		? result.maps.length - 1
		: (lastRevealed?.mapIndex ?? playbackRounds[revealedCount]?.mapIndex ?? 0);
	const activeMap = result.maps[activeMapIndex] as MapResult;
	const revealedOnActiveMap = playbackRounds
		.slice(0, revealedCount)
		.filter((entry) => entry.mapIndex === activeMapIndex).length;
	const activeScore =
		revealedOnActiveMap === 0
			? ([0, 0] as const)
			: (activeMap.rounds[revealedOnActiveMap - 1]?.scoreAfter ?? ([0, 0] as const));
	const completedMaps = result.maps.filter((_, mapIndex) => {
		const mapLastRound = playbackRounds.findLast((entry) => entry.mapIndex === mapIndex);
		return mapLastRound ? revealedCount > playbackRounds.indexOf(mapLastRound) : false;
	});
	const seriesScore = completedMaps.reduce<[number, number]>(
		(score, map) => {
			score[map.winner] += 1;
			return score;
		},
		[0, 0],
	);
	const visibleRounds = playbackRounds.slice(0, revealedCount).filter((entry) => {
		return entry.mapIndex === activeMapIndex;
	});

	function playPause() {
		if (complete) return;
		setPlaying((value) => !value);
		setAnnouncement(playing ? "Replay paused." : "Replay playing.");
	}

	function step() {
		setPlaying(false);
		setRevealedCount((count) => Math.min(playbackRounds.length, count + 1));
		const next = playbackRounds[revealedCount];
		setAnnouncement(next ? `Round ${next.round.round} revealed.` : "Final result revealed.");
	}

	function skip() {
		setPlaying(false);
		setRevealedCount(playbackRounds.length);
		setAnnouncement("Skipped to the final result.");
	}

	function restart() {
		setPlaying(false);
		setRevealedCount(0);
		setAnnouncement("Replay restarted.");
	}

	return (
		<section
			aria-labelledby="match-heading"
			className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						{result.format} exhibition
					</p>
					<h3 id="match-heading" className="mt-1 text-xl font-semibold tracking-tight text-white">
						{teamLabels[0]} <span className="text-zinc-600">vs</span> {teamLabels[1]}
					</h3>
					<p className="mt-1 text-xs text-zinc-500">
						Series {seriesScore[0]}–{seriesScore[1]} · {activeMap.label}
						{activeMap.overtimeBlocks > 0 ? ` · ${activeMap.overtimeBlocks}× OT` : ""}
					</p>
				</div>
				<section className="flex items-center gap-3" aria-label="Current map score">
					<div className="text-right">
						<span className="block max-w-28 truncate text-xs text-zinc-400">{teamLabels[0]}</span>
						<strong className="text-3xl tabular-nums text-emerald-300">{activeScore[0]}</strong>
					</div>
					<span className="text-zinc-700">:</span>
					<div>
						<span className="block max-w-28 truncate text-xs text-zinc-400">{teamLabels[1]}</span>
						<strong className="text-3xl tabular-nums text-amber-300">{activeScore[1]}</strong>
					</div>
				</section>
			</div>

			<RoundTimeline map={activeMap} revealed={revealedOnActiveMap} teamLabels={teamLabels} />

			<fieldset className="mt-5 flex flex-wrap gap-2">
				<legend className="sr-only">Replay controls</legend>
				<button type="button" onClick={playPause} disabled={complete} className={CONTROL_CLASS}>
					{playing ? "Pause" : "Play"}
				</button>
				<button type="button" onClick={step} disabled={complete} className={CONTROL_CLASS}>
					Next round
				</button>
				<button type="button" onClick={skip} disabled={complete} className={CONTROL_CLASS}>
					Skip to result
				</button>
				<button
					type="button"
					onClick={restart}
					disabled={revealedCount === 0}
					className={CONTROL_CLASS}
				>
					Restart replay
				</button>
			</fieldset>
			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{announcement}
			</p>

			<div className="mt-5 border-t border-white/10 pt-4">
				<h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
					Play-by-play
				</h4>
				{visibleRounds.length === 0 ? (
					<p className="mt-2 text-sm text-zinc-600">
						Press play, step forward, or skip to the result.
					</p>
				) : (
					<ol className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
						{visibleRounds
							.toReversed()
							.slice(0, 10)
							.map(({ round }) => {
								const highlights = activeMap.highlights.filter(
									(highlight) => highlight.round === round.round,
								);
								return (
									<li
										key={round.round}
										className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-zinc-400 motion-safe:animate-[draft-reveal_240ms_ease-out]"
									>
										<span className="font-semibold text-zinc-200">
											R{round.round} · {teamLabels[round.winner]} made it {round.scoreAfter[0]}–
											{round.scoreAfter[1]}
										</span>
										{highlights.map((highlight) => (
											<span
												key={`${round.round}-${highlight.type}-${highlightText(highlight, result, teamLabels)}`}
												className="mt-1 block text-emerald-200"
											>
												{highlightText(highlight, result, teamLabels)}
											</span>
										))}
									</li>
								);
							})}
					</ol>
				)}
			</div>

			{complete && (
				<div className="mt-6 border-t border-white/10 pt-5">
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Final result
					</p>
					<h4 className="mt-1 text-2xl font-semibold text-white">
						{teamLabels[result.winner]} win {result.score[0]}–{result.score[1]}
					</h4>
					{result.maps.map((map) => (
						<section key={map.label} aria-label={`${map.label} final scoreboard`}>
							<h5 className="mt-5 text-base font-semibold text-zinc-200">
								{map.label} · {teamLabels[0]} {map.score[0]}–{map.score[1]} {teamLabels[1]}
							</h5>
							<Scoreboard map={map} teamLabels={teamLabels} />
						</section>
					))}
				</div>
			)}
		</section>
	);
}
