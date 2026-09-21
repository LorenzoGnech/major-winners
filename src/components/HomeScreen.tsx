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
	type SiteStats,
	uniqueBestPublishedRuns,
} from "../community";
import { type Dataset, indexPlayerSeasons, playerDisplayNick } from "../data";
import type { DailyStats, RatedPlayer } from "../engine";
import { summarizeDailyStats } from "../engine";
import { AppNav } from "./AppNav";
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
	dailyRuns: readonly PublishedRunSnapshot[];
	dailyDay: string;
	dailySeed: number;
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
	onSaveUsername: () => void;
	usernameBusy: boolean;
	onLeaveQueue: () => void;
	siteStats: SiteStats | null;
};

type HomeScreenProps = {
	view: HomeView;
	stats: DailyStats;
	hasDailyAttempt: boolean;
	dailyLocked: boolean;
	hasFreePlaySave: boolean;
	seedDraft: string;
	seedError: string | null;
	community: HomeCommunityProps;
	onView: (view: HomeView) => void;
	onSeedDraft: (value: string) => void;
	onChoose: (action: HomeAction) => void;
	onStart: () => void;
};

const MENU_BUTTON_BASE =
	"w-full border font-semibold uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";
const MENU_BUTTON = `${MENU_BUTTON_BASE} px-5 py-3.5 text-sm tracking-[0.22em] lg:py-3`;
const PRIMARY_BUTTON = `${MENU_BUTTON} border-transparent bg-[#e53935] text-white hover:bg-[#f04848]`;
const SECONDARY_BUTTON = `${MENU_BUTTON} border-white/20 bg-transparent text-white hover:border-white/50 hover:bg-white/5`;
const SPLIT_BUTTON = `${MENU_BUTTON_BASE} min-w-0 border-white/20 bg-transparent px-2 py-3.5 text-[11px] tracking-[0.08em] text-white hover:border-white/50 hover:bg-white/5 sm:px-4 sm:text-xs sm:tracking-[0.14em] lg:py-3`;
const FIELD_CLASS =
	"mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-center text-sm uppercase tracking-[0.18em] text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";

function BetaChip() {
	return (
		<span className="inline-flex items-center rounded-full border border-white/22 bg-white/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-300">
			Beta
		</span>
	);
}

function SiteStatsNote({ stats }: { stats: SiteStats | null }) {
	const shown = stats ?? {
		gamesPlayed: 0,
		savedTeams: 0,
		wins: 0,
		dailyRunsWon: 0,
		dailyRunsPlayed: 0,
	};
	const items = [
		[shown.gamesPlayed.toLocaleString("en-US"), "games played", "games played"],
		[shown.savedTeams.toLocaleString("en-US"), "saved teams", "saved teams"],
		[shown.wins.toLocaleString("en-US"), "majors won", "majors won"],
		[
			`${shown.dailyRunsWon.toLocaleString("en-US")}/${shown.dailyRunsPlayed.toLocaleString("en-US")}`,
			"daily runs",
			"daily runs won / daily runs played",
		],
	] as const;
	return (
		<p
			className={`mb-3 w-full text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 lg:mb-[clamp(0.35rem,1vh,0.75rem)] sm:text-[10px] sm:tracking-[0.14em] ${
				stats ? "" : "invisible"
			}`}
			aria-live="polite"
			aria-hidden={!stats}
		>
			{items.map(([value, label, spoken], index) => (
				<span key={label} title={spoken}>
					{index > 0 ? (
						<span className="mx-1.5 text-white/25" aria-hidden>
							·
						</span>
					) : null}
					<span className="tabular-nums text-zinc-300">{value}</span>
					{` ${label}`}
				</span>
			))}
		</p>
	);
}

function BrandMark({ size }: { size: "lg" | "sm" }) {
	return (
		<div className="relative flex items-center justify-center">
			<div className="absolute inset-6 rounded-full bg-[#e53935]/25 blur-3xl" />
			<img
				src="/logo.png"
				alt=""
				width={size === "lg" ? 220 : 120}
				height={size === "lg" ? 220 : 120}
				className={
					size === "lg"
						? "relative size-44 sm:size-52 lg:size-[clamp(8rem,20vh,13rem)]"
						: "relative size-24"
				}
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
				["Username", profile.displayName],
				["Elo", profile.elo],
				["Wins", profile.wins],
				["Losses", profile.losses],
				["Win rate", winRate === null ? "—" : `${winRate}%`],
				["Win streak", profile.streak],
			] as const)
		: ([
				["Username", "—"],
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
					? "Elo updates once both players report the same BO3 result."
					: "Sign in with a username to queue ranked."}
			</p>
			<dl className="mt-5 grid grid-cols-2 gap-2">
				{rows.map(([label, value]) => (
					<div
						key={label}
						className="min-w-0 overflow-hidden border border-white/10 px-2.5 py-3 sm:px-3"
					>
						<dt className="text-[9px] leading-snug uppercase tracking-normal text-zinc-500 sm:text-[10px] sm:tracking-[0.14em]">
							{label}
						</dt>
						<dd className="mt-1 wrap-break-word font-bold tabular-nums text-white">{value}</dd>
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
	const nicks = new Map(
		[...indexPlayerSeasons(dataset.playerSeasons)].map(([id, player]) => [
			id,
			playerDisplayNick(player),
		]),
	);
	const photos = indexPlayerSeasons(dataset.playerSeasons);
	return (
		<section aria-labelledby="best-teams-heading" className="w-full">
			<h2
				id="best-teams-heading"
				className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
			>
				Best teams
			</h2>
			<p className="mt-1 text-xs text-zinc-500">Your best saved Major runs.</p>
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
		[...indexPlayerSeasons(dataset.playerSeasons)].map(([id, player]) => [
			id,
			{ playerId: player.playerId, nick: playerDisplayNick(player) },
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
					<div
						key={label}
						className="min-w-0 overflow-hidden border border-white/10 px-2.5 py-3 sm:px-3"
					>
						<dt className="text-[9px] leading-snug uppercase tracking-normal text-zinc-500 sm:text-[10px] sm:tracking-[0.14em]">
							{label}
						</dt>
						<dd className="mt-1 wrap-break-word font-bold tabular-nums text-white">{value}</dd>
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
	dailyLocked,
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
		<div className="relative isolate flex min-h-dvh flex-col bg-black lg:h-dvh lg:overflow-hidden">
			<HomeHighlightReel clips={HOME_HIGHLIGHTS} />
			<div className="pointer-events-none fixed inset-0 bg-black/35" aria-hidden />
			<div
				className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.45)_62%,rgba(0,0,0,0.78)_100%)]"
				aria-hidden
			/>
			<AppNav onGoHome={() => onView("menu")} />
			<div
				className={`relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center py-8 sm:py-12 lg:py-4 ${
					view === "leaderboards" ? "px-3 sm:px-4" : "px-6"
				}`}
			>
				<div
					className={`flex w-full flex-col items-center border border-white/10 bg-black/55 px-4 py-6 text-center backdrop-blur-xl sm:px-6 sm:py-8 lg:py-[clamp(1rem,2.5vh,2rem)] ${
						view === "leaderboards"
							? "max-h-[calc(100dvh-var(--app-nav-height)-2rem)] max-w-[96rem] overflow-y-auto overscroll-contain lg:px-4"
							: view === "profile"
								? "max-h-[calc(100dvh-var(--app-nav-height)-2rem)] max-w-6xl overflow-y-auto overscroll-contain"
								: "max-w-md"
					}`}
				>
					{view === "menu" && community.enabled ? (
						<SiteStatsNote stats={community.siteStats} />
					) : null}
					<BrandMark size={view === "menu" ? "lg" : "sm"} />
					<p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400 lg:mt-[clamp(0.75rem,2vh,1.5rem)]">
						Counter-Strike fantasy draft
					</p>
					<h1 className="mt-2 text-4xl font-bold uppercase tracking-[0.16em] text-white sm:text-5xl lg:text-[clamp(1.875rem,4.5vh,3rem)]">
						Major Winners
					</h1>
					{view === "menu" ? (
						<p className="mt-3 text-sm leading-6 text-zinc-400">
							Create your own major-winning team
						</p>
					) : null}

					{view === "menu" ? (
						<nav
							aria-label="Game modes"
							className="mt-10 flex w-full flex-col gap-3 lg:mt-[clamp(1rem,3vh,2.5rem)]"
						>
							<button
								type="button"
								onClick={() => onChoose("daily")}
								disabled={dailyLocked}
								className={`${PRIMARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
							>
								{hasDailyAttempt
									? "Continue today's challenge"
									: dailyLocked
										? "Today's challenge complete"
										: "Today's challenge"}
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
									className={`${SECONDARY_BUTTON} inline-flex items-center justify-center gap-2`}
								>
									Community
									<BetaChip />
								</button>
							) : null}
							{community.enabled ? (
								<div className="grid w-full grid-cols-2 gap-3">
									{community.userEmail ? (
										<button
											type="button"
											onClick={() => onView("profile")}
											className={SPLIT_BUTTON}
										>
											My profile
										</button>
									) : (
										<button type="button" onClick={() => onView("signin")} className={SPLIT_BUTTON}>
											Sign in
										</button>
									)}
									<button
										type="button"
										onClick={() => onView("leaderboards")}
										className={SPLIT_BUTTON}
									>
										Leaderboards
									</button>
								</div>
							) : (
								<button
									type="button"
									onClick={() => onView("profile")}
									className={SECONDARY_BUTTON}
								>
									My profile
								</button>
							)}
							<a
								href="/legal"
								className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 underline decoration-zinc-500/40 underline-offset-4 transition hover:text-zinc-300 hover:decoration-zinc-300"
							>
								Legal & privacy
							</a>
						</nav>
					) : null}

					{view === "community" ? (
						<div className="mt-8 flex w-full flex-col items-center gap-3">
							<div>
								<h2 className="inline-flex items-center justify-center gap-2 text-lg font-semibold uppercase tracking-[0.18em] text-white">
									Community
									<BetaChip />
								</h2>
								<p className="mt-2 text-sm text-zinc-400">
									Ranked 1v1, private BO3, or a Major vs published teams.
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
								<p className="mt-2 text-sm text-zinc-400">Host a lobby or join with a code.</p>
							</div>
							<button type="button" onClick={() => onChoose("duel")} className={PRIMARY_BUTTON}>
								Create a lobby
							</button>
							<button
								type="button"
								onClick={() => onView("duel-join")}
								className={SECONDARY_BUTTON}
							>
								Join a lobby
							</button>
							<button
								type="button"
								onClick={() => onView("community")}
								className={SECONDARY_BUTTON}
							>
								Back
							</button>
						</div>
					) : null}

					{view === "ranked-handle" ? (
						<SetupForm
							title="Username"
							detail="Shown on saved teams and ranked matches. 3–16 letters, numbers, or underscore."
							onBack={() => onView("community")}
							onSubmit={community.onSubmitHandle}
							submitLabel="Find match"
						>
							<HomeField
								id="home-ranked-handle"
								label="Username"
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
							detail="Enter the room code. You both draft, then veto maps for a BO3."
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
							detail="Same seed, same draft and opponents."
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
							detail="Play stays in this browser. Sign in only if you want teams and scores on other devices. You can still publish without an account."
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
							<HomeField
								id="home-username"
								label="Username"
								value={community.handleDraft}
								onChange={community.onHandleDraft}
								error={community.handleError}
								placeholder="e.g. lore"
								maxLength={DISPLAY_NAME_MAX}
							/>
							{community.authMessage ? (
								<p className="text-sm text-emerald-200">{community.authMessage}</p>
							) : null}
							<a
								href="/legal"
								className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 underline decoration-zinc-500/40 underline-offset-4 transition hover:text-zinc-300 hover:decoration-zinc-300"
							>
								Legal & privacy
							</a>
						</SetupForm>
					) : null}

					{view === "profile" ? (
						<div className="mt-8 flex w-full flex-col items-center gap-6 text-left">
							<div className="w-full text-center">
								<h2 className="text-base font-semibold uppercase tracking-[0.12em] text-white sm:text-lg sm:tracking-[0.18em]">
									My profile
								</h2>
								{community.userEmail ? (
									<p className="mt-2 text-sm text-zinc-400">{community.userEmail}</p>
								) : null}
							</div>
							{community.enabled && community.userEmail ? (
								<form
									className="flex w-full max-w-lg flex-col items-center gap-3"
									onSubmit={(event) => {
										event.preventDefault();
										community.onSaveUsername();
									}}
								>
									<HomeField
										id="profile-username"
										label="Username"
										value={community.handleDraft}
										onChange={community.onHandleDraft}
										error={community.handleError}
										placeholder="e.g. lore"
										maxLength={DISPLAY_NAME_MAX}
									/>
									<p className="text-xs text-zinc-500">
										Shown on saved teams and ranked matches. 3–16 letters, numbers, or underscore.
									</p>
									<button
										type="submit"
										disabled={community.usernameBusy}
										className={`${PRIMARY_BUTTON} disabled:opacity-50`}
									>
										{community.usernameBusy
											? "Saving…"
											: community.profile
												? "Save username"
												: "Set username"}
									</button>
								</form>
							) : null}
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
									<button
										type="button"
										onClick={community.onSignOut}
										className={`flex-1 ${PRIMARY_BUTTON}`}
									>
										Sign out
									</button>
								) : null}
								<button
									type="button"
									onClick={() => onView("menu")}
									className={`flex-1 ${SECONDARY_BUTTON}`}
								>
									Back
								</button>
							</div>
						</div>
					) : null}
					{view === "leaderboards" ? (
						<div className="mt-8 flex w-full flex-col items-center gap-6">
							<HomeLeaderboards
								runs={community.runs}
								dailyRuns={community.dailyRuns}
								dailySeed={community.dailySeed}
								dailyDay={community.dailyDay}
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
		</div>
	);
}
