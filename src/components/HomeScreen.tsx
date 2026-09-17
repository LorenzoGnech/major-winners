import type { ReactNode } from "react";
import type { DailyIdentity, DailyStats } from "../engine";
import { summarizeDailyStats } from "../engine";
import { CUSTOM_SEED_MAX } from "./customSeed";
import { TEAM_NAME_MAX } from "./teamName";

export type HomeView = "menu" | "daily" | "free" | "custom" | "stats";

type HomeScreenProps = {
	view: HomeView;
	identity: DailyIdentity;
	stats: DailyStats;
	hasDailyAttempt: boolean;
	hasFreePlaySave: boolean;
	nameDraft: string;
	nameError: string | null;
	seedDraft: string;
	seedError: string | null;
	onView: (view: HomeView) => void;
	onNameDraft: (value: string) => void;
	onSeedDraft: (value: string) => void;
	onChoose: (action: "daily" | "free" | "custom" | "stats") => void;
	onStart: () => void;
};

const MENU_BUTTON =
	"w-full border px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.22em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";
const PRIMARY_BUTTON = `${MENU_BUTTON} border-transparent bg-[#e53935] text-white hover:bg-[#f04848]`;
const SECONDARY_BUTTON = `${MENU_BUTTON} border-white/20 bg-transparent text-white hover:border-white/50 hover:bg-white/5`;
const FIELD_CLASS =
	"mt-2 w-full border border-white/20 bg-black px-3 py-3 text-center text-base text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e53935]";

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
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
	placeholder: string;
	maxLength: number;
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
				value={value}
				maxLength={maxLength}
				autoComplete="off"
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
	children,
}: {
	title: string;
	detail: string;
	onBack: () => void;
	onSubmit: () => void;
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
				Start
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
	identity,
	stats,
	hasDailyAttempt,
	hasFreePlaySave,
	nameDraft,
	nameError,
	seedDraft,
	seedError,
	onView,
	onNameDraft,
	onSeedDraft,
	onChoose,
	onStart,
}: HomeScreenProps) {
	const setupName = (
		<HomeField
			id="home-team-name"
			label="Team name"
			value={nameDraft}
			onChange={onNameDraft}
			error={nameError}
			placeholder="e.g. Copenhagen Flames"
			maxLength={TEAM_NAME_MAX}
		/>
	);

	return (
		<div className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 py-12">
			<div className="flex w-full max-w-sm flex-col items-center text-center">
				<BrandMark size={view === "menu" ? "lg" : "sm"} />
				<p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
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
						<button type="button" onClick={() => onChoose("stats")} className={SECONDARY_BUTTON}>
							Stats
						</button>
					</nav>
				) : null}

				{view === "daily" ? (
					<SetupForm
						title="Today's challenge"
						detail={`${identity.day} UTC · same seed for everyone.`}
						onBack={() => onView("menu")}
						onSubmit={onStart}
					>
						{setupName}
					</SetupForm>
				) : null}

				{view === "free" ? (
					<SetupForm
						title="Free play"
						detail="A random draft, separate from today’s attempt."
						onBack={() => onView("menu")}
						onSubmit={onStart}
					>
						{setupName}
					</SetupForm>
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
						{setupName}
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
			</div>
		</div>
	);
}
