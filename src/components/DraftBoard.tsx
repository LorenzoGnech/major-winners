import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { PlayerSeason, Role } from "../data";
import { ROLES } from "../data";
import { playerInitials, playerPhotoSrc } from "../data/playerPhoto";
import { ratePlayer, roleFit } from "../engine";
import { type BonusId, bonusById } from "../engine/bonuses";
import {
	flagEmoji,
	ovrTone,
	playerCardStats,
	playerPanelTone,
	ROLE_LABELS,
} from "./draftPresentation";
import { PlayerCrest } from "./PlayerCrest";
import { TraitBadge, TraitIcons } from "./TraitBadge";

export type PlayerDrag = {
	playerId: string;
	x: number;
	y: number;
	overRole: Role | null;
};

const DRAG_THRESHOLD_PX = 6;

function roleAtPoint(x: number, y: number): Role | null {
	const node = document.elementFromPoint(x, y);
	const slot = node instanceof Element ? node.closest("[data-roster-slot]") : null;
	const role = slot?.getAttribute("data-roster-slot");
	return ROLES.includes(role as Role) ? (role as Role) : null;
}

export function usePlayerDrag(onDrop: (playerSeasonId: string, role: Role) => void) {
	const sessionRef = useRef<{
		playerId: string;
		pointerId: number;
		startX: number;
		startY: number;
		armed: boolean;
	} | null>(null);
	const onDropRef = useRef(onDrop);
	onDropRef.current = onDrop;
	const [drag, setDrag] = useState<PlayerDrag | null>(null);

	useEffect(() => {
		function move(event: PointerEvent) {
			const session = sessionRef.current;
			if (!session || event.pointerId !== session.pointerId) {
				return;
			}
			const dx = event.clientX - session.startX;
			const dy = event.clientY - session.startY;
			if (!session.armed) {
				if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
					return;
				}
				session.armed = true;
				document.body.classList.add("draft-dragging");
			}
			event.preventDefault();
			setDrag({
				playerId: session.playerId,
				x: event.clientX,
				y: event.clientY,
				overRole: roleAtPoint(event.clientX, event.clientY),
			});
		}

		function end(event: PointerEvent) {
			const session = sessionRef.current;
			if (!session || event.pointerId !== session.pointerId) {
				return;
			}
			const overRole = session.armed ? roleAtPoint(event.clientX, event.clientY) : null;
			const playerId = session.playerId;
			sessionRef.current = null;
			setDrag(null);
			document.body.classList.remove("draft-dragging");
			if (overRole) {
				onDropRef.current(playerId, overRole);
			}
		}

		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			document.body.classList.remove("draft-dragging");
		};
	}, []);

	const startDrag = useCallback((playerId: string, event: ReactPointerEvent<HTMLElement>) => {
		if (event.button !== 0) {
			return;
		}
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Untrusted or unsupported capture must not block the drag session.
		}
		sessionRef.current = {
			playerId,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			armed: false,
		};
	}, []);

	return { drag, startDrag };
}

type FitInfo = {
	label: "Primary" | "Secondary" | "Off-role";
	multiplier: 1 | 0.9 | 0.75;
};

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

export function PlayerDraftCard({
	player,
	traits,
	dragging,
	onPointerDown,
	onAssign,
}: {
	player: PlayerSeason;
	traits?: readonly BonusId[];
	dragging: boolean;
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	onAssign: (role: Role) => void;
}) {
	const rated = ratePlayer(player);
	const tone = playerPanelTone(player.playerId);
	const photo = playerPhotoSrc(player);
	const ovrColor = ovrTone(rated.ovr);
	const secondaries = player.roles.filter((role) => role !== player.primaryRole);
	const stats = playerCardStats(player, rated.attributes);
	const traitNames =
		traits && traits.length > 0 ? `. ${traits.map((id) => bonusById(id).name).join(", ")}` : "";

	function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
		const index = Number(event.key) - 1;
		if (index < 0 || index >= ROLES.length) {
			return;
		}
		event.preventDefault();
		const role = ROLES[index];
		if (role) {
			onAssign(role);
		}
	}

	return (
		<button
			type="button"
			aria-grabbed={dragging}
			aria-label={`${player.nick}, ${player.year}, ${ROLE_LABELS[player.primaryRole]}${traitNames}. Drag onto a role slot, or press 1 through 5.`}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			onDragStart={(event) => event.preventDefault()}
			className={`flex min-h-[8.25rem] w-full touch-none overflow-hidden rounded-2xl bg-zinc-900 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 ${
				dragging ? "opacity-40" : "cursor-grab"
			}`}
		>
			<div
				aria-hidden
				className="relative w-[5.75rem] min-h-[8.25rem] shrink-0 self-stretch sm:w-[7.25rem]"
				style={photo ? undefined : tone}
			>
				{photo ? (
					<img
						src={photo}
						alt=""
						draggable={false}
						loading="lazy"
						decoding="async"
						className="absolute inset-0 size-full object-cover object-top"
					/>
				) : (
					<div className="flex h-full items-center justify-center text-3xl font-bold tracking-wide sm:text-4xl">
						{playerInitials(player.nick)}
					</div>
				)}
			</div>
			<div className="flex min-w-0 flex-1 flex-col justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
							<p className="text-lg font-semibold tracking-tight text-white">{player.nick}</p>
							{traits?.map((id) => (
								<TraitBadge key={id} id={id} />
							))}
						</div>
						<p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
							<span aria-hidden>{flagEmoji(player.nationality)}</span>
							<span>{player.year}</span>
						</p>
					</div>
					<div className="flex min-w-0 flex-wrap justify-end gap-1.5">
						<span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
							{ROLE_LABELS[player.primaryRole]} · primary
						</span>
						{secondaries.map((role) => (
							<span
								key={role}
								className="rounded-full border border-white/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
							>
								{ROLE_LABELS[role]} · secondary
							</span>
						))}
					</div>
				</div>
				<div className="flex items-end justify-between gap-4">
					<dl className="flex min-w-0 flex-1 flex-wrap content-end gap-x-5 gap-y-2">
						{stats.map(({ label, value, color }) => (
							<div key={label}>
								<dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
									{label}
								</dt>
								<dd className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl" style={{ color }}>
									{value}
								</dd>
							</div>
						))}
					</dl>
					<div className="shrink-0 text-right">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">OVR</p>
						<p className="text-5xl font-bold leading-none tabular-nums" style={{ color: ovrColor }}>
							{rated.ovr}
						</p>
					</div>
				</div>
			</div>
		</button>
	);
}

export function LiveRoster({
	state,
	playersById,
	previewOvr,
	teamName,
	seedLabel,
	drag,
	draggingPlayer,
	onPointerDown,
	onAssign,
	traitsFor,
}: {
	state: { roster: Partial<Record<Role, { playerSeasonId: string; fit: number }>> };
	playersById: ReadonlyMap<string, PlayerSeason>;
	traitsFor?: (playerSeasonId: string) => readonly BonusId[];
	previewOvr: number | null;
	teamName: string;
	seedLabel: string;
	drag?: PlayerDrag | null;
	draggingPlayer?: PlayerSeason;
	onPointerDown?: (playerSeasonId: string, event: ReactPointerEvent<HTMLElement>) => void;
	onAssign?: (playerSeasonId: string, role: Role) => void;
}) {
	return (
		<section
			aria-labelledby="roster-title"
			className="rounded-2xl border border-white/8 bg-zinc-900/80 p-4"
		>
			<div className="mb-4 flex items-end justify-between gap-4">
				<div>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
						Live roster
					</p>
					<h2 id="roster-title" className="mt-0.5 text-xl font-semibold text-white">
						{teamName}
					</h2>
				</div>
				<div className="text-right">
					<span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
						Draft OVR
					</span>
					<span className="text-2xl font-bold tabular-nums text-white">
						{previewOvr === null ? "—" : previewOvr.toFixed(1)}
					</span>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-2">
				{ROLES.map((role) => {
					const pick = state.roster[role];
					const player = pick ? playersById.get(pick.playerSeasonId) : undefined;
					const ovr = player ? ratePlayer(player).ovr : null;
					const occupied = Boolean(player);
					const hovered = drag?.overRole === role;
					const draggingHere = Boolean(drag && pick && drag.playerId === pick.playerSeasonId);
					const draggedIsPlaced = Boolean(
						drag && ROLES.some((slot) => state.roster[slot]?.playerSeasonId === drag.playerId),
					);
					const droppable = Boolean(drag && !draggingHere && (draggedIsPlaced || !occupied));
					const fit = draggingPlayer && droppable ? fitInfo(draggingPlayer, role) : null;
					return (
						<div
							key={role}
							data-roster-slot={role}
							aria-dropeffect={drag ? (droppable ? "execute" : "none") : undefined}
							className={`min-h-16 rounded-xl px-3 py-2.5 transition ${
								draggingHere
									? "border border-white/20 bg-zinc-950/40 opacity-40"
									: hovered && droppable
										? occupied
											? "border border-amber-300 bg-amber-300/10"
											: "border border-emerald-300 bg-emerald-300/10"
										: occupied
											? "border border-white/12 bg-zinc-950/60"
											: "border border-dashed border-white/12 bg-transparent"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
									{ROLE_LABELS[role]}
								</span>
								{fit ? (
									<span className="text-[10px] text-emerald-200">
										{occupied ? "Swap · " : ""}
										{fit.label} · {fit.multiplier.toFixed(2)}×
									</span>
								) : pick ? (
									<span className="text-[10px] tabular-nums text-emerald-300">
										{pick.fit.toFixed(2)}×
									</span>
								) : null}
							</div>
							{player && pick ? (
								<button
									type="button"
									aria-grabbed={draggingHere}
									aria-label={`${player.nick}, ${ROLE_LABELS[role]}. Drag to another role, or press 1 through 5.`}
									onPointerDown={
										onPointerDown ? (event) => onPointerDown(pick.playerSeasonId, event) : undefined
									}
									onKeyDown={(event) => {
										const index = Number(event.key) - 1;
										if (index < 0 || index >= ROLES.length || !onAssign) {
											return;
										}
										event.preventDefault();
										const nextRole = ROLES[index];
										if (nextRole) {
											onAssign(pick.playerSeasonId, nextRole);
										}
									}}
									onDragStart={(event) => event.preventDefault()}
									className={`mt-1.5 flex w-full touch-none items-center justify-between gap-2 rounded-lg text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 ${
										onPointerDown ? "cursor-grab" : ""
									}`}
								>
									<div className="flex min-w-0 items-center gap-2">
										<PlayerCrest player={player} size="sm" />
										<span className="truncate text-sm font-semibold text-zinc-100">
											{player.nick}
										</span>
										<TraitIcons ids={traitsFor?.(pick.playerSeasonId) ?? []} />
									</div>
									<span
										className="text-sm font-bold tabular-nums"
										style={ovr === null ? undefined : { color: ovrTone(ovr) }}
									>
										{ovr}
									</span>
								</button>
							) : (
								<p className="mt-1 text-xs text-zinc-600">
									{droppable && hovered ? `Drop ${draggingPlayer?.nick ?? "player"}` : "Empty slot"}
								</p>
							)}
						</div>
					);
				})}
			</div>
			<p className="mt-3 text-[11px] leading-4 text-zinc-500">
				Preview = average player OVR × role fit. Drag a placed player to move or swap roles.
			</p>
			<p className="mt-1 text-[10px] tabular-nums text-zinc-600">{seedLabel}</p>
		</section>
	);
}

export function PlayerDragGhost({ player, x, y }: { player: PlayerSeason; x: number; y: number }) {
	const rated = ratePlayer(player);
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed z-50 w-56 rotate-2 rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 shadow-2xl"
			style={{ left: x + 14, top: y - 20 }}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-white">{player.nick}</p>
					<p className="text-[10px] uppercase tracking-wider text-zinc-500">
						{ROLE_LABELS[player.primaryRole]}
					</p>
				</div>
				<span className="text-2xl font-bold tabular-nums" style={{ color: ovrTone(rated.ovr) }}>
					{rated.ovr}
				</span>
			</div>
		</div>
	);
}
