import type { ReactNode } from "react";
import type { PublishedRunSnapshot, SavedTeamSnapshot } from "../community";
import type { Dataset } from "../data";
import type { DailyStats, RatedPlayer } from "../engine";
import { summarizeDailyStats } from "../engine";
import { CUSTOM_SEED_MAX } from "./customSeed";
import { HomeHighlightReel } from "./HomeHighlightReel";
import { HomeLeaderboards } from "./HomeLeaderboards";
import { HOME_HIGHLIGHTS } from "./homeHighlights";

export type HomeView =
	| "menu"
	| "custom"
	| "signin"
	| "profile"
	| "leaderboards"
	| "community"
	| "private"
	| "duel-join";
export type HomeAction = "daily" | "free" | "custom" | "community" | "duel";

export type HomeCommunityProps = {
	enabled: boolean;
	hasSave: boolean;
	hasDuelSave: boolean;
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
	myTeams: readonly SavedTeamSnapshot[];
	dataset: Dataset;
	ratedPlayers: readonly RatedPlayer[];
	onEmailDraft: (value: string) => void;
	onSignIn: () => void;
	onSignOut: () => void;
	onPlayTeam: (team: SavedTeamSnapshot, mode: "free" | "community") => void;
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
	"border border-white/20 bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-xl transition hover:border-white/50 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";

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

export function DailyStatsPanel({ stats }: { stats: DailyStats }) {
	const summary = summarizeDailyStats(stats);
	const rows = [
		["Days played", summary.playedDays],
		["Completed", summary.completedRuns],
		["Championships", summary.championships],
		["Perfect 9–0s", summary.perfectRuns],
		["Current streak", summary.currentStreak],
		["Max streak", summary.maxStreak],
		["Win rate", `${summary.winRate}%`],
		["Best finish", summary.bestFinish],
	] as const;
	return (
		<section aria-labelledby="stats-heading" className="w-full">
			<h2
				id="stats-heading"
				className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
			>
				Daily challenge stats
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
			{view !== "signin" && view !== "profile" ? (
				<button
					type="button"
					onClick={() => onView(community.enabled && !community.userEmail ? "signin" : "profile")}
					className={`fixed top-4 right-4 z-20 ${AUTH_BUTTON}`}
				>
					{community.enabled && !community.userEmail ? "Sign in" : "My profile"}
				</button>
			) : null}
			<div
				className={`relative z-10 flex w-full flex-col items-center border border-white/10 bg-black/55 px-6 py-8 text-center backdrop-blur-xl ${
					view === "leaderboards" || view === "profile" ? "max-w-6xl" : "max-w-md"
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
							<button
								type="button"
								onClick={() => onView("leaderboards")}
								className={SECONDARY_BUTTON}
							>
								Leaderboards
							</button>
						) : null}
					</nav>
				) : null}

				{view === "community" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-3">
						<div>
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								Community
							</h2>
							<p className="mt-2 text-sm text-zinc-400">
								Play a Major against published teams, or host a private BO5.
							</p>
						</div>
						<button type="button" onClick={() => onChoose("community")} className={PRIMARY_BUTTON}>
							{community.hasSave ? "Continue versus community" : "Versus community"}
						</button>
						<button
							type="button"
							onClick={() => (community.hasDuelSave ? onChoose("duel") : onView("private"))}
							className={SECONDARY_BUTTON}
						>
							{community.hasDuelSave ? "Continue private match" : "Private match"}
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
						detail="Optional. A magic link lets you reuse teams you save while signed in."
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
									? "grid w-full gap-8 md:grid-cols-2 md:items-start"
									: "w-full max-w-lg"
							}
						>
							<DailyStatsPanel stats={stats} />
							{community.enabled && community.userEmail ? (
								<section aria-labelledby="profile-teams-heading" className="w-full">
									<h3
										id="profile-teams-heading"
										className="text-sm font-semibold uppercase tracking-[0.2em] text-white"
									>
										My teams
									</h3>
									<p className="mt-1 text-xs text-zinc-500">
										Reuse a saved roster and skip the draft.
									</p>
									{community.myTeams.length === 0 ? (
										<p className="mt-4 text-sm text-zinc-500">
											Save a finished run while signed in.
										</p>
									) : (
										<ul className="mt-4 flex max-h-[28rem] w-full flex-col gap-3 overflow-y-auto">
											{community.myTeams.map((team) => (
												<li key={team.id} className="border border-white/10 px-3 py-3">
													<p className="font-semibold text-white">{team.teamName}</p>
													<p className="text-xs text-zinc-500">{team.authorName}</p>
													<div className="mt-3 grid grid-cols-2 gap-2">
														<button
															type="button"
															className={SECONDARY_BUTTON}
															onClick={() => community.onPlayTeam(team, "free")}
														>
															Classic Major
														</button>
														<button
															type="button"
															className={SECONDARY_BUTTON}
															onClick={() => community.onPlayTeam(team, "community")}
														>
															Versus
														</button>
													</div>
												</li>
											))}
										</ul>
									)}
								</section>
							) : null}
						</div>
						<div className="flex w-full max-w-md flex-col gap-3">
							{community.userEmail ? (
								<button type="button" onClick={community.onSignOut} className={SECONDARY_BUTTON}>
									Sign out
								</button>
							) : null}
							<button type="button" onClick={() => onView("menu")} className={SECONDARY_BUTTON}>
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
