import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type BonusId, bonusById } from "../engine/bonuses";

const ICON_CLASS = {
	sm: "size-6",
	md: "size-8",
} as const;

const BOX_CLASS = {
	sm: "size-8 rounded-lg",
	md: "size-10 rounded-xl",
} as const;

const TIP_WIDTH = 224;

function chanceCopy(blurb: string): string {
	const rest = /^[A-Za-z]/.test(blurb) ? blurb.charAt(0).toLowerCase() + blurb.slice(1) : blurb;
	return `Each round a small chance to ${rest}`;
}

export function TraitBadge({
	id,
	size = "md",
	tip = "center",
}: {
	id: BonusId;
	size?: keyof typeof ICON_CLASS;
	tip?: "center" | "start";
}) {
	const trait = bonusById(id);
	const malus = trait.polarity === "malus";
	const detail = chanceCopy(trait.blurb);
	const [open, setOpen] = useState(false);
	const [hover, setHover] = useState(false);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
	const rootRef = useRef<HTMLSpanElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const tooltipRef = useRef<HTMLSpanElement>(null);
	const hoverTimer = useRef<number>(0);
	const tooltipId = useId();
	const show = open || hover;

	function enterHover(pointerType: string) {
		if (pointerType !== "mouse") return;
		window.clearTimeout(hoverTimer.current);
		setHover(true);
	}

	function leaveHover() {
		window.clearTimeout(hoverTimer.current);
		hoverTimer.current = window.setTimeout(() => setHover(false), 120);
	}

	useLayoutEffect(() => {
		if (!show) {
			setPos(null);
			return;
		}
		function update() {
			const button = buttonRef.current;
			if (!button) {
				return;
			}
			const rect = button.getBoundingClientRect();
			let left = tip === "start" ? rect.left : rect.left + rect.width / 2 - TIP_WIDTH / 2;
			left = Math.max(8, Math.min(left, window.innerWidth - TIP_WIDTH - 8));
			const height = tooltipRef.current?.offsetHeight ?? 80;
			const below = rect.bottom + 8;
			const top = below + height > window.innerHeight - 8 ? rect.top - height - 8 : below;
			setPos({ top, left });
		}
		update();
		window.addEventListener("scroll", update, true);
		window.addEventListener("resize", update);
		return () => {
			window.removeEventListener("scroll", update, true);
			window.removeEventListener("resize", update);
		};
	}, [show, tip]);

	useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (rootRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setOpen(false);
		}
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<span ref={rootRef} className="relative z-20 inline-flex shrink-0">
			<button
				ref={buttonRef}
				type="button"
				aria-expanded={show}
				aria-describedby={show ? tooltipId : undefined}
				aria-label={`${trait.name}. ${detail}`}
				onPointerEnter={(event) => enterHover(event.pointerType)}
				onPointerLeave={leaveHover}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={(event) => {
					event.stopPropagation();
					setOpen((value) => !value);
				}}
				onKeyDown={(event) => event.stopPropagation()}
				className={`flex cursor-pointer items-center justify-center border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
					BOX_CLASS[size]
				} ${
					malus
						? "trait-glow-malus border-red-400/55 bg-red-500/15"
						: "trait-glow-bonus border-emerald-400/55 bg-emerald-500/15"
				}`}
			>
				<img src={trait.icon} alt="" className={ICON_CLASS[size]} />
			</button>
			{show && typeof document !== "undefined"
				? createPortal(
						<span
							ref={tooltipRef}
							id={tooltipId}
							role="tooltip"
							onPointerEnter={(event) => enterHover(event.pointerType)}
							onPointerLeave={leaveHover}
							style={
								pos
									? { top: pos.top, left: pos.left, width: TIP_WIDTH }
									: { visibility: "hidden", top: 0, left: 0, width: TIP_WIDTH }
							}
							className={`fixed z-50 flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left shadow-xl ${
								malus ? "border-red-400/40 bg-zinc-950/95" : "border-emerald-400/40 bg-zinc-950/95"
							}`}
						>
							<span
								className={`text-xs font-bold uppercase tracking-[0.14em] ${
									malus ? "text-red-200" : "text-emerald-200"
								}`}
							>
								{trait.name}
							</span>
							<span className="text-xs leading-5 font-normal normal-case tracking-normal text-zinc-300">
								{detail}
							</span>
						</span>,
						document.body,
					)
				: null}
		</span>
	);
}

export function TraitIcons({ ids }: { ids: readonly BonusId[] }) {
	if (ids.length === 0) return null;
	return (
		<span className="flex items-center gap-1">
			{ids.map((id) => (
				<TraitBadge key={id} id={id} size="sm" tip="start" />
			))}
		</span>
	);
}
