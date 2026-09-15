import { useEffect, useMemo, useState } from "react";
import type { Coach, Dataset, Game, OrgTier, PlayerSeason, Role } from "../data";
import { ROLES } from "../data";
import {
	applyAction,
	currentCard,
	type DraftState,
	ratePlayer,
	roleFit,
	startDraft,
} from "../engine";

const INITIAL_SEED = 0x4d_41_4a_4f;

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
}: {
	state: DraftState;
	playersById: Map<string, PlayerSeason>;
	previewOvr: number | null;
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
						Your five
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
	orgName,
	onPick,
}: {
	coach: Coach;
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
				<div>
					<p className="text-lg font-semibold text-white">{coach.nick}</p>
					<p className="mt-1 text-xs text-zinc-500">
						{orgName} · {coach.year} · {coach.nationality}
					</p>
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

export function DraftGame({ dataset }: DraftGameProps) {
	const [state, setState] = useState(() => startDraft(dataset, INITIAL_SEED));
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const playersById = useMemo(
		() => new Map(dataset.playerSeasons.map((player) => [player.id, player])),
		[dataset.playerSeasons],
	);
	const orgYearsById = useMemo(
		() => new Map(dataset.orgYears.map((orgYear) => [orgYear.id, orgYear])),
		[dataset.orgYears],
	);
	const orgsById = useMemo(() => new Map(dataset.orgs.map((org) => [org.id, org])), [dataset.orgs]);
	const coachesById = useMemo(
		() => new Map(dataset.coaches.map((coach) => [coach.id, coach])),
		[dataset.coaches],
	);

	useEffect(() => {
		setState(startDraft(dataset, freePlaySeed()));
	}, [dataset]);

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

	function restart() {
		setState(startDraft(dataset, freePlaySeed()));
		setSelectedPlayerId(null);
		setError(null);
	}

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

	const orgYear = card ? orgYearsById.get(card.orgYearId) : undefined;
	const org = orgYear ? orgsById.get(orgYear.orgId) : undefined;
	const chosenCoach = state.coachId ? coachesById.get(state.coachId) : undefined;

	return (
		<div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
			<header className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
						Free Play
					</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
						Major Winners
					</h1>
					<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
						Five eras. Five picks. One coach. Build your Counter-Strike legends roster.
					</p>
				</div>
				<button
					type="button"
					onClick={restart}
					className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
				>
					New draft
				</button>
			</header>

			<div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
				<main className="min-w-0">
					<div className="mb-5 lg:hidden">
						<RosterPanel state={state} playersById={playersById} previewOvr={previewOvr} />
					</div>

					{state.phase.type === "player" && card && orgYear && org && (
						<section
							key={`round-${state.phase.round}`}
							aria-labelledby="round-heading"
							className="motion-safe:animate-[draft-reveal_360ms_ease-out]"
						>
							<div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4 sm:p-5">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
											Player round {state.phase.round + 1} of 5
										</p>
										<h2
											id="round-heading"
											className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
										>
											{org.name} <span className="text-zinc-500">{orgYear.year}</span>
										</h2>
										<p className="mt-1 text-sm text-zinc-400">{GAME_LABELS[orgYear.game]}</p>
									</div>
									<span
										className={`rounded-full border px-3 py-1 text-xs font-semibold ${TIER_STYLES[orgYear.tier]}`}
									>
										{TIER_LABELS[orgYear.tier]} tier
									</span>
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

					{state.phase.type === "coach" && (
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
											orgName={orgsById.get(coach.orgId)?.name ?? coach.orgId}
											onPick={() => pickCoach(coach.id)}
										/>
									);
								})}
							</div>
						</section>
					)}

					{state.phase.type === "complete" && chosenCoach && (
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
								Your legends are ready
							</h2>
							<p className="mt-2 max-w-xl text-sm leading-6 text-zinc-300">
								Five players and {chosenCoach.nick} are locked in. Major simulation arrives in Phase
								5; for now, run another draft and chase a higher fit-adjusted OVR.
							</p>
							<div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
								<div className="flex flex-wrap items-center justify-between gap-4">
									<div>
										<p className="text-xs uppercase tracking-wider text-zinc-500">Coach</p>
										<p className="mt-1 text-xl font-semibold text-white">{chosenCoach.nick}</p>
									</div>
									<div className="flex gap-2 text-center">
										{Object.entries(chosenCoach.modifiers).map(([label, value]) => (
											<div key={label} className="min-w-16 rounded-lg bg-white/5 px-2 py-2">
												<span className="block text-[9px] uppercase text-zinc-500">{label}</span>
												<span className="mt-1 block font-bold text-emerald-200">
													{signedModifier(value)}
												</span>
											</div>
										))}
									</div>
								</div>
							</div>
							<button
								type="button"
								onClick={restart}
								className="mt-5 rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
							>
								Start another draft
							</button>
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
					<RosterPanel state={state} playersById={playersById} previewOvr={previewOvr} />
					<p className="mt-3 text-center text-[10px] tabular-nums text-zinc-600">
						Seed {state.seed}
					</p>
				</aside>
			</div>
		</div>
	);
}
