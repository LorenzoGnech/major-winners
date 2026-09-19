import type { ReactNode } from "react";
import { formatEloDelta, type RankedResult } from "../community";
import type { PlayerSeason } from "../data";
import type { DuelSeriesSummary, RunPlayerStats } from "../engine";
import { flagEmoji, ROLE_LABELS } from "./draftPresentation";
import { PlayerCrest } from "./PlayerCrest";
import { RecapPlayButton } from "./RecapPlayButton";

const CONFETTI = [
	{ left: "8%", delay: "0ms", duration: "2.4s", color: "#6ee7b7", width: "8px", drift: "18px" },
	{ left: "22%", delay: "80ms", duration: "2.2s", color: "#fde68a", width: "10px", drift: "28px" },
	{ left: "39%", delay: "40ms", duration: "2.6s", color: "#34d399", width: "7px", drift: "24px" },
	{ left: "55%", delay: "120ms", duration: "2.9s", color: "#a7f3d0", width: "6px", drift: "16px" },
	{ left: "71%", delay: "60ms", duration: "2.7s", color: "#6ee7b7", width: "5px", drift: "32px" },
	{ left: "87%", delay: "300ms", duration: "3.1s", color: "#fff", width: "7px", drift: "20px" },
	{ left: "14%", delay: "180ms", duration: "2.8s", color: "#fbbf24", width: "6px", drift: "-22px" },
	{ left: "63%", delay: "360ms", duration: "2.5s", color: "#fef3c7", width: "8px", drift: "-18px" },
] as const;

function ratingClass(rating: number): string {
	if (rating >= 1.2) return "text-emerald-300";
	if (rating >= 1) return "text-zinc-100";
	return "text-amber-200";
}

function crestFor(
	player: RunPlayerStats,
	playersById: ReadonlyMap<string, PlayerSeason>,
): Pick<PlayerSeason, "playerId" | "nick" | "photo"> {
	const season = playersById.get(player.seasonId);
	return {
		playerId: season?.playerId ?? player.playerId,
		nick: player.nick,
		photo: season?.photo,
	};
}

function TeamRecap({
	label,
	side,
	won,
	score,
	playersById,
}: {
	label: string;
	side: DuelSeriesSummary["sides"][number];
	won: boolean;
	score: number;
	playersById: ReadonlyMap<string, PlayerSeason>;
}) {
	return (
		<section
			className={`rounded-2xl border p-3 sm:p-4 ${
				won ? "border-amber-300/45 bg-amber-300/8" : "border-white/10 bg-black/25"
			}`}
		>
			<p
				className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
					won ? "text-amber-200" : "text-zinc-500"
				}`}
			>
				{won ? "Winner" : "Runner-up"}
			</p>
			<div className="mt-1 flex items-baseline justify-between gap-3">
				<h3 className="truncate text-xl font-semibold text-white">{side.name}</h3>
				<p className="text-2xl font-bold tabular-nums text-white">{score}</p>
			</div>
			<p className="mt-1 text-xs text-zinc-500">
				OVR {side.overall.toFixed(1)} · Coach {side.coachNick}
			</p>
			<ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label={`${label} roster`}>
				{side.players.map((player) => {
					const mvp = player.seasonId === side.mvpSeasonId;
					return (
						<li key={player.seasonId} className="min-w-0">
							<div
								className={`overflow-hidden rounded-xl ${mvp ? "ring-2 ring-amber-300/70" : ""}`}
							>
								<PlayerCrest player={crestFor(player, playersById)} size="card" loading="eager" />
							</div>
							<p className="mt-1.5 truncate text-center text-xs font-semibold text-zinc-100">
								{player.nick}
							</p>
							<p className="truncate text-center text-[10px] uppercase tracking-wider text-zinc-500">
								{ROLE_LABELS[player.slot]}
								<span className="mx-0.5 text-zinc-700">·</span>
								<span aria-hidden>{flagEmoji(player.nationality)}</span>
							</p>
							{mvp ? (
								<p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
									MVP
								</p>
							) : null}
							<p className="mt-1 text-center text-[11px] font-semibold tabular-nums text-zinc-100">
								{player.kills}
								<span className="text-zinc-600">–</span>
								{player.deaths}
								<span className="text-zinc-600">–</span>
								{player.assists}
							</p>
							<p
								className={`text-center text-sm font-bold tabular-nums ${
									player.rounds > 0 ? ratingClass(player.rating) : "text-zinc-600"
								}`}
							>
								{player.rounds > 0 ? player.rating.toFixed(2) : "—"}
							</p>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

export function DuelSummary({
	summary,
	viewerSide,
	playersById,
	extras,
	ranked = false,
	rankedResult = null,
	onPlayAgain,
	playAgainLabel = "Back to Home",
}: {
	summary: DuelSeriesSummary;
	viewerSide: 0 | 1;
	playersById: ReadonlyMap<string, PlayerSeason>;
	extras?: ReactNode;
	ranked?: boolean;
	rankedResult?: RankedResult | null;
	onPlayAgain?: () => void;
	playAgainLabel?: string;
}) {
	const won = summary.winner === viewerSide;
	const winner = summary.sides[summary.winner];
	const loserSide = summary.winner === 0 ? 1 : 0;
	const loser = summary.sides[loserSide];

	return (
		<section
			aria-labelledby="duel-summary-heading"
			className={`relative overflow-hidden rounded-2xl border p-4 sm:p-7 ${
				won
					? "run-summary-in border-amber-300/40 bg-linear-to-b from-amber-300/12 via-zinc-900/80 to-zinc-950"
					: "border-white/10 bg-zinc-900/70"
			}`}
		>
			{won ? (
				<>
					<div
						aria-hidden
						className="run-champ-glow pointer-events-none absolute -top-24 left-1/2 h-72 w-xl -translate-x-1/2 rounded-full bg-amber-300/25 blur-3xl"
					/>
					<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
						{CONFETTI.map((piece) => (
							<span
								key={`${piece.left}-${piece.delay}`}
								className="run-confetti"
								style={{
									left: piece.left,
									width: piece.width,
									background: piece.color,
									animationDelay: piece.delay,
									animationDuration: piece.duration,
									["--run-confetti-x" as string]: piece.drift,
								}}
							/>
						))}
					</div>
				</>
			) : null}

			<div className="relative">
				<p
					className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
						won ? "text-amber-200" : "text-zinc-500"
					}`}
				>
					{ranked ? "Ranked match · BO5" : "Private match · BO5"}
				</p>
				<h2
					id="duel-summary-heading"
					className={`mt-2 font-semibold tracking-[0.14em] ${
						won
							? "run-summary-title text-3xl text-amber-100 sm:text-5xl"
							: "text-3xl text-white sm:text-4xl"
					}`}
				>
					{won ? "VICTORY" : "DEFEAT"}
				</h2>
				<p className="mt-2 text-lg font-semibold text-white">
					{winner.name}{" "}
					<span className="text-zinc-500">
						{summary.score[summary.winner]}–{summary.score[loserSide]}
					</span>
				</p>
				<p className="mt-1 text-sm text-zinc-400">
					{won ? "You took the series." : `${winner.name} took the series.`} {summary.rounds[0]}–
					{summary.rounds[1]} rounds.
				</p>
				{ranked ? (
					<p className="mt-2 text-sm text-amber-100/90">
						{rankedResult?.eloApplied && rankedResult.you && rankedResult.opponent
							? `${rankedResult.you.displayName} ${rankedResult.you.elo} (${formatEloDelta(rankedResult.you.delta ?? 0)}) · ${rankedResult.opponent.displayName} ${rankedResult.opponent.elo}`
							: rankedResult?.mismatch
								? "Series reports do not match. Elo is unchanged."
								: "Waiting for both sides to confirm the series."}
					</p>
				) : null}
				{summary.maps.length > 0 ? (
					<ul className="mt-2 space-y-0.5 text-sm text-zinc-500">
						{summary.maps.map((map) => (
							<li key={map.label}>
								{map.label} {map.score[0]}–{map.score[1]}
							</li>
						))}
					</ul>
				) : null}
				{onPlayAgain ? (
					<div className="mt-6">
						<RecapPlayButton onClick={onPlayAgain}>{playAgainLabel}</RecapPlayButton>
					</div>
				) : null}

				<div className="mt-6 grid gap-4 lg:grid-cols-2">
					<TeamRecap
						label="Winning team"
						side={winner}
						won
						score={summary.score[summary.winner]}
						playersById={playersById}
					/>
					<TeamRecap
						label="Losing team"
						side={loser}
						won={false}
						score={summary.score[loserSide]}
						playersById={playersById}
					/>
				</div>

				{extras ? <div className="mt-5">{extras}</div> : null}
				{onPlayAgain ? (
					<div className={extras ? "mt-6" : "mt-5"}>
						<RecapPlayButton onClick={onPlayAgain}>{playAgainLabel}</RecapPlayButton>
					</div>
				) : null}
			</div>
		</section>
	);
}
