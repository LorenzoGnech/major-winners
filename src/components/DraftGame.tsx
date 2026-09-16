import { useEffect, useMemo, useState } from "react";
import type { Coach, Dataset, Game, Org, OrgTier, PlayerSeason, Role } from "../data";
import { ROLES } from "../data";
import {
	applyAction,
	buildHistoricalOpponents,
	buildTeamProfile,
	type CompletedDraft,
	createTournament,
	currentCard,
	type DailyResult,
	type DailyStats,
	type DraftState,
	dailyIdentity,
	dailyResultFromTournament,
	EMPTY_DAILY_STATS,
	formatDailyShare,
	getCompletedDraft,
	markDailyPlayed,
	ratePlayer,
	ratePlayers,
	recordDailyResult,
	roleFit,
	startDraft,
	summarizeDailyStats,
	type TeamProfile,
	type TournamentState,
} from "../engine";
import {
	clearDailyAttempt,
	DAILY_ATTEMPT_STORAGE_VERSION,
	fallbackDailyStats,
	loadDailyAttempt,
	loadDailyStats,
	saveDailyAttempt,
	saveDailyStats,
} from "./dailyPersistence";
import { OrgCrest } from "./OrgCrest";
import { TournamentRun } from "./TournamentRun";
import { DEFAULT_TEAM_NAME, parseTeamName, TEAM_NAME_MAX } from "./teamName";
import {
	parsePersistedTournamentRun,
	TOURNAMENT_STORAGE_KEY,
	TOURNAMENT_STORAGE_VERSION,
} from "./tournamentPersistence";

const INITIAL_SEED = 0x4d_41_4a_4f;
type GameMode = "daily" | "free";

const ROLE_LABELS: Record<Role, string> = {
	awp: "AWP",
	igl: "IGL",
	entry: "Entry",
	support: "Support",
	lurker: "Lurker",
};

const GAME_LABELS: Record<Game, string> = {
	cs16: "Counter-Strike 1.6",
	css: "Counter-Strike: Source",
	csgo: "CS:GO",
	cs2: "Counter-Strike 2",
};

const TIER_LABELS: Record<OrgTier, string> = {
	legendary: "Legendary",
	strong: "Strong",
	cult: "Cult",
};

const TIER_STYLES: Record<OrgTier, string> = {
	legendary: "border-amber-300/40 bg-amber-300/10 text-amber-200",
	strong: "border-sky-300/40 bg-sky-300/10 text-sky-200",
	cult: "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200",
};

type DraftGameProps = {
	dataset: Dataset;
};

type FitInfo = {
	label: "Primary" | "Secondary" | "Off-role";
	multiplier: 1 | 0.9 | 0.75;
};

function freePlaySeed(): number {
	if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
		return crypto.getRandomValues(new Uint32Array(1))[0] ?? INITIAL_SEED;
	}
	return Date.now() >>> 0;
}

function fitInfo(player: Pick<PlayerSeason, "primaryRole" | "roles">, role: Role): FitInfo {
	const multiplier = roleFit(player, role);
	if (multiplier === 1) {
		return { label: "Primary", multiplier };
	}
	if (multiplier === 0.9) {
		return { label: "Secondary", multiplier };
	}
	return { label: "Off-role", multiplier };
}

function TeamNameField({
	id,
	value,
	onChange,
	error,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
}) {
	return (
		<div>
			<label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
				Your team name
			</label>
			<input
				id={id}
				value={value}
				maxLength={TEAM_NAME_MAX}
				autoComplete="off"
				placeholder="e.g. Copenhagen Flames"
				onChange={(event) => onChange(event.target.value)}
				className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
			/>
			<p className="mt-1.5 text-[11px] text-zinc-500">Used on the draft board and every match.</p>
			{error ? (
				<p role="alert" className="mt-1.5 text-xs text-red-200">
					{error}
				</p>
			) : null}
		</div>
	);
}

function signedModifier(value: number): string {
	return value > 0 ? `+${value}` : String(value);
}

function accolades(player: PlayerSeason): string[] {
	const labels: string[] = [];
	if (player.accolades.majorWins > 0) {
		labels.push(`${player.accolades.majorWins}× Major winner`);
	}
	if (player.accolades.majorMvps > 0) {
		labels.push(`${player.accolades.majorMvps}× Major MVP`);
	}
	if (player.accolades.eventMvps > 0) {
		labels.push(`${player.accolades.eventMvps}× event MVP`);
	}
	if (player.accolades.top20Rank) {
		labels.push(`#${player.accolades.top20Rank} Top 20`);
	}
	return labels;
}

function PlayerCard({
	player,
	selected,
	onSelect,
}: {
	player: PlayerSeason;
	selected: boolean;
	onSelect: () => void;
}) {
	const rated = ratePlayer(player);
	const playerAccolades = accolades(player);
	const statRows = player.stats
		? [
				["Rating", player.stats.rating.toFixed(2)],
				["K–D", `${player.stats.kpr.toFixed(2)} / ${player.stats.dpr.toFixed(2)}`],
				player.stats.adr === undefined ? null : ["ADR", player.stats.adr.toFixed(1)],
				player.stats.kast === undefined ? null : ["KAST", `${player.stats.kast.toFixed(1)}%`],
			].filter((row): row is string[] => row !== null)
		: [
				["Aim", String(rated.attributes.aim)],
				["Clutch", String(rated.attributes.clutch)],
				["Consistency", String(rated.attributes.consistency)],
			];

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onSelect}
			className={`group relative w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
				selected
					? "border-emerald-300 bg-emerald-300/10 ring-1 ring-emerald-300"
					: "border-white/10 bg-zinc-900/80 hover:border-white/25 hover:bg-zinc-900"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-lg font-semibold tracking-tight text-white">{player.nick}</p>
					<p className="mt-0.5 text-xs text-zinc-500">
						{player.nationality} · {player.year}
					</p>
				</div>
				<div className="min-w-14 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center">
					<span className="block text-[10px] uppercase tracking-wider text-zinc-500">OVR</span>
					<span className="text-xl font-bold tabular-nums text-white">{rated.ovr}</span>
				</div>
			</div>

			<div className="mt-3 flex flex-wrap gap-1.5">
				<span className="rounded-md bg-emerald-300/15 px-2 py-1 text-[11px] font-semibold text-emerald-200">
					{ROLE_LABELS[player.primaryRole]} · primary
				</span>
				{player.roles
					.filter((role) => role !== player.primaryRole)
					.map((role) => (
						<span key={role} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-300">
							{ROLE_LABELS[role]} · secondary
						</span>
					))}
			</div>

			<dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/8 pt-3">
				{statRows.map(([label, value]) => (
					<div key={label} className="flex items-baseline justify-between gap-2">
						<dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
						<dd className="text-xs font-medium tabular-nums text-zinc-200">{value}</dd>
					</div>
				))}
			</dl>

			<div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
				<span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
					{player.dataRegime} data
				</span>
				{playerAccolades.slice(0, 2).map((label) => (
					<span
						key={label}
						className="rounded-full border border-amber-300/20 px-2 py-0.5 text-[10px] text-amber-200"
					>
						{label}
					</span>
				))}
			</div>

			<p
				className={`mt-3 text-xs font-semibold ${selected ? "text-emerald-200" : "text-zinc-500"}`}
			>
				{selected ? "Selected — choose an empty role" : "Select player"}
			</p>
		</button>
	);
}

function RosterPanel({
	state,
	playersById,
	previewOvr,
	teamName,
}: {
	state: DraftState;
	playersById: Map<string, PlayerSeason>;
	previewOvr: number | null;
	teamName: string;
}) {
	return (
		<section
			aria-labelledby="roster-title"
			className="rounded-2xl border border-white/10 bg-black/25 p-3"
		>
			<div className="mb-3 flex items-end justify-between gap-4 px-1">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Live roster
					</p>
					<h2 id="roster-title" className="mt-0.5 text-lg font-semibold text-white">
						{teamName}
					</h2>
				</div>
				<div className="text-right">
					<span className="block text-[10px] uppercase tracking-wide text-zinc-500">Draft OVR</span>
					<span className="text-2xl font-bold tabular-nums text-white">
						{previewOvr === null ? "—" : previewOvr.toFixed(1)}
					</span>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1">
				{ROLES.map((role) => {
					const pick = state.roster[role];
					const player = pick ? playersById.get(pick.playerSeasonId) : undefined;
					const ovr = player ? ratePlayer(player).ovr : null;
					return (
						<div
							key={role}
							className={`min-h-20 rounded-xl border p-2.5 ${
								player ? "border-white/15 bg-zinc-900" : "border-dashed border-white/10 bg-white/2"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
									{ROLE_LABELS[role]}
								</span>
								{pick && (
									<span className="text-[10px] tabular-nums text-emerald-300">
										{pick.fit.toFixed(2)}×
									</span>
								)}
							</div>
							{player ? (
								<div className="mt-2 flex items-end justify-between gap-2">
									<span className="truncate text-sm font-semibold text-zinc-100">
										{player.nick}
									</span>
									<span className="text-sm font-bold tabular-nums text-zinc-300">{ovr}</span>
								</div>
							) : (
								<p className="mt-2 text-xs text-zinc-600">Empty slot</p>
							)}
						</div>
					);
				})}
			</div>
			<p className="mt-3 px-1 text-[11px] leading-4 text-zinc-500">
				Preview = average player OVR × role fit.
			</p>
		</section>
	);
}

function CoachCard({
	coach,
	org,
	orgName,
	onPick,
}: {
	coach: Coach;
	org: Org | undefined;
	orgName: string;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPick}
			className="rounded-xl border border-white/10 bg-zinc-900/80 p-4 text-left transition hover:border-emerald-300/50 hover:bg-emerald-300/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 items-start gap-3">
					{org ? <OrgCrest org={org} size="sm" /> : null}
					<div>
						<p className="text-lg font-semibold text-white">{coach.nick}</p>
						<p className="mt-1 text-xs text-zinc-500">
							{orgName} · {coach.year} · {coach.nationality}
						</p>
					</div>
				</div>
				<span className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
					Coach
				</span>
			</div>
			<dl className="mt-4 grid grid-cols-3 gap-2">
				{(
					[
						["Comeback", coach.modifiers.comeback],
						["Economy", coach.modifiers.economy],
						["Anti-strat", coach.modifiers.antistrat],
					] as const
				).map(([label, value]) => (
					<div key={label} className="rounded-lg bg-black/30 p-2 text-center">
						<dt className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</dt>
						<dd className="mt-1 text-base font-bold tabular-nums text-emerald-200">
							{signedModifier(value)}
						</dd>
					</div>
				))}
			</dl>
			<p className="mt-3 text-xs font-semibold text-zinc-500">Select coach</p>
		</button>
	);
}

function TeamProfilePanel({ profile }: { profile: TeamProfile }) {
	const componentRows = [
		["Base strength", profile.components.baseStrength],
		["Chemistry", profile.components.chemistry],
		["Communication", profile.components.communication],
		["Structure", profile.components.structure],
		["Coaching", profile.components.coaching],
	] as const;
	const attributeRows = Object.entries(profile.attributes) as [string, number][];

	return (
		<div className="mt-5 space-y-4">
			<div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
				<div className="flex flex-col justify-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-center">
					<span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
						Team OVR
					</span>
					<span className="mt-1 text-5xl font-bold tabular-nums text-white">{profile.overall}</span>
				</div>
				<dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{componentRows.map(([label, value]) => (
						<div key={label} className="rounded-xl border border-white/10 bg-black/25 p-3">
							<dt className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</dt>
							<dd className="mt-1 text-xl font-bold tabular-nums text-zinc-100">{value}</dd>
						</div>
					))}
				</dl>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="rounded-xl border border-white/10 bg-black/25 p-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
						Strengths
					</h3>
					<ul className="mt-2 space-y-1.5 text-sm text-zinc-200">
						{profile.strengths.map((strength) => (
							<li key={strength}>+ {strength}</li>
						))}
					</ul>
				</div>
				<div className="rounded-xl border border-white/10 bg-black/25 p-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
						Weaknesses
					</h3>
					{profile.weaknesses.length > 0 ? (
						<ul className="mt-2 space-y-1.5 text-sm text-zinc-200">
							{profile.weaknesses.map((weakness) => (
								<li key={weakness}>– {weakness}</li>
							))}
						</ul>
					) : (
						<p className="mt-2 text-sm text-zinc-500">No major structural weakness.</p>
					)}
				</div>
			</div>

			<div className="rounded-xl border border-white/10 bg-black/25 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
						Aggregate attributes
					</h3>
					<p className="text-[10px] text-zinc-500">
						Coach: {profile.coach.nick} · comeback {profile.details.coaching.comebackResilience} ·
						economy {profile.details.coaching.economyDiscipline} · anti-strat{" "}
						{profile.details.coaching.antiStrat}
					</p>
				</div>
				<dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
					{attributeRows.map(([label, value]) => (
						<div key={label} className="rounded-lg bg-white/5 p-2 text-center">
							<dt className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</dt>
							<dd className="mt-1 font-bold tabular-nums text-zinc-100">{value}</dd>
						</div>
					))}
				</dl>
			</div>
		</div>
	);
}

function DailyStatsPanel({ stats }: { stats: DailyStats }) {
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
		<section
			aria-labelledby="stats-heading"
			className="rounded-2xl border border-white/10 bg-black/25 p-4"
		>
			<h2 id="stats-heading" className="font-semibold text-white">
				Daily challenge stats
			</h2>
			<p className="mt-1 text-xs text-zinc-500">Stored only in this browser.</p>
			<dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				{rows.map(([label, value]) => (
					<div key={label} className="rounded-lg bg-white/5 p-3">
						<dt className="text-[10px] uppercase text-zinc-500">{label}</dt>
						<dd className="mt-1 font-bold tabular-nums text-white">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
function DailySharePanel({ result, stats }: { result: DailyResult; stats: DailyStats }) {
	const [status, setStatus] = useState("");
	const url =
		typeof window === "undefined"
			? "https://major-winners.vercel.app/"
			: new URL("/", window.location.href).href;
	const text = formatDailyShare(result, url);
	async function copy() {
		try {
			if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
			else {
				const field = document.createElement("textarea");
				field.value = text;
				field.style.position = "fixed";
				field.style.opacity = "0";
				document.body.appendChild(field);
				field.select();
				const copied = document.execCommand("copy");
				field.remove();
				if (!copied) throw new Error("copy failed");
			}
			setStatus("Result copied.");
		} catch {
			setStatus("Copy failed. Select the result below to copy it.");
		}
	}
	async function share() {
		try {
			await navigator.share({ title: `Major Winners · ${result.day}`, text, url });
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError"))
				setStatus("Could not open the share sheet.");
		}
	}
	return (
		<div className="mt-4 space-y-4">
			<section
				aria-labelledby="share-heading"
				className="rounded-xl border border-emerald-300/25 p-4"
			>
				<h3 id="share-heading" className="font-semibold text-white">
					Share today’s result
				</h3>
				<pre className="mt-3 whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-6 text-zinc-200">
					{text}
				</pre>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={copy}
						className="rounded-lg bg-emerald-300 px-4 py-2 font-bold text-zinc-950"
					>
						Copy result
					</button>
					{typeof navigator !== "undefined" && typeof navigator.share === "function" && (
						<button
							type="button"
							onClick={share}
							className="rounded-lg border border-white/15 px-4 py-2"
						>
							Share…
						</button>
					)}
				</div>
				<p aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-400">
					{status}
				</p>
			</section>
			<DailyStatsPanel stats={stats} />
		</div>
	);
}

export function DraftGame({ dataset }: DraftGameProps) {
	const [state, setState] = useState(() => startDraft(dataset, INITIAL_SEED));
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tournament, setTournament] = useState<TournamentState | null>(null);
	const [mode, setMode] = useState<GameMode | null>(null);
	const [identity, setIdentity] = useState(() => dailyIdentity());
	const [dailyStats, setDailyStats] = useState<DailyStats>(EMPTY_DAILY_STATS);
	const [teamName, setTeamName] = useState(DEFAULT_TEAM_NAME);
	const [nameDraft, setNameDraft] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const [pendingRestart, setPendingRestart] = useState(false);

	const playersById = useMemo(
		() => new Map(dataset.playerSeasons.map((player) => [player.id, player])),
		[dataset.playerSeasons],
	);
	const orgYearsById = useMemo(
		() => new Map(dataset.orgYears.map((orgYear) => [orgYear.id, orgYear])),
		[dataset.orgYears],
	);
	const majorsById = useMemo(
		() => new Map(dataset.majors.map((major) => [major.id, major])),
		[dataset.majors],
	);
	const orgsById = useMemo(() => new Map(dataset.orgs.map((org) => [org.id, org])), [dataset.orgs]);
	const coachesById = useMemo(
		() => new Map(dataset.coaches.map((coach) => [coach.id, coach])),
		[dataset.coaches],
	);
	const ratedPlayers = useMemo(() => ratePlayers(dataset.playerSeasons), [dataset.playerSeasons]);
	const opponents = useMemo(
		() => buildHistoricalOpponents(dataset, ratedPlayers),
		[dataset, ratedPlayers],
	);

	useEffect(() => {
		setIdentity(dailyIdentity());
		try {
			setDailyStats(loadDailyStats(window.localStorage));
		} catch {}
	}, []);
	function chooseMode(nextMode: GameMode) {
		setSelectedPlayerId(null);
		setError(null);
		setPendingRestart(false);
		if (nextMode === "daily") {
			const today = dailyIdentity();
			let attempt = null;
			let stats = dailyStats;
			try {
				attempt = loadDailyAttempt(window.localStorage, dataset, today.day, today.seed);
				stats = markDailyPlayed(loadDailyStats(window.localStorage), today.day);
				saveDailyStats(window.localStorage, stats);
			} catch {
				stats = markDailyPlayed(fallbackDailyStats(), today.day);
			}
			const name = attempt?.teamName ?? parseTeamName(nameDraft);
			if (!attempt && !name) {
				setNameError("Name your team to start today’s challenge.");
				return;
			}
			setIdentity(today);
			setDailyStats(stats);
			setTeamName(name ?? DEFAULT_TEAM_NAME);
			setNameError(null);
			setState(attempt?.draft ?? startDraft(dataset, today.seed));
			setTournament(attempt?.tournament ?? null);
			setMode("daily");
			return;
		}
		let persisted = null;
		try {
			persisted = parsePersistedTournamentRun(
				window.localStorage.getItem(TOURNAMENT_STORAGE_KEY) ?? "",
				dataset,
			);
		} catch {
			// Storage may be unavailable in privacy-restricted browser contexts.
		}
		if (persisted) {
			const draft = persisted.draft;
			setTeamName(persisted.teamName ?? DEFAULT_TEAM_NAME);
			setNameError(null);
			setState({
				...draft,
				phase: { type: "complete" },
				coachIds: dataset.coaches.map((coach) => coach.id),
				rerolls: { majorRemaining: false, teamRemaining: false },
				coachId: draft.coachId,
			});
			setTournament(persisted.tournament);
		} else {
			const name = parseTeamName(nameDraft);
			if (!name) {
				setNameError("Name your team to start Free Play.");
				return;
			}
			setTeamName(name);
			setNameError(null);
			setState(startDraft(dataset, freePlaySeed()));
			setTournament(null);
		}
		setMode("free");
	}

	function requestNewDraft() {
		setPendingRestart(true);
		setNameDraft(teamName === DEFAULT_TEAM_NAME ? "" : teamName);
		setNameError(null);
	}

	function confirmNewDraft() {
		const name = parseTeamName(nameDraft);
		if (!name) {
			setNameError("Name your team to start a new draft.");
			return;
		}
		setTeamName(name);
		setNameError(null);
		setPendingRestart(false);
		setState(startDraft(dataset, mode === "daily" ? identity.seed : freePlaySeed()));
		setSelectedPlayerId(null);
		setError(null);
		setTournament(null);
		try {
			if (mode === "daily") clearDailyAttempt(window.localStorage);
			else window.localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
		} catch {
			// The in-memory reset is authoritative.
		}
	}

	const card = currentCard(state);
	const selectedPlayer = selectedPlayerId ? playersById.get(selectedPlayerId) : undefined;
	const pickedPlayers = ROLES.flatMap((role) => {
		const pick = state.roster[role];
		const player = pick ? playersById.get(pick.playerSeasonId) : undefined;
		return pick && player ? [{ pick, player }] : [];
	});
	const previewOvr =
		pickedPlayers.length === 0
			? null
			: pickedPlayers.reduce(
					(total, { pick, player }) => total + ratePlayer(player).ovr * pick.fit,
					0,
				) / pickedPlayers.length;

	function assignRole(role: Role) {
		if (!selectedPlayerId) {
			return;
		}
		const result = applyAction(state, {
			type: "pickPlayer",
			playerSeasonId: selectedPlayerId,
			role,
		});
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		setState(result.value);
		setSelectedPlayerId(null);
		setError(null);
	}

	function pickCoach(coachId: string) {
		const result = applyAction(state, { type: "pickCoach", coachId });
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		setState(result.value);
		setError(null);
	}

	function reroll(type: "rerollMajor" | "rerollTeam") {
		const result = applyAction(state, { type }, dataset);
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		setState(result.value);
		setSelectedPlayerId(null);
		setError(null);
	}

	const orgYear = card ? orgYearsById.get(card.orgYearId) : undefined;
	const org = orgYear ? orgsById.get(orgYear.orgId) : undefined;
	const major = orgYear?.majorId ? majorsById.get(orgYear.majorId) : undefined;
	const chosenCoach = state.coachId ? coachesById.get(state.coachId) : undefined;
	const completedDraft = getCompletedDraft(state);
	const teamProfile =
		completedDraft && chosenCoach
			? buildTeamProfile({
					draft: completedDraft,
					playerSeasons: dataset.playerSeasons,
					ratedPlayers,
					coach: chosenCoach,
				})
			: null;

	function startMajor() {
		if (!completedDraft || !teamProfile) return;
		setTournament(
			createTournament({
				rootSeed: completedDraft.seed,
				playerTeam: teamProfile,
				opponents,
			}),
		);
	}

	useEffect(() => {
		if (mode !== "free" || !tournament || !completedDraft) return;
		try {
			window.localStorage.setItem(
				TOURNAMENT_STORAGE_KEY,
				JSON.stringify({
					version: TOURNAMENT_STORAGE_VERSION,
					rootSeed: tournament.rootSeed,
					draft: completedDraft satisfies CompletedDraft,
					tournament,
					teamName,
				}),
			);
		} catch {
			// The run remains playable if storage is unavailable or full.
		}
	}, [completedDraft, mode, teamName, tournament]);
	useEffect(() => {
		if (mode !== "daily") return;
		try {
			saveDailyAttempt(window.localStorage, {
				version: DAILY_ATTEMPT_STORAGE_VERSION,
				day: identity.day,
				seed: identity.seed,
				draft: state,
				tournament,
				teamName,
			});
		} catch {}
	}, [identity, mode, state, teamName, tournament]);
	useEffect(() => {
		if (mode !== "daily" || !tournament) return;
		const result = dailyResultFromTournament(identity.day, tournament);
		if (!result) return;
		setDailyStats((stats) => {
			const next = recordDailyResult(stats, result);
			try {
				saveDailyStats(window.localStorage, next);
			} catch {}
			return next;
		});
	}, [identity.day, mode, tournament]);
	const dailyResult =
		mode === "daily" && tournament ? dailyResultFromTournament(identity.day, tournament) : null;
	if (mode === null) {
		return (
			<div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
				<header>
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
						Counter-Strike legends draft
					</p>
					<h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">Major Winners</h1>
					<p className="mt-3 text-sm text-zinc-400">
						Name your squad, then choose today’s shared challenge or a random run.
					</p>
				</header>
				<main className="mt-8 space-y-6">
					<section aria-labelledby="mode-heading">
						<h2 id="mode-heading" className="font-semibold text-white">
							Choose a mode
						</h2>
						<div className="mt-4 max-w-md">
							<TeamNameField
								id="home-team-name"
								value={nameDraft}
								onChange={(value) => {
									setNameDraft(value);
									setNameError(null);
								}}
								error={nameError}
							/>
						</div>
						<div className="mt-3 grid gap-3 sm:grid-cols-2">
							<button
								type="button"
								onClick={() => chooseMode("daily")}
								className="rounded-2xl border border-emerald-300/35 bg-emerald-300/8 p-5 text-left focus-visible:outline-2 focus-visible:outline-emerald-300"
							>
								<strong className="text-xl text-white">Today’s Challenge</strong>
								<span className="mt-2 block text-sm text-zinc-300">
									Same UTC seed for everyone. Continuing a saved attempt keeps its team name.
								</span>
								<span className="mt-4 block text-xs font-semibold tabular-nums text-emerald-200">
									{identity.day} UTC · {identity.id}
								</span>
							</button>
							<button
								type="button"
								onClick={() => chooseMode("free")}
								className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left focus-visible:outline-2 focus-visible:outline-emerald-300"
							>
								<strong className="text-xl text-white">Free Play</strong>
								<span className="mt-2 block text-sm text-zinc-400">
									A random draft, separate from today’s attempt.
								</span>
							</button>
						</div>
					</section>
					<DailyStatsPanel stats={dailyStats} />
				</main>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
			<header className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
						{mode === "daily"
							? `Today’s Challenge · ${identity.day} UTC · ${identity.id}`
							: "Free Play"}
					</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
						{teamName}
					</h1>
					<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
						Five eras. Five picks. One coach. Build your Counter-Strike legends roster.
					</p>
				</div>
				{!tournament && !pendingRestart && (
					<button
						type="button"
						onClick={requestNewDraft}
						className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
					>
						New draft
					</button>
				)}
			</header>

			<div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
				<main className="min-w-0">
					<div className="mb-5 lg:hidden">
						<RosterPanel
							state={state}
							playersById={playersById}
							previewOvr={previewOvr}
							teamName={teamName}
						/>
					</div>

					{pendingRestart && (
						<section className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/8 p-5">
							<h2 className="text-xl font-semibold text-white">Name the new draft</h2>
							<p className="mt-1 text-sm text-zinc-400">This replaces the current run.</p>
							<div className="mt-4 max-w-md">
								<TeamNameField
									id="restart-team-name"
									value={nameDraft}
									onChange={(value) => {
										setNameDraft(value);
										setNameError(null);
									}}
									error={nameError}
								/>
							</div>
							<div className="mt-4 flex flex-wrap gap-2">
								<button
									type="button"
									onClick={confirmNewDraft}
									className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200"
								>
									Start new draft
								</button>
								<button
									type="button"
									onClick={() => {
										setPendingRestart(false);
										setNameError(null);
									}}
									className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200"
								>
									Cancel
								</button>
							</div>
						</section>
					)}

					{!pendingRestart && tournament && teamProfile && (
						<TournamentRun
							state={tournament}
							playerTeam={teamProfile}
							playerTeamName={teamName}
							opponents={opponents}
							onChange={setTournament}
							onAbandon={requestNewDraft}
							terminalExtras={
								dailyResult ? (
									<DailySharePanel result={dailyResult} stats={dailyStats} />
								) : undefined
							}
						/>
					)}

					{!pendingRestart &&
						!tournament &&
						state.phase.type === "player" &&
						card &&
						orgYear &&
						org && (
							<section
								key={`round-${state.phase.round}`}
								aria-labelledby="round-heading"
								className="motion-safe:animate-[draft-reveal_360ms_ease-out]"
							>
								<div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4 sm:p-5">
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div className="flex min-w-0 items-start gap-4">
											<OrgCrest org={org} size="lg" />
											<div>
												<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
													Player round {state.phase.round + 1} of 5 ·{" "}
													{major ? major.shortName : "Legacy wildcard"}
												</p>
												<h2
													id="round-heading"
													className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
												>
													{org.name} <span className="text-zinc-500">{orgYear.year}</span>
												</h2>
												<p className="mt-1 text-sm text-zinc-400">
													{GAME_LABELS[orgYear.game]}
													{major ? ` · placed #${orgYear.placement}` : " · pre-Major legend"}
												</p>
											</div>
										</div>
										<span
											className={`rounded-full border px-3 py-1 text-xs font-semibold ${TIER_STYLES[orgYear.tier]}`}
										>
											{TIER_LABELS[orgYear.tier]} tier
										</span>
									</div>
									<div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
										<button
											type="button"
											disabled={!state.rerolls.majorRemaining}
											onClick={() => reroll("rerollMajor")}
											className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-sky-300/50 enabled:hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{state.rerolls.majorRemaining ? "Reroll Major · 1 left" : "Major reroll used"}
										</button>
										<button
											type="button"
											disabled={!state.rerolls.teamRemaining}
											onClick={() => reroll("rerollTeam")}
											className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition enabled:hover:border-emerald-300/50 enabled:hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{state.rerolls.teamRemaining ? "Reroll team · 1 left" : "Team reroll used"}
										</button>
										<p className="self-center text-[10px] text-zinc-500">
											One of each per draft. Rerolls apply to this card before you pick.
										</p>
									</div>
								</div>

								<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{card.players.map((draftable) => {
										const player = playersById.get(draftable.id);
										if (!player) {
											return null;
										}
										return (
											<PlayerCard
												key={player.id}
												player={player}
												selected={selectedPlayerId === player.id}
												onSelect={() =>
													setSelectedPlayerId((selected) =>
														selected === player.id ? null : player.id,
													)
												}
											/>
										);
									})}
								</div>

								<div
									aria-live="polite"
									className={`mt-4 rounded-2xl border p-4 ${
										selectedPlayer
											? "border-emerald-300/30 bg-emerald-300/5"
											: "border-white/10 bg-black/20"
									}`}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
												Assign role
											</p>
											<p className="mt-1 text-sm text-zinc-300">
												{selectedPlayer
													? `Choose an empty slot for ${selectedPlayer.nick}.`
													: "Select one player above to see their role fit."}
											</p>
										</div>
									</div>
									<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
										{ROLES.map((role) => {
											const occupied = state.roster[role] !== undefined;
											const fit = selectedPlayer ? fitInfo(selectedPlayer, role) : null;
											return (
												<button
													key={role}
													type="button"
													disabled={!selectedPlayer || occupied}
													onClick={() => assignRole(role)}
													className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-left transition enabled:hover:border-emerald-300/50 enabled:hover:bg-emerald-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
												>
													<span className="block text-xs font-semibold text-white">
														{ROLE_LABELS[role]}
													</span>
													<span className="mt-1 block text-[10px] text-zinc-400">
														{occupied
															? "Filled"
															: fit
																? `${fit.label} · ${fit.multiplier.toFixed(2)}×`
																: "Empty"}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							</section>
						)}

					{!pendingRestart && !tournament && state.phase.type === "coach" && (
						<section
							aria-labelledby="coach-heading"
							className="motion-safe:animate-[draft-reveal_360ms_ease-out]"
						>
							<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
								Final round · Coach
							</p>
							<h2
								id="coach-heading"
								className="mt-1 text-3xl font-semibold tracking-tight text-white"
							>
								Choose your sixth
							</h2>
							<p className="mt-2 text-sm text-zinc-400">
								Every coach is available. Their modifiers shape the run in the next phase.
							</p>
							<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
								{state.coachIds.map((coachId) => {
									const coach = coachesById.get(coachId);
									if (!coach) {
										return null;
									}
									return (
										<CoachCard
											key={coach.id}
											coach={coach}
											org={orgsById.get(coach.orgId)}
											orgName={orgsById.get(coach.orgId)?.name ?? coach.orgId}
											onPick={() => pickCoach(coach.id)}
										/>
									);
								})}
							</div>
						</section>
					)}

					{!pendingRestart &&
						!tournament &&
						state.phase.type === "complete" &&
						chosenCoach &&
						teamProfile && (
							<section
								aria-labelledby="complete-heading"
								className="rounded-2xl border border-emerald-300/30 bg-emerald-300/7 p-5 motion-safe:animate-[draft-reveal_360ms_ease-out] sm:p-7"
							>
								<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
									Draft complete
								</p>
								<h2
									id="complete-heading"
									className="mt-1 text-3xl font-semibold tracking-tight text-white"
								>
									{teamName} is locked in
								</h2>
								<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
									Five players and {chosenCoach.nick} are locked in. This profile combines
									individual quality, role fit, teammate history, communication, structure, and
									coaching.
								</p>
								<TeamProfilePanel profile={teamProfile} />
								<div className="mt-5 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={startMajor}
										className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
									>
										Start Major run
									</button>
									<button
										type="button"
										onClick={requestNewDraft}
										className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
									>
										Start another draft
									</button>
								</div>
							</section>
						)}

					{error && (
						<p
							role="alert"
							className="mt-4 rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200"
						>
							{error}
						</p>
					)}
				</main>

				<aside className="sticky top-5 hidden lg:block">
					<RosterPanel
						state={state}
						playersById={playersById}
						previewOvr={previewOvr}
						teamName={teamName}
					/>
					<p className="mt-3 text-center text-[10px] tabular-nums text-zinc-600">
						{mode === "daily" ? `${identity.id} · UTC seed ${state.seed}` : `Seed ${state.seed}`}
					</p>
				</aside>
			</div>
		</div>
	);
}
