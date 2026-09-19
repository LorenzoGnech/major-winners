import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
	authorNameFromProfile,
	buildCommunityOpponents,
	clearPendingDisplayName,
	clearPersistedDuel,
	createDuel,
	DUEL_POLL_MS,
	DUEL_STORAGE_VERSION,
	type DuelKind,
	type DuelRoom,
	type DuelSide,
	displayNameTaken,
	fetchBestRuns,
	fetchDuel,
	fetchEloLeaderboard,
	fetchMyProfile,
	fetchMyPublishedRuns,
	fetchSavedTeams,
	getSession,
	isCommunityEnabled,
	joinDuel,
	leaveRankedQueue,
	liveSeriesFromDuelRoom,
	loadPendingDisplayName,
	loadPersistedDuel,
	loadPublishedFingerprints,
	mergeOpponentPools,
	normalizeDuelCode,
	onAuthChange,
	otherSide,
	type PublishedRunSnapshot,
	parseDisplayName,
	publishFinishedRun,
	publishSavedTeam,
	queueRankedMatch,
	type RankedProfile,
	type RankedResult,
	recordDuelResult,
	rememberPendingDisplayName,
	rememberPublishedFingerprint,
	rosterForSide,
	runFingerprint,
	type SavedTeamSnapshot,
	savePersistedDuel,
	setDisplayName,
	sideIndex,
	signInWithMagicLink,
	signOut as signOutCommunity,
	snapshotDraftFields,
	submitDuelRoster,
	submitDuelVeto,
	submitRankedResult,
	teamFingerprint,
} from "../community";
import type { Coach, Dataset, Org, Role } from "../data";
import { isLegendaryCoach, ROLES } from "../data";
import {
	applyAction,
	buildHistoricalOpponents,
	buildTeamProfile,
	type CompletedDraft,
	canRerollMajor,
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
	type LiveSeriesState,
	markDailyPlayed,
	otherMajorAppearances,
	ratePlayer,
	ratePlayers,
	recordDailyResult,
	seriesFromLive,
	startDraft,
	startNextMap,
	summarizeDuelSeries,
	summarizeTournamentRun,
	type TeamProfile,
	type TournamentState,
} from "../engine";
import { AppNav } from "./AppNav";
import { parseCustomSeed } from "./customSeed";
import {
	CompactRosterBar,
	LiveRoster,
	PlayerDraftCard,
	PlayerDragGhost,
	usePlayerDrag,
} from "./DraftBoard.tsx";
import { DraftRoll, type DraftRollKind } from "./DraftRoll";
import { DuelSummary } from "./DuelSummary";
import { DuelRoomBanner, DuelVeto } from "./DuelVeto";
import {
	clearDailyAttempt,
	DAILY_ATTEMPT_STORAGE_VERSION,
	fallbackDailyStats,
	loadDailyAttempt,
	loadDailyStats,
	saveDailyAttempt,
	saveDailyStats,
} from "./dailyPersistence";
import { GAME_LABELS } from "./draftPresentation";
import { LEGACY_MAJOR_LOGO, LEGACY_MAJOR_REEL_ID, visibleLabel } from "./draftReel";
import { DailyStatsPanel, type HomeAction, HomeScreen, type HomeView } from "./HomeScreen";
import { MajorCrest } from "./MajorCrest";
import { MatchPlayback } from "./MatchPlayback";
import { resetMobileViewport } from "./mobileViewport";
import { OrgCrest } from "./OrgCrest";
import { SaveTeamPanel, saveResultMessage } from "./SaveTeam";
import { TournamentRun } from "./TournamentRun";
import { DEFAULT_TEAM_NAME, parseTeamName, TEAM_NAME_MAX } from "./teamName";
import {
	COMMUNITY_STORAGE_KEY,
	parsePersistedTournamentRun,
	TOURNAMENT_STORAGE_KEY,
	TOURNAMENT_STORAGE_VERSION,
} from "./tournamentPersistence";

const INITIAL_SEED = 0x4d_41_4a_4f;
type GameMode = "daily" | "free" | "community" | "duel";

function persistKey(mode: GameMode | null): string | null {
	if (mode === "free") return TOURNAMENT_STORAGE_KEY;
	if (mode === "community") return COMMUNITY_STORAGE_KEY;
	return null;
}

type DraftGameProps = {
	dataset: Dataset;
};

function freePlaySeed(): number {
	if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
		return crypto.getRandomValues(new Uint32Array(1))[0] ?? INITIAL_SEED;
	}
	return Date.now() >>> 0;
}

function revealKey(state: DraftState): string | null {
	if (state.phase.type !== "player") {
		return null;
	}
	const card = state.cards[state.phase.round];
	return card ? `${state.phase.round}:${card.orgYearId}` : null;
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
				onBlur={() => {
					// Blur runs before Start Major / Lock in. A sync viewport reset
					// scrolls and reflows, so the first press never becomes a click.
					window.setTimeout(() => {
						if (document.activeElement instanceof HTMLButtonElement) return;
						resetMobileViewport();
					}, 0);
				}}
				className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-base text-white placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
			/>
			<p className="mt-1.5 text-[11px] text-zinc-500">Shows on the bracket and in matches.</p>
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

const REROLL_BUTTON_CLASS =
	"min-h-11 w-full rounded-lg border border-white/12 bg-white/5 px-1.5 text-center text-[11px] font-semibold leading-none text-zinc-200 transition disabled:cursor-not-allowed disabled:opacity-40";

function CrestRerollColumn({ crest, children }: { crest: ReactNode; children: ReactNode }) {
	return (
		<div className="flex w-14 shrink-0 flex-col items-stretch gap-1.5 sm:w-20 sm:gap-2 lg:w-28">
			<div className="flex size-14 items-center justify-center rounded-xl bg-black/40 p-1 sm:size-20 sm:rounded-2xl sm:p-2 lg:size-28">
				{crest}
			</div>
			{children}
		</div>
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
	const legendary = isLegendaryCoach(coach);
	return (
		<button
			type="button"
			onClick={onPick}
			className={
				legendary
					? "coach-glow-legendary rounded-xl border border-amber-300/70 bg-amber-300/10 p-4 text-left transition hover:border-amber-200 hover:bg-amber-300/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
					: "rounded-xl border border-white/10 bg-zinc-900/80 p-4 text-left transition hover:border-emerald-300/50 hover:bg-emerald-300/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
			}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 items-start gap-3">
					{org ? <OrgCrest org={org} size="sm" /> : null}
					<div>
						<p className={`text-lg font-semibold ${legendary ? "text-amber-50" : "text-white"}`}>
							{coach.nick}
						</p>
						<p className={`mt-1 text-xs ${legendary ? "text-amber-200/70" : "text-zinc-500"}`}>
							{orgName} · {coach.year} · {coach.nationality}
						</p>
					</div>
				</div>
				<span
					className={
						legendary
							? "rounded-md bg-amber-300/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-100"
							: "rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
					}
				>
					{legendary ? "Legendary" : "Coach"}
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
					<div
						key={label}
						className={`rounded-lg p-2 text-center ${legendary ? "bg-amber-950/40" : "bg-black/30"}`}
					>
						<dt
							className={`text-[9px] uppercase tracking-wide ${legendary ? "text-amber-200/70" : "text-zinc-500"}`}
						>
							{label}
						</dt>
						<dd
							className={`mt-1 text-base font-bold tabular-nums ${legendary ? "text-amber-100" : "text-emerald-200"}`}
						>
							{signedModifier(value)}
						</dd>
					</div>
				))}
			</dl>
			<p
				className={`mt-3 text-xs font-semibold ${legendary ? "text-amber-200/80" : "text-zinc-500"}`}
			>
				Select coach
			</p>
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
						<p className="mt-2 text-sm text-zinc-500">No obvious weak spot.</p>
					)}
				</div>
			</div>

			<div className="rounded-xl border border-white/10 bg-black/25 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
						Aggregate attributes
					</h3>
					<p
						className={`text-[10px] ${profile.coach.legendary ? "text-amber-200" : "text-zinc-500"}`}
					>
						{profile.coach.legendary ? "Legendary coach" : "Coach"}: {profile.coach.nick} · comeback{" "}
						{profile.details.coaching.comebackResilience} · economy{" "}
						{profile.details.coaching.economyDiscipline} · anti-strat{" "}
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

function DailySharePanel({
	result,
	stats,
	dataset,
}: {
	result: DailyResult;
	stats: DailyStats;
	dataset: Dataset;
}) {
	const [status, setStatus] = useState("");
	const url =
		typeof window === "undefined"
			? "https://major-winners.com/"
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
			<DailyStatsPanel stats={stats} dataset={dataset} />
		</div>
	);
}

export function DraftGame({ dataset }: DraftGameProps) {
	const [state, setState] = useState(() => startDraft(dataset, INITIAL_SEED));
	const [error, setError] = useState<string | null>(null);
	const [tournament, setTournament] = useState<TournamentState | null>(null);
	const [mode, setMode] = useState<GameMode | null>(null);
	const [identity, setIdentity] = useState(() => dailyIdentity());
	const [dailyStats, setDailyStats] = useState<DailyStats>(EMPTY_DAILY_STATS);
	const [teamName, setTeamName] = useState(DEFAULT_TEAM_NAME);
	const [nameDraft, setNameDraft] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const [seedDraft, setSeedDraft] = useState("");
	const [seedError, setSeedError] = useState<string | null>(null);
	const [homeView, setHomeView] = useState<HomeView>("menu");
	const [hasDailyAttempt, setHasDailyAttempt] = useState(false);
	const [hasFreePlaySave, setHasFreePlaySave] = useState(false);
	const [hasCommunitySave, setHasCommunitySave] = useState(false);
	const [hasDuelSave, setHasDuelSave] = useState(false);
	const [duelSaveKind, setDuelSaveKind] = useState<DuelKind | null>(null);
	const [duelCode, setDuelCode] = useState("");
	const [duelSecret, setDuelSecret] = useState("");
	const [duelSide, setDuelSide] = useState<DuelSide>("host");
	const [duelKind, setDuelKind] = useState<DuelKind>("casual");
	const [duelRoom, setDuelRoom] = useState<DuelRoom | null>(null);
	const [duelLive, setDuelLive] = useState<LiveSeriesState | null>(null);
	const [duelRecap, setDuelRecap] = useState(false);
	const [rankedResult, setRankedResult] = useState<RankedResult | null>(null);
	const [rankedProfile, setRankedProfile] = useState<RankedProfile | null>(null);
	const [eloBoard, setEloBoard] = useState<RankedProfile[]>([]);
	const [handleDraft, setHandleDraft] = useState("");
	const [handleError, setHandleError] = useState<string | null>(null);
	const [usernameBusy, setUsernameBusy] = useState(false);
	const [rankedError, setRankedError] = useState<string | null>(null);
	const [rankedElo, setRankedElo] = useState<number | null>(null);
	const [rankedWindow, setRankedWindow] = useState<number | null>(null);
	const duelStatsRecorded = useRef<string | null>(null);
	const [joinCode, setJoinCode] = useState("");
	const [joinError, setJoinError] = useState<string | null>(null);
	const [duelBusy, setDuelBusy] = useState(false);
	const [duelError, setDuelError] = useState<string | null>(null);
	const [pendingRestart, setPendingRestart] = useState(false);
	const [confirmAbandon, setConfirmAbandon] = useState(false);
	const [rollKind, setRollKind] = useState<DraftRollKind>("full");
	const [settledCardKey, setSettledCardKey] = useState<string | null>(null);
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
	const selectedPlayerIdRef = useRef<string | null>(null);
	selectedPlayerIdRef.current = selectedPlayerId;
	const [communityRuns, setCommunityRuns] = useState<PublishedRunSnapshot[]>([]);
	const [myRuns, setMyRuns] = useState<PublishedRunSnapshot[]>([]);
	const [communityTeams, setCommunityTeams] = useState<SavedTeamSnapshot[]>([]);
	const [userEmail, setUserEmail] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [emailDraft, setEmailDraft] = useState("");
	const [authBusy, setAuthBusy] = useState(false);
	const [authMessage, setAuthMessage] = useState<string | null>(null);
	const [authError, setAuthError] = useState<string | null>(null);
	const [saveBusy, setSaveBusy] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const [savedFingerprints, setSavedFingerprints] = useState<Set<string>>(() => new Set());
	const communityEnabled = isCommunityEnabled();

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
	const historicalOpponents = useMemo(
		() => buildHistoricalOpponents(dataset, ratedPlayers),
		[dataset, ratedPlayers],
	);
	const communityOpponents = useMemo(
		() => buildCommunityOpponents(communityTeams, dataset, ratedPlayers),
		[communityTeams, dataset, ratedPlayers],
	);
	const opponents = useMemo(
		() =>
			mode === "community"
				? mergeOpponentPools(communityOpponents, historicalOpponents)
				: historicalOpponents,
		[communityOpponents, historicalOpponents, mode],
	);

	useEffect(() => {
		const today = dailyIdentity();
		setIdentity(today);
		try {
			setDailyStats(loadDailyStats(window.localStorage));
			setHasDailyAttempt(
				Boolean(loadDailyAttempt(window.localStorage, dataset, today.day, today.seed)),
			);
			setHasFreePlaySave(
				Boolean(
					parsePersistedTournamentRun(
						window.localStorage.getItem(TOURNAMENT_STORAGE_KEY) ?? "",
						dataset,
					),
				),
			);
			setHasCommunitySave(
				Boolean(
					parsePersistedTournamentRun(
						window.localStorage.getItem(COMMUNITY_STORAGE_KEY) ?? "",
						dataset,
					),
				),
			);
			setHasDuelSave(Boolean(loadPersistedDuel(window.localStorage)));
			setDuelSaveKind(loadPersistedDuel(window.localStorage)?.kind ?? null);
			setSavedFingerprints(loadPublishedFingerprints(window.localStorage));
		} catch {
			// Storage may be unavailable in privacy-restricted browser contexts.
		}
	}, [dataset]);

	useEffect(() => {
		if (!communityEnabled) return;
		let cancelled = false;
		void Promise.all([fetchBestRuns(), fetchSavedTeams(), fetchEloLeaderboard()]).then(
			([runs, teams, board]) => {
				if (cancelled) return;
				setCommunityRuns(runs);
				setCommunityTeams(teams);
				setEloBoard(board);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [communityEnabled]);

	useEffect(() => {
		if (!communityEnabled) return;
		let cancelled = false;
		void getSession().then((session) => {
			if (cancelled) return;
			setUserEmail(session?.user.email ?? null);
			setUserId(session?.user.id ?? null);
		});
		const stop = onAuthChange((session) => {
			setUserEmail(session?.user.email ?? null);
			setUserId(session?.user.id ?? null);
		});
		return () => {
			cancelled = true;
			stop();
		};
	}, [communityEnabled]);

	useEffect(() => {
		if (!communityEnabled || !userId) {
			setMyRuns([]);
			setRankedProfile(null);
			return;
		}
		let cancelled = false;
		void (async () => {
			const [runs, existing] = await Promise.all([
				fetchMyPublishedRuns(userId),
				fetchMyProfile(userId),
			]);
			let profile = existing;
			try {
				const pending = loadPendingDisplayName(window.localStorage);
				if (pending && !existing) {
					const result = await setDisplayName(pending);
					if (result.ok) {
						profile = result.profile;
					} else if (!cancelled) {
						setHandleError(result.error);
					}
				}
				if (pending) clearPendingDisplayName(window.localStorage);
			} catch {
				// Applying a pending username is best-effort.
			}
			if (cancelled) return;
			setMyRuns(runs);
			setRankedProfile(profile);
			if (profile) {
				setHandleDraft((current) => current || profile.displayName);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [communityEnabled, userId]);

	function beginDaily() {
		setError(null);
		setPendingRestart(false);
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
		setIdentity(today);
		setDailyStats(stats);
		setTeamName(attempt?.teamName ?? DEFAULT_TEAM_NAME);
		setNameDraft(
			attempt?.teamName && attempt.teamName !== DEFAULT_TEAM_NAME ? attempt.teamName : "",
		);
		setNameError(null);
		const draft = attempt?.draft ?? startDraft(dataset, today.seed);
		setState(draft);
		setRollKind("full");
		setSettledCardKey(attempt ? revealKey(draft) : null);
		setTournament(attempt?.tournament ?? null);
		setMode("daily");
	}

	function beginPersistedMode(
		nextMode: "free" | "community",
		options: { restore?: boolean; seed?: number | string } = {},
	) {
		setError(null);
		setPendingRestart(false);
		setSaveError(null);
		setSaveMessage(null);
		const key = persistKey(nextMode);
		if (options.restore && key) {
			let persisted = null;
			try {
				persisted = parsePersistedTournamentRun(window.localStorage.getItem(key) ?? "", dataset);
			} catch {
				// Storage may be unavailable in privacy-restricted browser contexts.
			}
			if (persisted) {
				const draft = persisted.draft;
				setTeamName(persisted.teamName ?? DEFAULT_TEAM_NAME);
				setNameDraft(
					persisted.teamName && persisted.teamName !== DEFAULT_TEAM_NAME ? persisted.teamName : "",
				);
				setNameError(null);
				setState({
					...draft,
					phase: { type: "complete" },
					coachIds: dataset.coaches.map((coach) => coach.id),
					rerolls: { majorRemaining: 0, teamRemaining: 0 },
					coachId: draft.coachId,
				});
				setTournament(persisted.tournament);
				setMode(nextMode);
				return;
			}
		}
		setTeamName(DEFAULT_TEAM_NAME);
		setNameDraft("");
		setNameError(null);
		setSeedError(null);
		try {
			if (key) window.localStorage.removeItem(key);
		} catch {
			// The in-memory run is authoritative until the next persist.
		}
		setState(startDraft(dataset, options.seed ?? freePlaySeed()));
		setRollKind("full");
		setSettledCardKey(null);
		setTournament(null);
		setMode(nextMode);
	}

	function beginFree(options: { restore?: boolean; seed?: number | string } = {}) {
		beginPersistedMode("free", options);
	}

	function applyDuelClaim(
		code: string,
		secret: string,
		side: DuelSide,
		room: DuelRoom,
		kind?: DuelKind,
	) {
		setDuelCode(code);
		setDuelSecret(secret);
		setDuelSide(side);
		setDuelKind(kind ?? room.kind ?? "casual");
		setDuelRoom(room);
		setDuelError(null);
		setRankedResult(null);
	}

	function resetDuelLocal() {
		setDuelCode("");
		setDuelSecret("");
		setDuelSide("host");
		setDuelKind("casual");
		setDuelRoom(null);
		setDuelLive(null);
		setDuelRecap(false);
		setDuelError(null);
		setRankedResult(null);
		setHasDuelSave(false);
		setDuelSaveKind(null);
		try {
			clearPersistedDuel(window.localStorage);
		} catch {
			// In-memory duel state is authoritative.
		}
	}

	async function beginDuel(options: { restore?: boolean } = {}) {
		setError(null);
		setPendingRestart(false);
		setDuelError(null);
		setJoinError(null);
		if (options.restore) {
			const persisted = loadPersistedDuel(window.localStorage);
			if (persisted) {
				const fetched = await fetchDuel(persisted.code, persisted.secret);
				if (fetched.ok) {
					applyDuelClaim(
						persisted.code,
						persisted.secret,
						persisted.side,
						fetched.value,
						persisted.kind ?? fetched.value.kind,
					);
					setTeamName(persisted.teamName ?? DEFAULT_TEAM_NAME);
					setNameDraft(
						persisted.teamName && persisted.teamName !== DEFAULT_TEAM_NAME
							? persisted.teamName
							: "",
					);
					if (persisted.draft) {
						setState(persisted.draft);
						setSettledCardKey(revealKey(persisted.draft));
					} else {
						setState(startDraft(dataset, freePlaySeed()));
						setSettledCardKey(null);
					}
					setRollKind("full");
					setTournament(null);
					const live =
						persisted.liveSeries ?? liveSeriesFromDuelRoom(fetched.value, dataset, ratedPlayers);
					setDuelLive(live);
					setDuelRecap(Boolean(live?.complete));
					setMode("duel");
					return;
				}
			}
		}
		setDuelBusy(true);
		const created = await createDuel();
		setDuelBusy(false);
		if (!created.ok) {
			setDuelError(created.error);
			return;
		}
		applyDuelClaim(
			created.value.code,
			created.value.secret,
			created.value.side,
			created.value.room,
			"casual",
		);
		setTeamName(DEFAULT_TEAM_NAME);
		setNameDraft("");
		setNameError(null);
		setState(startDraft(dataset, freePlaySeed()));
		setRollKind("full");
		setSettledCardKey(null);
		setTournament(null);
		setDuelLive(null);
		setDuelRecap(false);
		setMode("duel");
	}

	async function confirmJoinDuel() {
		const code = normalizeDuelCode(joinCode);
		setJoinError(null);
		setDuelBusy(true);
		const joined = await joinDuel(code);
		setDuelBusy(false);
		if (!joined.ok) {
			setJoinError(joined.error);
			return;
		}
		applyDuelClaim(
			joined.value.code,
			joined.value.secret,
			joined.value.side,
			joined.value.room,
			"casual",
		);
		setTeamName(DEFAULT_TEAM_NAME);
		setNameDraft("");
		setNameError(null);
		setState(startDraft(dataset, freePlaySeed()));
		setRollKind("full");
		setSettledCardKey(null);
		setTournament(null);
		setDuelLive(null);
		setDuelRecap(false);
		setMode("duel");
		setHomeView("menu");
	}

	function openRanked() {
		setRankedError(null);
		setHandleError(null);
		if (!userEmail) {
			setHomeView("signin");
			return;
		}
		if (hasDuelSave && duelSaveKind === "ranked") {
			void beginDuel({ restore: true });
			return;
		}
		if (!rankedProfile) {
			setHomeView("ranked-handle");
			return;
		}
		setHomeView("ranked");
	}

	function submitRankedHandle() {
		const name = parseDisplayName(handleDraft);
		if (!name) {
			setHandleError("Use 3–16 letters, numbers, or underscore.");
			return;
		}
		setHandleError(null);
		setHomeView("ranked");
	}

	async function cancelRankedQueue() {
		await leaveRankedQueue();
		setHomeView("community");
		setRankedError(null);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: ranked poll must not reset when claim helpers change identity
	useEffect(() => {
		if (homeView !== "ranked") return;
		let cancelled = false;
		const tick = async () => {
			const name = rankedProfile ? undefined : (parseDisplayName(handleDraft) ?? undefined);
			const result = await queueRankedMatch(name);
			if (cancelled) return;
			if (!result.ok) {
				setRankedError(result.error);
				return;
			}
			if ("matched" in result.value && result.value.matched === false) {
				setRankedElo(result.value.elo);
				setRankedWindow(result.value.window);
				return;
			}
			if ("code" in result.value) {
				const claim = result.value;
				setDuelCode(claim.code);
				setDuelSecret(claim.secret);
				setDuelSide(claim.side);
				setDuelKind("ranked");
				setDuelRoom(claim.room);
				setDuelError(null);
				setRankedResult(null);
				setTeamName(DEFAULT_TEAM_NAME);
				setNameDraft("");
				setNameError(null);
				setState(startDraft(dataset, freePlaySeed()));
				setRollKind("full");
				setSettledCardKey(null);
				setTournament(null);
				setDuelLive(null);
				setDuelRecap(false);
				setMode("duel");
				setHomeView("menu");
			}
		};
		void tick();
		const timer = window.setInterval(() => {
			void tick();
		}, DUEL_POLL_MS);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			void leaveRankedQueue();
		};
	}, [handleDraft, homeView, rankedProfile]);

	function chooseHomeAction(action: HomeAction) {
		setNameError(null);
		setSeedError(null);
		setAuthError(null);
		setAuthMessage(null);
		if (action === "daily") {
			beginDaily();
			return;
		}
		if (action === "free") {
			beginFree({ restore: hasFreePlaySave });
			return;
		}
		if (action === "community") {
			beginPersistedMode("community", { restore: hasCommunitySave });
			return;
		}
		if (action === "duel") {
			void beginDuel({ restore: hasDuelSave && homeView === "community" });
			return;
		}
		setHomeView(action);
	}

	function confirmHomeStart() {
		const seed = parseCustomSeed(seedDraft);
		if (seed === null) {
			setSeedError("Enter a seed to start a custom game.");
			return;
		}
		beginFree({ seed });
	}

	async function submitMagicLink() {
		const email = emailDraft.trim();
		if (!email.includes("@")) {
			setAuthError("Enter an email for a magic link.");
			return;
		}
		const typed = handleDraft.trim();
		if (typed) {
			const name = parseDisplayName(typed);
			if (!name) {
				setHandleError("Use 3–16 letters, numbers, or underscore.");
				return;
			}
			if (await displayNameTaken(name)) {
				setHandleError("That name is taken.");
				return;
			}
			try {
				rememberPendingDisplayName(window.localStorage, name);
			} catch {
				// Remembering a pending username is best-effort.
			}
		} else {
			try {
				clearPendingDisplayName(window.localStorage);
			} catch {
				// Clearing a pending username is best-effort.
			}
		}
		setAuthBusy(true);
		setAuthError(null);
		setHandleError(null);
		setAuthMessage(null);
		const error = await signInWithMagicLink(email, window.location.origin);
		setAuthBusy(false);
		if (error) {
			setAuthError(error);
			return;
		}
		setAuthMessage("Link sent. Check your email.");
	}

	async function submitUsername() {
		const name = parseDisplayName(handleDraft);
		if (!name) {
			setHandleError("Use 3–16 letters, numbers, or underscore.");
			return;
		}
		setUsernameBusy(true);
		setHandleError(null);
		const result = await setDisplayName(name);
		setUsernameBusy(false);
		if (!result.ok) {
			setHandleError(result.error);
			return;
		}
		setRankedProfile(result.profile);
		setHandleDraft(result.profile.displayName);
	}

	async function submitSignOut() {
		await signOutCommunity();
		setMyRuns([]);
		setHomeView("menu");
	}

	function goHome() {
		setPendingRestart(false);
		setConfirmAbandon(false);
		setNameError(null);
		setSeedError(null);
		setHomeView("menu");
		setMode(null);
		try {
			const today = dailyIdentity();
			setHasDailyAttempt(
				Boolean(loadDailyAttempt(window.localStorage, dataset, today.day, today.seed)),
			);
			setHasFreePlaySave(
				Boolean(
					parsePersistedTournamentRun(
						window.localStorage.getItem(TOURNAMENT_STORAGE_KEY) ?? "",
						dataset,
					),
				),
			);
			setHasCommunitySave(
				Boolean(
					parsePersistedTournamentRun(
						window.localStorage.getItem(COMMUNITY_STORAGE_KEY) ?? "",
						dataset,
					),
				),
			);
			setHasDuelSave(Boolean(loadPersistedDuel(window.localStorage)));
			setDuelSaveKind(
				loadPersistedDuel(window.localStorage)?.kind ??
					(loadPersistedDuel(window.localStorage) ? "casual" : null),
			);
		} catch {
			// Storage may be unavailable in privacy-restricted browser contexts.
		}
	}

	function clearSavedRun() {
		try {
			if (mode === "daily") clearDailyAttempt(window.localStorage);
			else if (mode === "duel") clearPersistedDuel(window.localStorage);
			else {
				const key = persistKey(mode);
				if (key) window.localStorage.removeItem(key);
			}
		} catch {
			// The in-memory reset is authoritative.
		}
	}

	function requestNewDraft() {
		if (mode === "duel") return;
		setPendingRestart(true);
		setNameError(null);
	}

	function confirmNewDraft() {
		if (mode === "duel") return;
		setTeamName(DEFAULT_TEAM_NAME);
		setNameDraft("");
		setNameError(null);
		setPendingRestart(false);
		setState(startDraft(dataset, mode === "daily" ? identity.seed : freePlaySeed()));
		setRollKind("full");
		setSettledCardKey(null);
		setError(null);
		setTournament(null);
		clearSavedRun();
	}

	function requestAbandon() {
		if (!confirmAbandon) {
			setConfirmAbandon(true);
			return;
		}
		abandonRun();
	}

	function abandonRun() {
		setTournament(null);
		setError(null);
		setPendingRestart(false);
		setConfirmAbandon(false);
		if (mode === "duel") resetDuelLocal();
		clearSavedRun();
		goHome();
	}

	const card = currentCard(state);
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

	function assignPlayer(playerSeasonId: string, role: Role) {
		const placed = Object.values(state.roster).some(
			(pick) => pick?.playerSeasonId === playerSeasonId,
		);
		const result = applyAction(state, {
			type: placed ? "movePlayer" : "pickPlayer",
			playerSeasonId,
			role,
		});
		if (!result.ok) {
			setError(result.error.message);
			return;
		}
		setState(result.value);
		setError(null);
		setSelectedPlayerId(null);
		if (
			state.phase.type === "player" &&
			result.value.phase.type === "player" &&
			result.value.phase.round !== state.phase.round
		) {
			setRollKind("full");
		}
	}

	function toggleSelectedPlayer(playerSeasonId: string) {
		const selected = selectedPlayerIdRef.current;
		const occupantRole = ROLES.find(
			(role) => state.roster[role]?.playerSeasonId === playerSeasonId,
		);
		if (selected && selected !== playerSeasonId && occupantRole) {
			assignPlayer(selected, occupantRole);
			return;
		}
		setSelectedPlayerId((current) => (current === playerSeasonId ? null : playerSeasonId));
	}

	const { drag, startDrag } = usePlayerDrag(assignPlayer, toggleSelectedPlayer);

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
		setError(null);
		setRollKind(type === "rerollTeam" ? "team" : "major");
	}

	const orgYear = card ? orgYearsById.get(card.orgYearId) : undefined;
	const org = orgYear ? orgsById.get(orgYear.orgId) : undefined;
	const major = orgYear?.majorId ? majorsById.get(orgYear.majorId) : undefined;
	const cardKey = revealKey(state);
	const rolling = cardKey !== null && cardKey !== settledCardKey;
	useEffect(() => {
		setSelectedPlayerId(cardKey ? null : null);
	}, [cardKey]);
	const majorRerollDisabled = !canRerollMajor(state, dataset);
	const hasOtherMajor = otherMajorAppearances(state, dataset).length > 0;
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
		const name = parseTeamName(nameDraft);
		if (!name) {
			setNameError("Name your team to start the Major.");
			return;
		}
		setTeamName(name);
		setNameError(null);
		resetMobileViewport();
		setTournament(
			createTournament({
				rootSeed: completedDraft.seed,
				playerTeam: teamProfile,
				opponents,
			}),
		);
	}

	async function lockDuelRoster() {
		if (!completedDraft || mode !== "duel" || !duelCode || !duelSecret) return;
		const name = parseTeamName(nameDraft);
		if (!name) {
			setNameError("Name your team to lock in.");
			return;
		}
		setTeamName(name);
		setNameError(null);
		setDuelBusy(true);
		setDuelError(null);
		const fields = snapshotDraftFields(completedDraft);
		const result = await submitDuelRoster(duelCode, duelSecret, {
			...fields,
			teamName: name,
		});
		setDuelBusy(false);
		if (!result.ok) {
			setDuelError(result.error);
			return;
		}
		setDuelRoom(result.value);
		if (result.value.status === "playing") {
			setDuelLive(liveSeriesFromDuelRoom(result.value, dataset, ratedPlayers));
		}
	}

	async function sendDuelVeto(mapId: string) {
		if (!duelCode || !duelSecret) return;
		setDuelBusy(true);
		setDuelError(null);
		const result = await submitDuelVeto(duelCode, duelSecret, mapId);
		setDuelBusy(false);
		if (!result.ok) {
			setDuelError(result.error);
			return;
		}
		setDuelRoom(result.value);
		if (result.value.status === "playing" && !duelLive) {
			setDuelLive(liveSeriesFromDuelRoom(result.value, dataset, ratedPlayers));
		}
	}

	useEffect(() => {
		const key = persistKey(mode);
		if (!key || !tournament || !completedDraft) return;
		try {
			window.localStorage.setItem(
				key,
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
		if (mode !== "duel" || !duelCode || !duelSecret) return;
		try {
			savePersistedDuel(window.localStorage, {
				version: DUEL_STORAGE_VERSION,
				code: duelCode,
				secret: duelSecret,
				side: duelSide,
				kind: duelKind,
				draft: state,
				teamName,
				...(duelLive ? { liveSeries: duelLive } : {}),
			});
			setHasDuelSave(true);
			setDuelSaveKind(duelKind);
		} catch {
			// The room remains playable if storage is unavailable.
		}
	}, [duelCode, duelKind, duelLive, duelSecret, duelSide, mode, state, teamName]);
	useEffect(() => {
		if (mode !== "duel" || !duelCode || !duelSecret) return;
		let cancelled = false;
		const tick = async () => {
			const result = await fetchDuel(duelCode, duelSecret);
			if (cancelled || !result.ok) return;
			setDuelRoom(result.value);
			if (result.value.status === "playing") {
				setDuelLive(
					(current) => current ?? liveSeriesFromDuelRoom(result.value, dataset, ratedPlayers),
				);
			}
		};
		void tick();
		const timer = window.setInterval(() => {
			void tick();
		}, DUEL_POLL_MS);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [dataset, duelCode, duelSecret, mode, ratedPlayers]);
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
		const result = dailyResultFromTournament(identity.day, tournament, getCompletedDraft(state));
		if (!result) return;
		setDailyStats((stats) => {
			const next = recordDailyResult(stats, result);
			try {
				saveDailyStats(window.localStorage, next);
			} catch {}
			return next;
		});
	}, [identity.day, mode, state, tournament]);
	useEffect(() => {
		if (mode !== "duel" || !userId || !duelCode || !duelLive?.complete) return;
		const viewer = sideIndex(duelSide);
		const winner = duelLive.winner ?? (duelLive.seriesScore[0] >= duelLive.seriesScore[1] ? 0 : 1);
		const other = viewer === 0 ? 1 : 0;
		const series = seriesFromLive(duelLive);
		const recap = summarizeDuelSeries(series, ["", ""]);
		const mapsWon = duelLive.seriesScore[viewer];
		const mapsLost = duelLive.seriesScore[other];
		const roundsWon = recap.rounds[viewer];
		const roundsLost = recap.rounds[other];
		if (duelKind === "ranked") {
			if (rankedResult?.eloApplied || !duelSecret) return;
			let cancelled = false;
			const tick = async () => {
				const result = await submitRankedResult({
					code: duelCode,
					secret: duelSecret,
					mapsWon,
					mapsLost,
					roundsWon,
					roundsLost,
				});
				if (cancelled || !result.ok) return;
				setRankedResult(result.value);
				if (result.value.eloApplied) {
					void fetchMyProfile(userId).then(setRankedProfile);
					void fetchEloLeaderboard().then(setEloBoard);
				}
			};
			void tick();
			const timer = window.setInterval(() => {
				void tick();
			}, DUEL_POLL_MS);
			return () => {
				cancelled = true;
				window.clearInterval(timer);
			};
		}
		const key = `${userId}:${duelCode}`;
		if (duelStatsRecorded.current === key) return;
		duelStatsRecorded.current = key;
		void recordDuelResult({
			userId,
			roomCode: duelCode,
			won: winner === viewer,
			mapsWon,
			mapsLost,
			roundsWon,
			roundsLost,
		}).then((error) => {
			if (error) {
				duelStatsRecorded.current = null;
				return;
			}
		});
	}, [duelCode, duelKind, duelLive, duelSecret, duelSide, mode, rankedResult, userId]);
	const dailyResult =
		mode === "daily" && tournament
			? dailyResultFromTournament(identity.day, tournament, completedDraft)
			: null;
	const runSummary =
		tournament && teamProfile && tournament.status !== "active"
			? summarizeTournamentRun(tournament, teamProfile)
			: null;
	const publishMode = mode === "duel" ? null : mode;
	const publishFingerprint =
		completedDraft && runSummary && publishMode
			? runFingerprint({
					...snapshotDraftFields(completedDraft),
					mode: publishMode,
					wins: runSummary.wins,
					losses: runSummary.losses,
					mapsWon: runSummary.mapsWon,
					mapsLost: runSummary.mapsLost,
					roundsWon: runSummary.roundsWon,
					roundsLost: runSummary.roundsLost,
				})
			: null;
	const duelTeamFingerprint =
		completedDraft && mode === "duel" && duelCode
			? teamFingerprint({
					...snapshotDraftFields(completedDraft),
					tag: `duel:${duelCode}`,
				})
			: null;
	const alreadySaved = Boolean(
		(publishFingerprint && savedFingerprints.has(publishFingerprint)) ||
			(duelTeamFingerprint && savedFingerprints.has(duelTeamFingerprint)),
	);

	async function saveFinishedTeam() {
		if (!completedDraft || !communityEnabled) return;
		const authorName = authorNameFromProfile(rankedProfile?.displayName);
		if (mode === "duel") {
			if (!duelTeamFingerprint) return;
			setSaveBusy(true);
			setSaveError(null);
			setSaveMessage(null);
			const result = await publishSavedTeam({
				authorName,
				teamName,
				draft: completedDraft,
				userId,
				fingerprint: duelTeamFingerprint,
			});
			setSaveBusy(false);
			if (!result.ok) {
				setSaveError(result.error);
				return;
			}
			setSaveMessage(saveResultMessage(result));
			setSavedFingerprints((current) => new Set(current).add(result.fingerprint));
			try {
				rememberPublishedFingerprint(window.localStorage, result.fingerprint);
			} catch {
				// Remembering locally is best-effort.
			}
			void fetchSavedTeams().then(setCommunityTeams);
			return;
		}
		if (!runSummary || !publishMode) return;
		setSaveBusy(true);
		setSaveError(null);
		setSaveMessage(null);
		const result = await publishFinishedRun({
			authorName,
			teamName,
			mode: publishMode,
			draft: completedDraft,
			summary: runSummary,
			userId,
		});
		setSaveBusy(false);
		if (!result.ok) {
			setSaveError(result.error);
			return;
		}
		setSaveMessage(saveResultMessage(result));
		setSavedFingerprints((current) => new Set(current).add(result.fingerprint));
		try {
			rememberPublishedFingerprint(window.localStorage, result.fingerprint);
		} catch {
			// Remembering locally is best-effort.
		}
		void fetchBestRuns().then(setCommunityRuns);
		void fetchSavedTeams().then(setCommunityTeams);
		if (userId) void fetchMyPublishedRuns(userId).then(setMyRuns);
	}
	const simulating = Boolean(
		!pendingRestart && ((tournament && teamProfile) || (mode === "duel" && duelLive && !duelRecap)),
	);
	const seedLabel =
		mode === "daily" ? `${identity.id} · UTC seed ${state.seed}` : `Seed ${state.seed}`;
	const draggingPlayer = drag ? playersById.get(drag.playerId) : undefined;
	const rosterProps = {
		state,
		playersById,
		previewOvr,
		teamName,
		seedLabel,
		drag,
		draggingPlayer,
		selectedPlayerId,
		onPointerDown: startDrag,
		onAssign: assignPlayer,
		traitsFor: (playerSeasonId: string) => {
			for (const card of state.cards) {
				const player = card.players.find((row) => row.id === playerSeasonId);
				if (player) return player.revealedTraitIds ?? [];
			}
			return [];
		},
	};
	const duelOwnRoster = duelRoom ? rosterForSide(duelRoom, duelSide) : null;
	const duelLocked = mode === "duel" && Boolean(duelOwnRoster);
	const showDuelVeto = mode === "duel" && duelRoom?.status === "veto";
	const showDuelRecap = mode === "duel" && Boolean(duelLive?.complete && duelRecap);
	const showDuelMatch = mode === "duel" && Boolean(duelLive) && !showDuelRecap;
	const showSideRoster = Boolean(
		!simulating &&
			!showDuelVeto &&
			!showDuelMatch &&
			!showDuelRecap &&
			state.phase.type !== "player",
	);
	if (mode === null) {
		return (
			<HomeScreen
				view={homeView}
				stats={dailyStats}
				hasDailyAttempt={hasDailyAttempt}
				hasFreePlaySave={hasFreePlaySave}
				seedDraft={seedDraft}
				seedError={seedError}
				community={{
					enabled: communityEnabled,
					hasSave: hasCommunitySave,
					hasDuelSave,
					duelSaveKind,
					joinCode,
					joinError,
					onJoinCode: (value) => {
						setJoinCode(normalizeDuelCode(value));
						setJoinError(null);
					},
					onJoinDuel: () => {
						void confirmJoinDuel();
					},
					userEmail,
					authBusy,
					authMessage,
					authError,
					emailDraft,
					runs: communityRuns,
					teams: communityTeams,
					dataset,
					ratedPlayers,
					onEmailDraft: (value) => {
						setEmailDraft(value);
						setAuthError(null);
					},
					onSignIn: () => {
						void submitMagicLink();
					},
					onSignOut: () => {
						void submitSignOut();
					},
					myRuns,
					profile: rankedProfile,
					eloBoard,
					handleDraft,
					handleError,
					rankedError,
					rankedElo,
					rankedWindow,
					onHandleDraft: (value) => {
						setHandleDraft(value);
						setHandleError(null);
					},
					onRanked: openRanked,
					onSubmitHandle: submitRankedHandle,
					onSaveUsername: () => {
						void submitUsername();
					},
					usernameBusy,
					onLeaveQueue: () => {
						void cancelRankedQueue();
					},
				}}
				onView={(view) => {
					if (homeView === "ranked" && view !== "ranked") {
						void leaveRankedQueue();
					}
					if (view === "profile" && rankedProfile) {
						setHandleDraft(rankedProfile.displayName);
						setHandleError(null);
					}
					if (view === "signin") {
						setHandleError(null);
					}
					setHomeView(view);
				}}
				onSeedDraft={(value) => {
					setSeedDraft(value);
					setSeedError(null);
				}}
				onChoose={chooseHomeAction}
				onStart={confirmHomeStart}
			/>
		);
	}

	const showRecapHome =
		!pendingRestart &&
		Boolean(tournament && !tournament.liveSeries && tournament.status !== "active");

	return (
		<>
			<AppNav
				onGoHome={goHome}
				action={
					showRecapHome ? (
						<button
							type="button"
							onClick={abandonRun}
							className="rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 sm:px-4 sm:py-2 sm:text-sm"
						>
							Back to Home
						</button>
					) : null
				}
			/>
			<div
				className={`mx-auto w-full overflow-x-clip px-4 pb-5 pt-4 sm:px-6 sm:pb-8 sm:pt-5 ${simulating ? "max-w-360 max-lg:px-3 max-lg:pt-2 max-lg:pb-2" : "max-w-7xl"} ${state.phase.type === "player" && !rolling && !simulating ? "max-lg:pb-28" : ""}`}
			>
				{simulating ? null : (
					<header className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
								{mode === "daily"
									? `Today’s Challenge · ${identity.day} UTC · ${identity.id}`
									: mode === "community"
										? "Free play with community teams"
										: mode === "duel"
											? duelKind === "ranked"
												? "Ranked match"
												: `Private match · ${duelCode || "lobby"}`
											: "Free Play"}
							</p>
							<h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
								{teamName}
							</h1>
							<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
								Five picks from Major history, one coach, then the full bracket.
							</p>
						</div>
						{!tournament && !pendingRestart && mode !== "duel" && (
							<button
								type="button"
								onClick={requestNewDraft}
								className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
							>
								New draft
							</button>
						)}
						{mode === "duel" && !showDuelMatch && !showDuelRecap && (
							<button
								type="button"
								onClick={requestAbandon}
								onBlur={() => setConfirmAbandon(false)}
								className="shrink-0 rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-300/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
							>
								{confirmAbandon ? "Confirm abandon" : "Abandon run"}
							</button>
						)}
					</header>
				)}

				{mode === "duel" && duelCode && !showDuelMatch && !showDuelRecap ? (
					<DuelRoomBanner
						code={duelCode}
						ranked={duelKind === "ranked"}
						detail={
							duelKind === "ranked"
								? duelRoom?.status === "veto"
									? "Both sides locked in. Veto maps next."
									: duelLocked
										? `Locked in. Waiting for ${
												(duelRoom
													? rosterForSide(duelRoom, otherSide(duelSide))?.teamName
													: null) ?? "your opponent"
											}.`
										: "Draft five players and a coach, then lock in."
								: duelRoom?.status === "open"
									? "Share the code. Draft while you wait."
									: duelRoom?.status === "veto"
										? "Both sides locked in. Veto maps next."
										: duelLocked
											? `Locked in. Waiting for ${
													(duelRoom
														? rosterForSide(duelRoom, otherSide(duelSide))?.teamName
														: null) ?? "your opponent"
												}.`
											: "Draft five players and a coach, then lock in."
						}
					/>
				) : null}

				<div
					className={`grid gap-5 ${simulating ? "mt-0 lg:mt-6" : "mt-6"} ${showSideRoster ? "lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start" : ""}`}
				>
					<main className="min-w-0">
						{showSideRoster && (
							<div className="mb-5 lg:hidden">
								<LiveRoster {...rosterProps} />
							</div>
						)}

						{pendingRestart && (
							<section className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/8 p-5">
								<h2 className="text-xl font-semibold text-white">Start a new draft?</h2>
								<p className="mt-1 text-sm text-zinc-400">This replaces the current run.</p>
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
								orgsById={orgsById}
								playersById={playersById}
								onChange={setTournament}
								onAbandon={abandonRun}
								terminalExtras={
									communityEnabled && runSummary ? (
										<div className="mt-4 space-y-4">
											<SaveTeamPanel
												teamName={teamName}
												alreadySaved={alreadySaved}
												busy={saveBusy}
												message={saveMessage}
												error={saveError}
												authorName={authorNameFromProfile(rankedProfile?.displayName)}
												signedIn={Boolean(userEmail)}
												onSave={() => {
													void saveFinishedTeam();
												}}
											/>
											{dailyResult ? (
												<DailySharePanel
													result={dailyResult}
													stats={dailyStats}
													dataset={dataset}
												/>
											) : null}
										</div>
									) : dailyResult ? (
										<DailySharePanel result={dailyResult} stats={dailyStats} dataset={dataset} />
									) : undefined
								}
							/>
						)}

						{!pendingRestart &&
							!tournament &&
							state.phase.type === "player" &&
							card &&
							orgYear &&
							org &&
							(rolling ? (
								<DraftRoll
									key={cardKey}
									kind={rollKind}
									round={state.phase.round}
									majorId={card.majorId}
									orgYearId={card.orgYearId}
									majors={dataset.majors}
									orgYears={dataset.orgYears}
									orgsById={orgsById}
									onSettled={() => setSettledCardKey(cardKey)}
								/>
							) : (
								<section
									key={`round-${state.phase.round}`}
									aria-labelledby="round-heading"
									className="motion-safe:animate-[draft-reveal_360ms_ease-out]"
								>
									<div className="rounded-2xl bg-zinc-900/90 p-5 sm:p-7">
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
											Player round {state.phase.round + 1} of 5
										</p>
										<div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-5">
											<div className="flex min-w-0 items-start gap-2.5 sm:gap-4">
												<CrestRerollColumn crest={<OrgCrest org={org} size="xl" />}>
													<button
														type="button"
														disabled={state.rerolls.teamRemaining <= 0}
														onClick={() => reroll("rerollTeam")}
														className={`${REROLL_BUTTON_CLASS} enabled:hover:border-emerald-300/50 enabled:hover:bg-emerald-300/10`}
													>
														{state.rerolls.teamRemaining > 0
															? `Reroll team · ${state.rerolls.teamRemaining}`
															: "Team rerolls used"}
													</button>
												</CrestRerollColumn>
												<div className="min-w-0 pt-1">
													<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
														Team
													</p>
													<h2
														id="round-heading"
														className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-4xl"
													>
														{org.name} <span className="text-zinc-500">{orgYear.year}</span>
													</h2>
													<p className="mt-1 text-sm text-zinc-400">
														{GAME_LABELS[orgYear.game]}
														{major ? ` · placed #${orgYear.placement}` : " · pre-Major legend"}
													</p>
												</div>
											</div>
											<div className="flex min-w-0 items-start gap-2.5 sm:gap-4">
												<CrestRerollColumn
													crest={
														<MajorCrest
															major={
																major ?? {
																	id: LEGACY_MAJOR_REEL_ID,
																	shortName: "Legacy wildcard",
																	logo: LEGACY_MAJOR_LOGO,
																}
															}
															size="xl"
														/>
													}
												>
													<button
														type="button"
														disabled={majorRerollDisabled}
														onClick={() => reroll("rerollMajor")}
														className={`${REROLL_BUTTON_CLASS} enabled:hover:border-sky-300/50 enabled:hover:bg-sky-300/10`}
													>
														{state.rerolls.majorRemaining <= 0
															? "Major rerolls used"
															: hasOtherMajor
																? `Reroll Major · ${state.rerolls.majorRemaining}`
																: "Only Major for this team"}
													</button>
												</CrestRerollColumn>
												<div className="min-w-0 pt-1">
													<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
														Major
													</p>
													<p className="mt-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-4xl">
														{major ? visibleLabel(major.shortName) : "Legacy wildcard"}
													</p>
													<p className="mt-1 text-sm text-zinc-400">
														{major
															? `${visibleLabel(major.location)} · ${major.year}`
															: "Pre-2013 legend card"}
													</p>
												</div>
											</div>
										</div>
									</div>

									<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
										<div className="hidden lg:col-start-2 lg:row-span-2 lg:block lg:sticky lg:top-[calc(var(--app-nav-height)+0.75rem)]">
											<LiveRoster {...rosterProps} />
										</div>
										<div className="space-y-3 lg:col-start-1 lg:row-start-1">
											{card.players.map((draftable) => {
												const player = playersById.get(draftable.id);
												if (!player) {
													return null;
												}
												return (
													<PlayerDraftCard
														key={player.id}
														player={player}
														traits={draftable.revealedTraitIds}
														dragging={drag?.playerId === player.id}
														selected={selectedPlayerId === player.id}
														onPointerDown={(event) => startDrag(player.id, event)}
														onAssign={(role) => assignPlayer(player.id, role)}
													/>
												);
											})}
											<p className="px-1 text-[11px] text-zinc-500 max-lg:hidden">
												Drag to a role, or drag to move or swap. Press 1–5 with a card or roster
												player focused.
											</p>
											<p className="px-1 text-[11px] text-zinc-500 lg:hidden">
												Tap a player, then tap a role—or drag to the roster bar.
											</p>
										</div>
									</div>
								</section>
							))}

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
									Pick one coach. Comeback, economy, and anti-strat modifiers carry into the run.
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

						{!pendingRestart && showDuelVeto && duelRoom ? (
							<DuelVeto
								room={duelRoom}
								side={duelSide}
								busy={duelBusy}
								error={duelError}
								onPick={(mapId) => {
									void sendDuelVeto(mapId);
								}}
							/>
						) : null}

						{!pendingRestart && showDuelMatch && duelLive && duelRoom ? (
							<div>
								<MatchPlayback
									live={duelLive}
									onLiveChange={setDuelLive}
									viewerSide={sideIndex(duelSide)}
									teamLabels={[
										duelRoom.hostRoster?.teamName ?? "Host",
										duelRoom.guestRoster?.teamName ?? "Guest",
									]}
									playersById={playersById}
									eyebrow={duelKind === "ranked" ? "Ranked match · BO5" : "Private match · BO5"}
									onComplete={() => {
										setSaveError(null);
										setSaveMessage(null);
										setDuelRecap(true);
									}}
									onAwaitingNextMap={() => {
										const started = startNextMap(duelLive);
										if (started.ok) setDuelLive(started.value);
									}}
								/>
								<div className="mt-4 flex justify-center">
									<button
										type="button"
										onClick={requestAbandon}
										onBlur={() => setConfirmAbandon(false)}
										className="rounded-lg border border-red-300/20 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:border-red-300/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
									>
										{confirmAbandon ? "Confirm abandon" : "Leave match"}
									</button>
								</div>
							</div>
						) : null}

						{!pendingRestart && showDuelRecap && duelLive && duelRoom ? (
							<DuelSummary
								summary={summarizeDuelSeries(seriesFromLive(duelLive), [
									duelRoom.hostRoster?.teamName ?? "Host",
									duelRoom.guestRoster?.teamName ?? "Guest",
								])}
								viewerSide={sideIndex(duelSide)}
								playersById={playersById}
								ranked={duelKind === "ranked"}
								rankedResult={rankedResult}
								extras={
									<div className="space-y-4">
										{communityEnabled ? (
											<SaveTeamPanel
												teamName={teamName}
												alreadySaved={alreadySaved}
												busy={saveBusy}
												message={saveMessage}
												error={saveError}
												authorName={authorNameFromProfile(rankedProfile?.displayName)}
												signedIn={Boolean(userEmail)}
												onSave={() => {
													void saveFinishedTeam();
												}}
											/>
										) : null}
										<button
											type="button"
											onClick={abandonRun}
											className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
										>
											Back to Home
										</button>
									</div>
								}
							/>
						) : null}

						{!pendingRestart &&
							!tournament &&
							!showDuelVeto &&
							!showDuelMatch &&
							!showDuelRecap &&
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
										Name the squad
									</h2>
									<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
										Five players and {chosenCoach.nick} are in. Swap roles on the live roster
										anytime before you start. Team OVR blends player quality, role fit, chemistry,
										comms, structure, and coaching.
									</p>
									<TeamProfilePanel profile={teamProfile} />
									<div className="mt-5 max-w-md">
										<TeamNameField
											id="major-team-name"
											value={nameDraft}
											onChange={(value) => {
												setNameDraft(value);
												setNameError(null);
											}}
											error={nameError}
										/>
									</div>
									<div className="mt-5 flex flex-wrap gap-2">
										{mode === "duel" ? (
											<button
												type="button"
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => {
													void lockDuelRoster();
												}}
												disabled={duelBusy || duelLocked}
												className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
											>
												{duelBusy ? "Locking in…" : duelLocked ? "Locked in" : "Lock in for veto"}
											</button>
										) : (
											<button
												type="button"
												onMouseDown={(event) => event.preventDefault()}
												onClick={startMajor}
												className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
											>
												Start Major run
											</button>
										)}
										{mode !== "duel" ? (
											<button
												type="button"
												onMouseDown={(event) => event.preventDefault()}
												onClick={requestNewDraft}
												className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
											>
												Start another draft
											</button>
										) : null}
									</div>
									{duelError ? (
										<p role="alert" className="mt-3 text-sm text-red-200">
											{duelError}
										</p>
									) : null}
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

					{showSideRoster && (
						<aside className="sticky top-[calc(var(--app-nav-height)+0.75rem)] hidden lg:block">
							<LiveRoster {...rosterProps} />
						</aside>
					)}
				</div>
				{state.phase.type === "player" &&
				!rolling &&
				!simulating &&
				!showDuelVeto &&
				!showDuelMatch &&
				!showDuelRecap ? (
					<CompactRosterBar {...rosterProps} onSelectPlayer={toggleSelectedPlayer} />
				) : null}
				{drag && draggingPlayer ? (
					<PlayerDragGhost player={draggingPlayer} x={drag.x} y={drag.y} />
				) : null}
			</div>
		</>
	);
}
