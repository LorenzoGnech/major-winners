import type { PlayerSeason } from "../data";
import type { RunPlayerStats, TeamProfile, TournamentState } from "../engine";
import { summarizeTournamentRun } from "../engine";
import { flagEmoji, ROLE_LABELS } from "./draftPresentation";
import { PlayerCrest } from "./PlayerCrest";

const CONFETTI = [
	{ left: "6%", delay: "0ms", duration: "2.4s", color: "#6ee7b7", width: "8px", drift: "18px" },
	{ left: "14%", delay: "180ms", duration: "2.8s", color: "#fbbf24", width: "6px", drift: "-22px" },
	{ left: "22%", delay: "80ms", duration: "2.2s", color: "#fde68a", width: "10px", drift: "28px" },
	{ left: "31%", delay: "320ms", duration: "3s", color: "#fff", width: "5px", drift: "-12px" },
	{ left: "39%", delay: "40ms", duration: "2.6s", color: "#34d399", width: "7px", drift: "24px" },
	{ left: "47%", delay: "240ms", duration: "2.3s", color: "#f59e0b", width: "9px", drift: "-30px" },
	{ left: "55%", delay: "120ms", duration: "2.9s", color: "#a7f3d0", width: "6px", drift: "16px" },
	{ left: "63%", delay: "360ms", duration: "2.5s", color: "#fef3c7", width: "8px", drift: "-18px" },
	{ left: "71%", delay: "60ms", duration: "2.7s", color: "#6ee7b7", width: "5px", drift: "32px" },
	{ left: "79%", delay: "200ms", duration: "2.1s", color: "#fbbf24", width: "10px", drift: "-8px" },
	{ left: "87%", delay: "300ms", duration: "3.1s", color: "#fff", width: "7px", drift: "20px" },
	{ left: "93%", delay: "140ms", duration: "2.4s", color: "#34d399", width: "6px", drift: "-26px" },
	{ left: "10%", delay: "420ms", duration: "2.8s", color: "#fde68a", width: "4px", drift: "14px" },
	{ left: "28%", delay: "500ms", duration: "2.2s", color: "#6ee7b7", width: "9px", drift: "-20px" },
	{ left: "52%", delay: "460ms", duration: "2.6s", color: "#f59e0b", width: "5px", drift: "10px" },
	{ left: "74%", delay: "540ms", duration: "2.9s", color: "#fff7ed", width: "8px", drift: "-16px" },
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

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
	return (
		<div
			className={`rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-center ${
				wide ? "col-span-2 sm:col-span-1" : ""
			}`}
		>
			<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
			<p className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</p>
		</div>
	);
}

export function RunSummary({
	state,
	playerTeam,
	playerTeamName,
	playersById,
}: {
	state: TournamentState;
	playerTeam: TeamProfile;
	playerTeamName: string;
	playersById: ReadonlyMap<string, PlayerSeason>;
}) {
	const summary = summarizeTournamentRun(state, playerTeam);
	const champion = summary.status === "champion";

	return (
		<section
			aria-labelledby="run-summary-heading"
			className={`relative overflow-hidden rounded-2xl border p-4 sm:p-7 ${
				champion
					? "run-summary-in border-amber-300/40 bg-linear-to-b from-amber-300/12 via-zinc-900/80 to-zinc-950"
					: "border-white/10 bg-zinc-900/70"
			}`}
		>
			{champion ? (
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
						champion ? "text-amber-200" : "text-zinc-500"
					}`}
				>
					{champion ? "Classic fantasy Major" : "Major run"}
				</p>
				<h2
					id="run-summary-heading"
					className={`mt-2 font-semibold tracking-[0.14em] ${
						champion
							? "run-summary-title text-3xl text-amber-100 sm:text-5xl"
							: "text-3xl text-white sm:text-4xl"
					}`}
				>
					{champion ? "MAJOR CHAMPIONS" : "RUN OVER"}
				</h2>
				<p className="mt-2 text-lg font-semibold text-white">{playerTeamName}</p>
				<p className="mt-1 text-sm text-zinc-400">
					{champion
						? summary.perfect
							? "Perfect 9–0. You took every series."
							: `You won the Major · ${summary.wins}–${summary.losses}.`
						: `Eliminated · ${summary.finish} · ${summary.wins}–${summary.losses}.`}
				</p>

				<dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
					<Stat label="Record" value={`${summary.wins}–${summary.losses}`} />
					<Stat label="Finish" value={summary.finish} />
					<Stat label="Maps" value={`${summary.mapsWon}–${summary.mapsLost}`} />
					<Stat label="Rounds" value={`${summary.roundsWon}–${summary.roundsLost}`} />
					<Stat label="Team OVR" value={summary.teamOverall.toFixed(1)} wide />
				</dl>

				<ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Your roster">
					{summary.players.map((player, index) => {
						const mvp = player.seasonId === summary.mvpSeasonId;
						return (
							<li
								key={player.seasonId}
								className={`run-player-in min-w-0 rounded-2xl border p-2 sm:p-3 ${
									champion
										? mvp
											? "border-amber-300/55 bg-amber-300/10"
											: "border-amber-300/20 bg-black/25"
										: "border-white/10 bg-black/20"
								}`}
								style={{ animationDelay: `${120 + index * 90}ms` }}
							>
								<div className="overflow-hidden rounded-xl">
									<PlayerCrest player={crestFor(player, playersById)} size="card" loading="eager" />
								</div>
								<p className="mt-2 truncate text-center text-sm font-semibold text-zinc-100">
									{player.nick}
								</p>
								<p className="mt-0.5 truncate text-center text-[10px] uppercase tracking-wider text-zinc-500">
									{ROLE_LABELS[player.slot]}
									<span className="mx-1 text-zinc-700">·</span>
									<span aria-hidden>{flagEmoji(player.nationality)}</span>
									<span className="ml-1">{player.year}</span>
								</p>
								{mvp ? (
									<p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
										Run MVP
									</p>
								) : null}
								<p className="mt-2 text-center text-sm font-semibold tabular-nums text-zinc-100">
									{player.kills}
									<span className="text-zinc-600">–</span>
									{player.deaths}
									<span className="text-zinc-600">–</span>
									{player.assists}
								</p>
								<p className="mt-0.5 text-center text-[11px] tabular-nums text-zinc-500">
									{player.rounds > 0
										? `${player.adr} ADR · ${player.kast}% KAST`
										: "No rounds logged"}
								</p>
								<p
									className={`mt-1 text-center text-lg font-bold tabular-nums ${
										player.rounds > 0 ? ratingClass(player.rating) : "text-zinc-600"
									}`}
								>
									{player.rounds > 0 ? player.rating.toFixed(2) : "—"}
								</p>
								{player.aces > 0 || player.clutches > 0 ? (
									<p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
										{[
											player.aces > 0 ? `${player.aces} ace${player.aces === 1 ? "" : "s"}` : null,
											player.clutches > 0
												? `${player.clutches} clutch${player.clutches === 1 ? "" : "es"}`
												: null,
										]
											.filter(Boolean)
											.join(" · ")}
									</p>
								) : null}
							</li>
						);
					})}
				</ul>

				<p className="mt-4 text-sm text-zinc-400">
					Coach · {summary.coachNick}
					{summary.hardestWinLabel ? (
						<>
							<span className="mx-2 text-zinc-700">·</span>
							Hardest win · {summary.hardestWinLabel}
						</>
					) : null}
				</p>
			</div>
		</section>
	);
}
