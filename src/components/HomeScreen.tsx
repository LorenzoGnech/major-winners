import type { ReactNode } from "react";
import type { PublishedRunSnapshot, SavedTeamSnapshot } from "../community";
import type { Dataset } from "../data";
import type { DailyStats, RatedPlayer } from "../engine";
import { summarizeDailyStats } from "../engine";
import { CUSTOM_SEED_MAX } from "./customSeed";
import { HomeHighlightReel } from "./HomeHighlightReel";
import { HomeLeaderboards } from "./HomeLeaderboards";
import { HOME_HIGHLIGHTS } from "./homeHighlights";

export type HomeView = "menu" | "custom" | "stats" | "signin" | "teams" | "leaderboards";
export type HomeAction = "daily" | "free" | "custom" | "stats" | "community";

export type HomeCommunityProps = {
	enabled: boolean;
	hasSave: boolean;
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
			{community.enabled && view !== "signin" && view !== "teams" ? (
				<button
					type="button"
					onClick={() => onView(community.userEmail ? "teams" : "signin")}
					className={`fixed top-4 right-4 z-20 ${AUTH_BUTTON}`}
				>
					{community.userEmail ? "My teams" : "Sign in"}
				</button>
			) : null}
			<div className="relative z-10 flex w-full max-w-md flex-col items-center border border-white/10 bg-black/55 px-6 py-8 text-center backdrop-blur-xl">
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
							Custom game
						</button>
						{community.enabled ? (
							<button
								type="button"
								onClick={() => onChoose("community")}
								className={SECONDARY_BUTTON}
							>
								{community.hasSave ? "Continue versus community" : "Versus community"}
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
						<button type="button" onClick={() => onChoose("stats")} className={SECONDARY_BUTTON}>
							Stats
						</button>
					</nav>
				) : null}

				{view === "custom" ? (
					<SetupForm
						title="Custom game"
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

				{view === "stats" ? (
					<div className="mt-10 flex w-full flex-col items-center gap-6">
						<DailyStatsPanel stats={stats} />
						<button type="button" onClick={() => onView("menu")} className={SECONDARY_BUTTON}>
							Back
						</button>
					</div>
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

				{view === "teams" ? (
					<div className="mt-8 flex w-full flex-col items-center gap-4 text-left">
						<div className="w-full text-center">
							<h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-white">
								My teams
							</h2>
							<p className="mt-2 text-sm text-zinc-400">{community.userEmail}</p>
						</div>
						{community.myTeams.length === 0 ? (
							<p className="text-sm text-zinc-500">Save a finished run while signed in.</p>
						) : (
							<ul className="flex w-full flex-col gap-3">
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
						<button type="button" onClick={community.onSignOut} className={SECONDARY_BUTTON}>
							Sign out
						</button>
						<button type="button" onClick={() => onView("menu")} className={SECONDARY_BUTTON}>
							Back
						</button>
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
