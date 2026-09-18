import { type ReactNode, useEffect, useState } from "react";
import type { Org, PlayerSeason } from "../data";
import type { HistoricalOpponent, LiveSeriesState, TeamProfile, TournamentState } from "../engine";
import {
	beginNextMatch,
	commitLiveMatch,
	DEFAULT_GAME_PLAN,
	MAP_POOL,
	needsGamePlan,
	setLiveSeries,
	startNextMap,
} from "../engine";
import { MatchPlayback } from "./MatchPlayback";
import { preloadMapArt } from "./mapArt";
import { OpponentPreview } from "./OpponentPreview";
import { OrgCrest } from "./OrgCrest";
import { RunSummary } from "./RunSummary";
import { visibleTournamentBoard } from "./tournamentBoard";

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
	playerTeamName: string;
	opponents: readonly HistoricalOpponent[];
	orgsById: ReadonlyMap<string, Org>;
	playersById: ReadonlyMap<string, PlayerSeason>;
	onChange: (state: TournamentState) => void;
	onAbandon: () => void;
	terminalExtras?: ReactNode;
};

function resolveOpponentOrg(
	opponent: HistoricalOpponent,
	orgsById: ReadonlyMap<string, Org>,
): Pick<Org, "id" | "name" | "logo"> | undefined {
	if (opponent.org) return opponent.org;
	const orgId = opponent.profile.members[0]?.orgId;
	return orgId ? orgsById.get(orgId) : undefined;
}

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
	playerTeamName,
	opponents,
	orgsById,
	playersById,
	onChange,
	onAbandon,
	terminalExtras,
}: TournamentRunProps) {
	const [playbackComplete, setPlaybackComplete] = useState(false);
	const [confirmAbandon, setConfirmAbandon] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const liveSeries = state.liveSeries ?? null;
	const board = visibleTournamentBoard(state, undefined, true);
	const nextOpponentOrg = state.nextMatch
		? resolveOpponentOrg(state.nextMatch.opponent, orgsById)
		: undefined;

	useEffect(() => {
		preloadMapArt(MAP_POOL.map((map) => map.background));
	}, []);

	function playNext() {
		const result = beginNextMatch(state, playerTeam, opponents);
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		onChange(result.value);
		setPlaybackComplete(false);
		setError(null);
	}

	function continueToNextMap() {
		if (!liveSeries || !needsGamePlan(liveSeries)) return;
		const started = startNextMap(liveSeries, DEFAULT_GAME_PLAN);
		if (!started.ok) {
			setError(started.error.message);
			return;
		}
		onChange(setLiveSeries(state, started.value));
		setPlaybackComplete(false);
		setError(null);
	}

	function updateLive(next: LiveSeriesState) {
		onChange(setLiveSeries(state, next));
	}

	function continueRun() {
		if (liveSeries?.complete) {
			const result = commitLiveMatch(state, playerTeam, opponents);
			if (!result.ok) {
				setError(result.error.message);
				return;
			}
			onChange(result.value);
		}
		setPlaybackComplete(false);
	}

	function abandon() {
		if (!confirmAbandon) {
			setConfirmAbandon(true);
			return;
		}
		onAbandon();
	}

	const terminal = !liveSeries && state.status !== "active";

	return (
		<section
			aria-labelledby={terminal ? undefined : "tournament-heading"}
			aria-label={terminal ? "Major run" : undefined}
		>
			{terminal ? (
				<RunSummary
					state={state}
					playerTeam={playerTeam}
					playerTeamName={playerTeamName}
					playersById={playersById}
				/>
			) : null}
			<div
				className={`${terminal ? "mt-5 " : ""}rounded-2xl border border-emerald-300/25 bg-zinc-900/65 p-4 sm:p-6`}
			>
				{terminal ? null : (
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
								Classic fantasy Major
							</p>
							<h2
								id="tournament-heading"
								className="mt-1 text-3xl font-semibold tracking-tight text-white"
							>
								{STAGE_LABELS[board.stage]}
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
								{board.history.filter((match) => match.won).length}–
								{board.history.filter((match) => !match.won).length}
							</strong>
						</div>
					</div>
				)}

				{terminal ? (
					<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Path</p>
				) : null}
				<div className={`${terminal ? "mt-0" : "mt-5"} grid grid-cols-2 gap-2 sm:grid-cols-5`}>
					<RecordCard
						label="Challengers"
						record={board.challengers}
						active={board.status === "active" && board.stage === "challengers"}
					/>
					<RecordCard
						label="Legends"
						record={board.legends}
						active={board.status === "active" && board.stage === "legends"}
					/>
					{(["quarterfinal", "semifinal", "final"] as const).map((round) => {
						const match = board.history.find((item) => item.playoffRound === round);
						const active =
							board.status === "active" &&
							board.stage === "champions" &&
							board.playoffRound === round;
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

				{!liveSeries && state.status === "active" && state.nextMatch && (
					<div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
								Next · {state.nextMatch.format}
							</p>
							<button
								type="button"
								onClick={playNext}
								className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
							>
								Play match {state.nextMatch.matchNumber}
							</button>
						</div>
						<div className="mt-4">
							<OpponentPreview
								opponent={state.nextMatch.opponent}
								org={nextOpponentOrg}
								playerTeamName={playerTeamName}
								playerOverall={playerTeam.overall}
								format={state.nextMatch.format}
								playersById={playersById}
							/>
						</div>
					</div>
				)}

				{terminal ? terminalExtras : null}

				{error && (
					<p role="alert" className="mt-4 text-sm text-red-200">
						{error}
					</p>
				)}
			</div>

			{liveSeries && (
				<>
					<MatchPlayback
						key={`${state.nextMatch?.matchNumber ?? "live"}-${liveSeries.seed}`}
						live={liveSeries}
						onLiveChange={updateLive}
						teamLabels={[playerTeamName, state.nextMatch?.opponent.label ?? "Opponent"]}
						opponentOrg={nextOpponentOrg}
						playersById={playersById}
						eyebrow={`${STAGE_LABELS[state.nextMatch?.stage ?? state.stage]} · ${state.nextMatch?.format ?? ""}`}
						onComplete={() => setPlaybackComplete(true)}
						onAwaitingNextMap={continueToNextMap}
						onContinueMatch={continueRun}
					/>
					{playbackComplete && liveSeries.complete && (
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

			{board.history.length > 0 && (
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
						{board.history.map((match) => {
							const org = resolveOpponentOrg(match.opponent, orgsById);
							return (
								<li
									key={match.matchNumber}
									className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-2 text-sm"
								>
									{org ? <OrgCrest org={org} size="sm" /> : null}
									<span className={match.won ? "text-emerald-300" : "text-amber-300"}>
										{match.won ? "W" : "L"}
									</span>
									<span className="min-w-0 truncate text-zinc-200">{match.opponent.label}</span>
									<span className="shrink-0 text-zinc-600">· {match.format}</span>
								</li>
							);
						})}
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
					{confirmAbandon ? "Confirm abandon" : "Abandon run"}
				</button>
			</div>
		</section>
	);
}
