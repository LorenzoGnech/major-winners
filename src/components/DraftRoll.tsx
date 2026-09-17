import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Major, Org, OrgYear } from "../data";
import {
	buildReelStrip,
	type DraftRollKind,
	LEGACY_MAJOR_REEL_ID,
	MAJOR_HOLD_MS,
	MAJOR_SPIN_MS,
	type MajorReelItem,
	majorReelPool,
	REEL_ITEM_PX,
	REEL_VISIBLE,
	TEAM_HOLD_MS,
	TEAM_SPIN_MS,
	type TeamReelItem,
	teamReelPool,
	teamReelSubtitle,
	winnerMajorItem,
	winnerTeamItem,
	withWinner,
} from "./draftReel";
import { MajorCrest } from "./MajorCrest";
import { OrgCrest } from "./OrgCrest";

export type { DraftRollKind };

type ReelStatus = "idle" | "spinning" | "locked";

type DraftRollProps = {
	kind: DraftRollKind;
	round: number;
	majorId: string | null;
	orgYearId: string;
	majors: readonly Major[];
	orgYears: readonly OrgYear[];
	orgsById: ReadonlyMap<string, Org>;
	onSettled: () => void;
};

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DraftRoll({
	kind,
	round,
	majorId,
	orgYearId,
	majors,
	orgYears,
	orgsById,
	onSettled,
}: DraftRollProps) {
	const onSettledRef = useRef(onSettled);
	onSettledRef.current = onSettled;
	const reduced = prefersReducedMotion();
	const winnerMajor = useMemo(() => winnerMajorItem(majors, majorId), [majorId, majors]);
	const winnerTeam = useMemo(
		() => winnerTeamItem(orgYears, orgsById, orgYearId),
		[orgYearId, orgYears, orgsById],
	);
	const majorStrip = useMemo(
		() => buildReelStrip(withWinner(majorReelPool(majors), winnerMajor), winnerMajor.id),
		[majors, winnerMajor],
	);
	const teamStrip = useMemo(() => {
		if (!winnerTeam || kind === "major") {
			return [];
		}
		return buildReelStrip(
			withWinner(teamReelPool(orgYears, orgsById, majorId), winnerTeam),
			winnerTeam.id,
		);
	}, [kind, majorId, orgYears, orgsById, winnerTeam]);
	const [majorStatus, setMajorStatus] = useState<ReelStatus>(
		kind === "team" ? "locked" : "spinning",
	);
	const [teamStatus, setTeamStatus] = useState<ReelStatus>(
		kind === "full" ? "idle" : kind === "team" ? "spinning" : "locked",
	);
	const [announcement, setAnnouncement] = useState(
		kind === "team"
			? `${winnerMajor.title}. Rolling a team.`
			: kind === "major"
				? `${winnerTeam?.name ?? "Team"} stays. Rolling another Major.`
				: `Round ${round + 1} of 5. Rolling a Major.`,
	);

	useLayoutEffect(() => {
		if (!reduced) {
			return;
		}
		onSettledRef.current();
	}, [reduced]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onSettledRef.current();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (reduced) {
			return;
		}
		if (majorStatus !== "locked" || teamStatus !== "idle") {
			return;
		}
		const hold = window.setTimeout(() => {
			setAnnouncement(`${winnerMajor.title}. Rolling a team.`);
			setTeamStatus("spinning");
		}, MAJOR_HOLD_MS);
		return () => window.clearTimeout(hold);
	}, [majorStatus, reduced, teamStatus, winnerMajor.title]);

	useEffect(() => {
		if (reduced || teamStatus !== "locked" || majorStatus !== "locked") {
			return;
		}
		const label =
			kind === "major"
				? `${winnerMajor.title}.`
				: winnerTeam
					? `${winnerTeam.name} ${winnerTeam.year}.`
					: "Team locked.";
		setAnnouncement(label);
		const hold = window.setTimeout(() => onSettledRef.current(), TEAM_HOLD_MS);
		return () => window.clearTimeout(hold);
	}, [kind, majorStatus, reduced, teamStatus, winnerMajor.title, winnerTeam]);

	if (reduced) {
		return null;
	}

	function skip() {
		onSettledRef.current();
	}

	return (
		<section
			aria-labelledby="roll-heading"
			className="rounded-2xl border border-white/10 bg-zinc-900/55 p-4 sm:p-5"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
						Player round {round + 1} of 5
					</p>
					<h2 id="roll-heading" className="mt-1 text-2xl font-semibold tracking-tight text-white">
						{kind === "team"
							? "Rerolling a team"
							: kind === "major"
								? "Rerolling a Major"
								: "Rolling the next card"}
					</h2>
				</div>
				<button
					type="button"
					onClick={skip}
					className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
				>
					{majorStatus === "locked" && teamStatus === "locked" ? "Continue" : "Skip reveal"}
				</button>
			</div>

			<div className="mt-5 grid gap-4 lg:grid-cols-2">
				<ReelWindow label="Major" status={majorStatus} locked={majorStatus === "locked"}>
					{majorStatus === "idle" ? null : (
						<SlotReel
							items={majorStrip}
							status={majorStatus}
							durationMs={MAJOR_SPIN_MS}
							onLanded={() => setMajorStatus("locked")}
							renderItem={(item) => <MajorReelRow item={item} />}
						/>
					)}
				</ReelWindow>
				<ReelWindow label="Team" status={teamStatus} locked={teamStatus === "locked"}>
					{kind === "major" ? (
						winnerTeam ? (
							<div className="flex h-full items-center justify-center px-3">
								<TeamReelRow
									item={winnerTeam}
									org={orgsById.get(winnerTeam.orgId)}
									showAppearance={majorStatus === "locked"}
								/>
							</div>
						) : (
							<div className="flex h-full items-center justify-center text-sm text-zinc-600">
								Team stays.
							</div>
						)
					) : teamStatus === "idle" ? (
						<div className="flex h-full items-center justify-center text-sm text-zinc-600">
							Waiting for the Major…
						</div>
					) : (
						<SlotReel
							items={teamStrip}
							status={teamStatus}
							durationMs={TEAM_SPIN_MS}
							onLanded={() => setTeamStatus("locked")}
							renderItem={(item) => (
								<TeamReelRow
									item={item}
									org={orgsById.get(item.orgId)}
									showAppearance
								/>
							)}
						/>
					)}
				</ReelWindow>
			</div>

			<p role="status" aria-live="polite" className="mt-4 text-sm text-zinc-400">
				{announcement}
			</p>
		</section>
	);
}

function ReelWindow({
	label,
	status,
	locked,
	children,
}: {
	label: string;
	status: ReelStatus;
	locked: boolean;
	children: ReactNode;
}) {
	let statusLabel = "Waiting";
	if (status === "spinning") {
		statusLabel = "Spinning";
	} else if (status === "locked") {
		statusLabel = "Locked";
	}
	return (
		<div>
			<div className="mb-2 flex items-baseline justify-between gap-2">
				<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
					{label}
				</p>
				<p
					className={`text-[10px] font-semibold uppercase tracking-wider ${
						locked ? "text-emerald-300" : "text-zinc-600"
					}`}
				>
					{statusLabel}
				</p>
			</div>
			<div
				className={`relative overflow-hidden rounded-xl border ${
					locked
						? "border-emerald-300/50 bg-emerald-300/8 motion-safe:animate-[draft-reel-lock_420ms_ease-out]"
						: "border-white/10 bg-black/40"
				}`}
				style={{ height: REEL_ITEM_PX * REEL_VISIBLE }}
			>
				<div className="draft-reel-mask absolute inset-0">{children}</div>
				<div
					aria-hidden
					className={`pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-lg border ${
						locked ? "border-emerald-300/70" : "border-white/20"
					}`}
					style={{ height: REEL_ITEM_PX }}
				/>
			</div>
		</div>
	);
}

function SlotReel<T extends { id: string }>({
	items,
	status,
	durationMs,
	onLanded,
	renderItem,
}: {
	items: readonly T[];
	status: Exclude<ReelStatus, "idle">;
	durationMs: number;
	onLanded: () => void;
	renderItem: (item: T) => ReactNode;
}) {
	const winnerIndex = Math.max(0, items.length - 1);
	const startIndex = 1;
	const stopIndex = winnerIndex + 1;
	const [offset, setOffset] = useState(status === "locked" ? stopIndex : startIndex);
	const [transition, setTransition] = useState(false);
	const landed = useRef(status === "locked");
	const onLandedRef = useRef(onLanded);
	onLandedRef.current = onLanded;

	useLayoutEffect(() => {
		if (status === "locked") {
			setOffset(stopIndex);
			setTransition(false);
			return;
		}
		if (status !== "spinning") {
			return;
		}
		if (items.length === 0) {
			onLandedRef.current();
			return;
		}
		landed.current = false;
		setTransition(false);
		setOffset(startIndex);
		let inner = 0;
		const outer = requestAnimationFrame(() => {
			inner = requestAnimationFrame(() => {
				setTransition(true);
				setOffset(stopIndex);
			});
		});
		const timeout = window.setTimeout(() => {
			if (landed.current) {
				return;
			}
			landed.current = true;
			onLandedRef.current();
		}, durationMs + 48);
		return () => {
			cancelAnimationFrame(outer);
			cancelAnimationFrame(inner);
			window.clearTimeout(timeout);
		};
	}, [durationMs, items.length, status, stopIndex]);

	if (items.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-zinc-500">
				No cards in this pool.
			</div>
		);
	}

	const padded = [items[winnerIndex], ...items, items[0]];
	const keyed = (() => {
		const seen = new Map<string, number>();
		return padded.map((item) => {
			const occurrence = seen.get(item.id) ?? 0;
			seen.set(item.id, occurrence + 1);
			return { item, key: `${item.id}:${occurrence}` };
		});
	})();

	return (
		<div
			aria-hidden
			className="will-change-transform select-none"
			style={{
				transform: `translateY(${(1 - offset) * REEL_ITEM_PX}px)`,
				transition: transition
					? `transform ${durationMs}ms cubic-bezier(0.12, 0.78, 0.08, 1)`
					: "none",
			}}
		>
			{keyed.map(({ item, key }) => (
				<div key={key} className="px-3" style={{ height: REEL_ITEM_PX }}>
					{renderItem(item)}
				</div>
			))}
		</div>
	);
}

function MajorReelRow({ item }: { item: MajorReelItem }) {
	const legacy = item.id === LEGACY_MAJOR_REEL_ID;
	return (
		<div className="flex h-full items-center justify-center gap-3">
			<MajorCrest
				major={{ id: item.id, shortName: item.title, logo: item.logo }}
				size="sm"
				loading="eager"
			/>
			<div className="min-w-0 text-left">
				<p
					className={`truncate text-base font-semibold ${legacy ? "text-amber-200" : "text-white"}`}
				>
					{item.title}
				</p>
				<p className="truncate text-[11px] text-zinc-500">{item.subtitle}</p>
			</div>
		</div>
	);
}

function TeamReelRow({
	item,
	org,
	showAppearance,
}: {
	item: TeamReelItem;
	org: Org | undefined;
	showAppearance: boolean;
}) {
	return (
		<div className="flex h-full items-center justify-center gap-3">
			{org ? <OrgCrest org={org} size="sm" loading="eager" /> : null}
			<div className="min-w-0 text-left">
				<p className="truncate text-base font-semibold text-white">{item.name}</p>
				<p className="truncate text-[11px] text-zinc-500">
					{teamReelSubtitle(item, showAppearance)}
				</p>
			</div>
		</div>
	);
}
