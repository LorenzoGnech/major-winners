import { useState } from "react";
import type { HistoricalOpponent, TeamProfile, TournamentState } from "../engine";
import { runNextMatch } from "../engine";
import { MatchPlayback } from "./MatchPlayback";

const STAGE_LABELS = {
	challengers: "Challengers Swiss",
	legends: "Legends Swiss",
	champions: "Champions playoffs",
} as const;

const ROUND_LABELS = {
	quarterfinal: "Quarterfinal",
	semifinal: "Semifinal",
	final: "Grand final",
} as const;

type TournamentRunProps = {
	state: TournamentState;
	playerTeam: TeamProfile;
	opponents: readonly HistoricalOpponent[];
	onChange: (state: TournamentState) => void;
	onAbandon: () => void;
};

function RecordCard({
	label,
	record,
	active,
}: {
	label: string;
	record: { wins: number; losses: number };
	active: boolean;
}) {
	return (
		<div
			className={`rounded-xl border p-3 ${active ? "border-emerald-300/40 bg-emerald-300/8" : "border-white/10 bg-black/20"}`}
		>
			<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
			<p className="mt-1 text-2xl font-bold tabular-nums text-white">
				{record.wins}–{record.losses}
			</p>
		</div>
	);
}

export function TournamentRun({
	state,
	playerTeam,
	opponents,
	onChange,
	onAbandon,
}: TournamentRunProps) {
	const latestMatch = state.history.at(-1);
	const [playbackMatchNumber, setPlaybackMatchNumber] = useState<number | null>(
		latestMatch?.matchNumber ?? null,
	);
	const [playbackComplete, setPlaybackComplete] = useState(false);
	const [confirmAbandon, setConfirmAbandon] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const playbackMatch = state.history.find((match) => match.matchNumber === playbackMatchNumber);

	function playNext() {
		const result = runNextMatch(state, playerTeam, opponents);
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		const match = result.value.history.at(-1);
		onChange(result.value);
		setPlaybackMatchNumber(match?.matchNumber ?? null);
		setPlaybackComplete(false);
		setError(null);
	}

	function continueRun() {
		setPlaybackMatchNumber(null);
		setPlaybackComplete(false);
	}

	function abandon() {
		if (!confirmAbandon) {
			setConfirmAbandon(true);
			return;
		}
		onAbandon();
	}

	const terminalHeading =
		state.status === "champion"
			? "Major champions"
			: state.status === "eliminated"
				? "Run over"
				: null;

	return (
		<section aria-labelledby="tournament-heading">
			<div className="rounded-2xl border border-emerald-300/25 bg-zinc-900/65 p-4 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
							Classic fantasy Major
						</p>
						<h2
							id="tournament-heading"
							className="mt-1 text-3xl font-semibold tracking-tight text-white"
						>
							{terminalHeading ?? STAGE_LABELS[state.stage]}
						</h2>
						<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
							Two Swiss stages, then three playoff series. A flawless championship is 9–0.
						</p>
					</div>
					<div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-right">
						<span className="block text-[10px] uppercase tracking-wider text-zinc-500">
							Run record
						</span>
						<strong className="text-2xl tabular-nums text-white">
							{state.history.filter((match) => match.won).length}–
							{state.history.filter((match) => !match.won).length}
						</strong>
					</div>
				</div>

				<div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
					<RecordCard
						label="Challengers"
						record={state.challengers}
						active={state.status === "active" && state.stage === "challengers"}
					/>
					<RecordCard
						label="Legends"
						record={state.legends}
						active={state.status === "active" && state.stage === "legends"}
					/>
					{(["quarterfinal", "semifinal", "final"] as const).map((round) => {
						const match = state.history.find((item) => item.playoffRound === round);
						const active =
							state.status === "active" &&
							state.stage === "champions" &&
							state.playoffRound === round;
						return (
							<div
								key={round}
								className={`rounded-xl border p-3 ${active ? "border-emerald-300/40 bg-emerald-300/8" : "border-white/10 bg-black/20"}`}
							>
								<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
									{ROUND_LABELS[round]}
								</p>
								<p
									className={`mt-1 text-sm font-semibold ${match?.won ? "text-emerald-200" : match ? "text-amber-200" : "text-zinc-600"}`}
								>
									{match ? (match.won ? "Won" : "Lost") : active ? "Next" : "—"}
								</p>
							</div>
						);
					})}
				</div>

				{!playbackMatch && state.status === "active" && state.nextMatch && (
					<div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
						<div>
							<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
								Next · {state.nextMatch.format}
							</p>
							<p className="mt-1 text-lg font-semibold text-white">
								{state.nextMatch.opponent.label}
							</p>
							<p className="text-xs text-zinc-500">
								OVR {state.nextMatch.opponent.profile.overall}
							</p>
						</div>
						<button
							type="button"
							onClick={playNext}
							className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
						>
							Play match {state.nextMatch.matchNumber}
						</button>
					</div>
				)}

				{!playbackMatch && state.status !== "active" && (
					<div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
						<p className="text-lg font-semibold text-white">
							{state.status === "champion"
								? "You won the Major."
								: `Eliminated in ${STAGE_LABELS[state.stage]}.`}
						</p>
						<p className="mt-1 text-sm text-zinc-400">
							Final record: {state.history.filter((match) => match.won).length}–
							{state.history.filter((match) => !match.won).length}.
						</p>
					</div>
				)}

				{error && (
					<p role="alert" className="mt-4 text-sm text-red-200">
						{error}
					</p>
				)}
			</div>

			{playbackMatch && (
				<>
					<MatchPlayback
						key={playbackMatch.matchNumber}
						result={playbackMatch.result}
						teamLabels={["Your legends", playbackMatch.opponent.label]}
						eyebrow={`${STAGE_LABELS[playbackMatch.stage]} · ${playbackMatch.format}`}
						onComplete={() => setPlaybackComplete(true)}
					/>
					{playbackComplete && (
						<div className="mt-3 flex justify-end">
							<button
								type="button"
								onClick={continueRun}
								className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
							>
								{state.status === "active" ? "Continue Major" : "View run summary"}
							</button>
						</div>
					)}
				</>
			)}

			{state.history.length > 0 && (
				<section
					aria-labelledby="history-heading"
					className="mt-5 rounded-2xl border border-white/10 p-4"
				>
					<h3
						id="history-heading"
						className="text-xs font-semibold uppercase tracking-wider text-zinc-500"
					>
						Match history
					</h3>
					<ol className="mt-3 grid gap-2 sm:grid-cols-2">
						{state.history.map((match) => (
							<li key={match.matchNumber} className="rounded-lg bg-white/4 px-3 py-2 text-sm">
								<span className={match.won ? "text-emerald-300" : "text-amber-300"}>
									{match.won ? "W" : "L"}
								</span>{" "}
								<span className="text-zinc-200">{match.opponent.label}</span>
								<span className="text-zinc-600"> · {match.format}</span>
							</li>
						))}
					</ol>
				</section>
			)}

			<div className="mt-5">
				<button
					type="button"
					onClick={abandon}
					onBlur={() => setConfirmAbandon(false)}
					className="rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-300/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
				>
					{confirmAbandon ? "Confirm abandon and start new draft" : "Abandon run"}
				</button>
			</div>
		</section>
	);
}
