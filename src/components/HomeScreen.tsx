import type { ReactNode } from "react";
import {
	DISPLAY_NAME_MAX,
	type DuelKind,
	ELO_START,
	PROFILE_BEST_TEAMS,
	type PublishedRunSnapshot,
	type RankedProfile,
	rankedWinRate,
	type SavedTeamSnapshot,
	uniqueBestPublishedRuns,
} from "../community";
import type { Dataset } from "../data";
import type { DailyStats, RatedPlayer } from "../engine";
import { summarizeDailyStats } from "../engine";
import { CUSTOM_SEED_MAX } from "./customSeed";
import { HomeHighlightReel } from "./HomeHighlightReel";
import { formatSavedAt, HomeLeaderboards, RosterStrip } from "./HomeLeaderboards";
import { HOME_HIGHLIGHTS } from "./homeHighlights";

export type HomeView =
	| "menu"
	| "custom"
	| "signin"
	| "profile"
	| "leaderboards"
	| "community"
	| "private"
	| "duel-join"
	| "ranked-handle"
	| "ranked";
export type HomeAction = "daily" | "free" | "custom" | "community" | "duel";

export type HomeCommunityProps = {
	enabled: boolean;
	hasSave: boolean;
	hasDuelSave: boolean;
	duelSaveKind: DuelKind | null;
	joinCode: string;
	joinError: string | null;
	onJoinCode: (value: string) => void;
	onJoinDuel: () => void;
	userEmail: string | null;
	authBusy: boolean;
	authMessage: string | null;
	authError: string | null;
	emailDraft: string;
	runs: readonly PublishedRunSnapshot[];
	teams: readonly SavedTeamSnapshot[];
	dataset: Dataset;
	ratedPlayers: readonly RatedPlayer[];
	onEmailDraft: (value: string) => void;
	onSignIn: () => void;
	onSignOut: () => void;
	myRuns: readonly PublishedRunSnapshot[];
	profile: RankedProfile | null;
	eloBoard: readonly RankedProfile[];
	handleDraft: string;
	handleError: string | null;
	rankedError: string | null;
	rankedElo: number | null;
	rankedWindow: number | null;
	onHandleDraft: (value: string) => void;
	onRanked: () => void;
	onSubmitHandle: () => void;
	onLeaveQueue: () => void;
};

type HomeScreenProps = {
	view: HomeView;
	stats: DailyStats;
	hasDailyAttempt: boolean;
	hasFreePlaySave: boolean;
	seedDraft: string;
	seedError: string | null;
	community: HomeCommunityProps;
	onView: (view: HomeView) => void;
	onSeedDraft: (value: string) => void;
	onChoose: (action: HomeAction) => void;
	onStart: () => void;
};

const MENU_BUTTON =
	"w-full border px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.22em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";
const PRIMARY_BUTTON = `${MENU_BUTTON} border-transparent bg-[#e53935] text-white hover:bg-[#f04848]`;
const SECONDARY_BUTTON = `${MENU_BUTTON} border-white/20 bg-transparent text-white hover:border-white/50 hover:bg-white/5`;
const FIELD_CLASS =
	"mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-center text-sm uppercase tracking-[0.18em] text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";
const AUTH_BUTTON =
	"min-h-11 border border-white/20 bg-black/55 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-xl transition hover:border-white/50 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";

function BrandMark({ size }: { size: "lg" | "sm" }) {
	return (
		<div className="relative flex items-center justify-center">
			<div className="absolute inset-6 rounded-full bg-[#e53935]/25 blur-3xl" />
			<img
				src="/logo.png"
				alt=""
				width={size === "lg" ? 220 : 120}
				height={size === "lg" ? 220 : 120}
				className={size === "lg" ? "relative size-44 sm:size-52" : "relative size-24"}
			/>
		</div>
	);
}

function HomeField({
	id,
	label,
	value,
	onChange,
	error,
	placeholder,
	maxLength,
	type = "text",
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
	placeholder: string;
	maxLength: number;
	type?: "text" | "email";
}) {
	return (
		<div className="w-full text-center">
			<label
				htmlFor={id}
				className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
			>
				{label}
			</label>
			<input
				id={id}
				type={type}
				value={value}
				maxLength={maxLength}
				autoComplete={type === "email" ? "email" : "off"}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				className={FIELD_CLASS}
			/>
			{error ? (
				<p role="alert" className="mt-2 text-xs text-red-300">
					{error}
				</p>
			) : null}
		</div>
	);
}

function SetupForm({
	title,
	detail,
	onBack,
	onSubmit,
	submitLabel = "Start",
	children,
}: {
	title: string;
	detail: string;
	onBack: () => void;
	onSubmit: () => void;
	submitLabel?: string;
	children: ReactNode;
}) {
	return (
		<form
			className="mt-8 flex w-full flex-col items-center gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<div>
				<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">{title}</h2>
				<p className="mt-2 text-sm text-zinc-400">{detail}</p>
			</div>
			{children}
			<button type="submit" className={PRIMARY_BUTTON}>
				{submitLabel}
			</button>
			<button type="button" onClick={onBack} className={SECONDARY_BUTTON}>
				Back
			</button>
		</form>
	);
}

export function RankedStatsPanel({ profile }: { profile: RankedProfile | null }) {
	const winRate = profile ? rankedWinRate(profile.wins, profile.losses) : null;
	const rows = profile
		? ([
				["Handle", profile.displayName],
				["Elo", profile.elo],
				["Wins", profile.wins],
				["Losses", profile.losses],
				["Win rate", winRate === null ? "—" : `${winRate}%`],
				["Win streak", profile.streak],
			] as const)
		: ([
				["Handle", "—"],
				["Elo", ELO_START],
				["Wins", 0],
				["Losses", 0],
				["Win rate", "—"],
				["Win streak", 0],
			] as const);
	return (
		<section aria-labelledby="ranked-stats-heading" className="w-full">
			<h2
				id="ranked-stats-heading"
				className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
			>
				Ranked match
			</h2>
			<p className="mt-1 text-xs text-zinc-500">
				{profile
					? "Elo moves after both players report the same BO5."
					: "Sign in, pick a handle, and queue for a nearby opponent."}
			</p>
			<dl className="mt-5 grid grid-cols-2 gap-2">
				{rows.map(([label, value]) => (
					<div key={label} className="border border-white/10 px-3 py-3">
						<dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
						<dd className="mt-1 font-bold tabular-nums text-white">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export function BestTeamsPanel({
	runs,
	dataset,
}: {
	runs: readonly PublishedRunSnapshot[];
	dataset: Dataset;
}) {
	const best = uniqueBestPublishedRuns(runs, PROFILE_BEST_TEAMS);
	const nicks = new Map(dataset.playerSeasons.map((player) => [player.id, player.nick]));
	const photos = new Map(dataset.playerSeasons.map((player) => [player.id, player]));
	return (
		<section aria-labelledby="best-teams-heading" className="w-full">
			<h2
				id="best-teams-heading"
				className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
			>
				Best teams
			</h2>
			<p className="mt-1 text-xs text-zinc-500">Your top published Major results.</p>
			{best.length > 0 ? (
				<ol className="mt-5 space-y-2">
					{best.map((run, index) => {
						const saved = formatSavedAt(run.createdAt);
						return (
							<li key={run.id} className="border border-white/10 px-2.5 py-2">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-white">
											<span className="mr-2 tabular-nums text-zinc-500">{index + 1}</span>
											{run.team.teamName}
										</p>
										<p className="truncate text-[11px] text-zinc-500">
											{run.finish}
											{saved ? ` · ${saved}` : ""}
										</p>
									</div>
									<p className="shrink-0 text-right text-xs tabular-nums text-zinc-300">
										{run.wins}–{run.losses}
										<span className="mt-0.5 block text-[10px] text-zinc-500">
											maps {run.mapsWon}–{run.mapsLost}
										</span>
									</p>
								</div>
								<RosterStrip roster={run.team.roster} nicks={nicks} photos={photos} />
							</li>
						);
					})}
				</ol>
			) : (
				<p className="mt-5 text-sm text-zinc-500">
					Finish a Major and save your team to rank it here.
				</p>
			)}
		</section>
	);
}

export function DailyStatsPanel({ stats, dataset }: { stats: DailyStats; dataset: Dataset }) {
	const seasons = new Map(
		dataset.playerSeasons.map((player) => [
			player.id,
			{ playerId: player.playerId, nick: player.nick },
		]),
	);
	const summary = summarizeDailyStats(stats, undefined, seasons);
	const rows = [
		["Daily runs completed", summary.completedRuns],
		["Perfect 9–0s", summary.perfectRuns],
		["Most used player", summary.mostUsedPlayer],
		["Best finish", summary.bestFinish],
	] as const;
	return (
		<section aria-labelledby="stats-heading" className="w-full">
			<h2
				id="stats-heading"
				className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
			>
				Daily
			</h2>
			<p className="mt-1 text-xs text-zinc-500">Stored only in this browser.</p>
			<dl className="mt-5 grid grid-cols-2 gap-2">
				{rows.map(([label, value]) => (
					<div key={label} className="border border-white/10 px-3 py-3">
						<dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
						<dd className="mt-1 font-bold tabular-nums text-white">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export function HomeScreen({
	view,
	stats,
	hasDailyAttempt,
	hasFreePlaySave,
	seedDraft,
	seedError,
	community,
	onView,
	onSeedDraft,
	onChoose,
	onStart,
}: HomeScreenProps) {
	return (
		<div className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-black px-6 py-12">
			<HomeHighlightReel clips={HOME_HIGHLIGHTS} />
			<div className="pointer-events-none fixed inset-0 bg-black/35" aria-hidden />
			<div
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.45)_62%,rgba(0,0,0,0.78)_100%)]"
				aria-hidden
			/>
			{view !== "signin" && view !== "profile" && community.enabled && !community.userEmail ? (
				<button
					type="button"
					onClick={() => onView("signin")}
					className={`fixed top-[max(1rem,var(--safe-top))] right-[max(1rem,var(--safe-right))] z-20 ${AUTH_BUTTON}`}
				>
					Sign in
				</button>
			) : null}
			<div
				className={`relative z-10 flex w-full flex-col items-center border border-white/10 bg-black/55 px-4 py-6 text-center backdrop-blur-xl sm:px-6 sm:py-8 ${
					view === "leaderboards" || view === "profile"
						? "max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto overscroll-contain"
						: "max-w-md"
				}`}
			>
				<BrandMark size={view === "menu" ? "lg" : "sm"} />
				<p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
					Counter-Strike legends draft
				</p>
				<h1 className="mt-2 text-4xl font-bold uppercase tracking-[0.16em] text-white sm:text-5xl">
					Major Winners
				</h1>

				{view === "menu" ? (
					<nav aria-label="Game modes" className="mt-10 flex w-full flex-col gap-3">
						<button type="button" onClick={() => onChoose("daily")} className={PRIMARY_BUTTON}>
							{hasDailyAttempt ? "Continue today's challenge" : "Today's challenge"}
						</button>
						<button type="button" onClick={() => onChoose("free")} className={SECONDARY_BUTTON}>
							{hasFreePlaySave ? "Continue free play" : "Free play"}
						</button>
						<button type="button" onClick={() => onChoose("custom")} className={SECONDARY_BUTTON}>
							Custom game seed
						</button>
						{community.enabled ? (
							<button
								type="button"
								onClick={() => onView("community")}
								className={SECONDARY_BUTTON}
							>
								Community
							</button>
						) : null}
						{community.enabled ? (
							<div className="grid w-full grid-cols-2 gap-3">
								<button
									type="button"
									onClick={() => onView("profile")}
									className={SECONDARY_BUTTON}
								>
									My profile
								</button>
								<button
									type="button"
									onClick={() => onView("leaderboards")}
									className={SECONDARY_BUTTON}
								>
									Leaderboards
								</button>
							</div>
						) : (
							<button type="button" onClick={() => onView("profile")} className={SECONDARY_BUTTON}>
								My profile
							</button>
						)}
					</nav>
				) : null}

				{view === "community" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-3">
						<div>
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								Community
							</h2>
							<p className="mt-2 text-sm text-zinc-400">
								Queue a ranked 1v1, host a private BO5, or play a Major against published teams.
							</p>
						</div>
						<button type="button" onClick={community.onRanked} className={PRIMARY_BUTTON}>
							{community.hasDuelSave && community.duelSaveKind === "ranked"
								? "Continue ranked match"
								: "Ranked match"}
						</button>
						<button
							type="button"
							onClick={() => (community.hasDuelSave ? onChoose("duel") : onView("private"))}
							className={SECONDARY_BUTTON}
						>
							{community.hasDuelSave && community.duelSaveKind !== "ranked"
								? "Continue private match"
								: "Private match"}
						</button>
						<button
							type="button"
							onClick={() => onChoose("community")}
							className={SECONDARY_BUTTON}
						>
							{community.hasSave
								? "Continue free play with community teams"
								: "Free play with community teams"}
						</button>
						<button type="button" onClick={() => onView("menu")} className={SECONDARY_BUTTON}>
							Back
						</button>
					</div>
				) : null}

				{view === "private" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-3">
						<div>
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								Private match
							</h2>
							<p className="mt-2 text-sm text-zinc-400">
								Create a lobby and share the code, or join one.
							</p>
						</div>
						<button type="button" onClick={() => onChoose("duel")} className={PRIMARY_BUTTON}>
							Create a lobby
						</button>
						<button type="button" onClick={() => onView("duel-join")} className={SECONDARY_BUTTON}>
							Join a lobby
						</button>
						<button type="button" onClick={() => onView("community")} className={SECONDARY_BUTTON}>
							Back
						</button>
					</div>
				) : null}

				{view === "ranked-handle" ? (
					<SetupForm
						title="Ranked handle"
						detail="This name appears on the Elo board. Letters, numbers, and underscore."
						onBack={() => onView("community")}
						onSubmit={community.onSubmitHandle}
						submitLabel="Find match"
					>
						<HomeField
							id="home-ranked-handle"
							label="Handle"
							value={community.handleDraft}
							onChange={community.onHandleDraft}
							error={community.handleError}
							placeholder="e.g. lore"
							maxLength={DISPLAY_NAME_MAX}
						/>
					</SetupForm>
				) : null}

				{view === "ranked" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-4">
						<div>
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								Finding opponent
							</h2>
							<p className="mt-2 text-sm text-zinc-400">
								Searching within ±{community.rankedWindow ?? 100} Elo
								{community.rankedElo !== null ? ` · you are ${community.rankedElo}` : ""}.
							</p>
						</div>
						{community.rankedError ? (
							<p role="alert" className="text-xs text-red-300">
								{community.rankedError}
							</p>
						) : null}
						<button type="button" onClick={community.onLeaveQueue} className={SECONDARY_BUTTON}>
							Cancel
						</button>
					</div>
				) : null}

				{view === "duel-join" ? (
					<SetupForm
						title="Join a lobby"
						detail="Enter the 6-character room code. You each draft, then veto maps for a BO5."
						onBack={() => onView("private")}
						onSubmit={community.onJoinDuel}
						submitLabel="Join lobby"
					>
						<HomeField
							id="home-duel-code"
							label="Room code"
							value={community.joinCode}
							onChange={community.onJoinCode}
							error={community.joinError}
							placeholder="e.g. K7M2QX"
							maxLength={6}
						/>
					</SetupForm>
				) : null}

				{view === "custom" ? (
					<SetupForm
						title="Custom game seed"
						detail="Same seed always produces the same draft and opponents."
						onBack={() => onView("menu")}
						onSubmit={onStart}
					>
						<HomeField
							id="home-seed"
							label="Seed"
							value={seedDraft}
							onChange={onSeedDraft}
							error={seedError}
							placeholder="e.g. 2026 or my-share-code"
							maxLength={CUSTOM_SEED_MAX}
						/>
					</SetupForm>
				) : null}

				{view === "signin" ? (
					<SetupForm
						title="Sign in"
						detail="Optional. Publishing still works without an account."
						onBack={() => onView("menu")}
						onSubmit={community.onSignIn}
						submitLabel={community.authBusy ? "Sending…" : "Send magic link"}
					>
						<HomeField
							id="home-email"
							label="Email"
							type="email"
							value={community.emailDraft}
							onChange={community.onEmailDraft}
							error={community.authError}
							placeholder="you@example.com"
							maxLength={120}
						/>
						{community.authMessage ? (
							<p className="text-sm text-emerald-200">{community.authMessage}</p>
						) : null}
					</SetupForm>
				) : null}

				{view === "profile" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-6 text-left">
						<div className="w-full text-center">
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								My profile
							</h2>
							{community.userEmail ? (
								<p className="mt-2 text-sm text-zinc-400">{community.userEmail}</p>
							) : null}
						</div>
						<div
							className={
								community.enabled && community.userEmail
									? "grid w-full gap-8 md:grid-cols-2 md:items-start lg:grid-cols-3"
									: "w-full max-w-lg"
							}
						>
							<DailyStatsPanel stats={stats} dataset={community.dataset} />
							{community.enabled && community.userEmail ? (
								<RankedStatsPanel profile={community.profile} />
							) : null}
							{community.enabled && community.userEmail ? (
								<BestTeamsPanel runs={community.myRuns} dataset={community.dataset} />
							) : null}
						</div>
						<div className="flex w-full max-w-md flex-row gap-3">
							{community.userEmail ? (
								<button type="button" onClick={community.onSignOut} className={`flex-1 ${PRIMARY_BUTTON}`}>
									Sign out
								</button>
							) : null}
							<button type="button" onClick={() => onView("menu")} className={`flex-1 ${SECONDARY_BUTTON}`}>
								Back
							</button>
						</div>
					</div>
				) : null}
				{view === "leaderboards" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-6">
						<HomeLeaderboards
							runs={community.runs}
							teams={community.teams}
							eloBoard={community.eloBoard}
							dataset={community.dataset}
							ratedPlayers={community.ratedPlayers}
						/>
						<button type="button" onClick={() => onView("menu")} className={SECONDARY_BUTTON}>
							Back
						</button>
					</div>
				) : null}
			</div>
		</div>
	);
}
