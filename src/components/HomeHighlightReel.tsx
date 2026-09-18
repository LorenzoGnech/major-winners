import { useEffect, useRef, useState } from "react";
import {
	firstPlayableHighlightIndex,
	nextPlayableHighlightIndex,
	randomHighlightStart,
	remainingToSwap,
	shouldPlayHighlights,
} from "./homeHighlights";

type BufferId = "a" | "b";

function otherBuffer(id: BufferId): BufferId {
	return id === "a" ? "b" : "a";
}

export function HomeHighlightReel({ clips }: { clips: readonly string[] }) {
	const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const sync = () => setReducedMotion(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);

	if (reducedMotion === null || !shouldPlayHighlights(reducedMotion, clips.length)) {
		return null;
	}

	return <HighlightPlaylist clips={clips} />;
}

function HighlightPlaylist({ clips }: { clips: readonly string[] }) {
	const [active, setActive] = useState<BufferId>("a");
	const [dead, setDead] = useState(false);
	const aRef = useRef<HTMLVideoElement>(null);
	const bRef = useRef<HTMLVideoElement>(null);
	const indexRef = useRef<{ a: number; b: number }>({ a: 0, b: 0 });
	const failedRef = useRef<Set<number>>(new Set());
	const swapLockRef = useRef(false);
	const waitingRef = useRef(false);
	const activeRef = useRef(active);
	activeRef.current = active;

	useEffect(() => {
		failedRef.current = new Set();
		swapLockRef.current = false;
		waitingRef.current = false;
		setDead(false);
		setActive("a");
		activeRef.current = "a";

		const a = aRef.current;
		const b = bRef.current;
		if (!a || clips.length === 0) return;

		const first = firstPlayableHighlightIndex(randomHighlightStart(clips.length), clips.length);
		if (first === null) {
			setDead(true);
			return;
		}

		const assign = (el: HTMLVideoElement, index: number) => {
			el.loop = clips.length === 1;
			el.src = clips[index] ?? "";
			el.load();
		};

		indexRef.current.a = first;
		assign(a, first);
		const next = nextPlayableHighlightIndex(first, clips.length);
		if (b && next !== null && clips.length > 1) {
			indexRef.current.b = next;
			assign(b, next);
		}
		void a.play().catch(() => {});

		return () => {
			for (const el of [a, b]) {
				if (!el) continue;
				el.pause();
				el.removeAttribute("src");
				el.load();
			}
		};
	}, [clips]);

	const element = (id: BufferId) => (id === "a" ? aRef.current : bRef.current);

	const markFailed = (id: BufferId) => {
		failedRef.current.add(indexRef.current[id]);
		if (failedRef.current.size >= clips.length) {
			setDead(true);
			return null;
		}
		return firstPlayableHighlightIndex(indexRef.current[id] + 1, clips.length, failedRef.current);
	};

	const loadInto = (id: BufferId, index: number) => {
		const el = element(id);
		if (!el) return;
		indexRef.current[id] = index;
		el.loop = failedRef.current.size >= clips.length - 1;
		el.src = clips[index] ?? "";
		el.load();
	};

	const recycleOutgoing = (outgoingId: BufferId, incomingIndex: number) => {
		const next = nextPlayableHighlightIndex(incomingIndex, clips.length, failedRef.current);
		if (next === null) return;
		if (failedRef.current.size >= clips.length - 1) {
			const outgoing = element(outgoingId);
			if (outgoing) outgoing.loop = true;
			return;
		}
		loadInto(outgoingId, next);
	};

	const performSwap = () => {
		const incomingId = otherBuffer(activeRef.current);
		const incoming = element(incomingId);
		if (!incoming) return;
		if (incoming.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
			waitingRef.current = true;
			element(activeRef.current)?.pause();
			return;
		}
		swapLockRef.current = true;
		waitingRef.current = false;
		const outgoingId = activeRef.current;
		incoming.currentTime = 0;
		void incoming.play().catch(() => {});
		activeRef.current = incomingId;
		setActive(incomingId);
		recycleOutgoing(outgoingId, indexRef.current[incomingId]);
		requestAnimationFrame(() => {
			swapLockRef.current = false;
		});
	};

	const requestSwap = () => {
		if (swapLockRef.current || clips.length <= 1 || failedRef.current.size >= clips.length - 1) {
			return;
		}
		performSwap();
	};

	const onTimeUpdate = (id: BufferId) => {
		if (id !== activeRef.current) return;
		const el = element(id);
		if (!el || remainingToSwap(el.duration, el.currentTime) === false) return;
		requestSwap();
	};

	const onEnded = (id: BufferId) => {
		if (id !== activeRef.current) return;
		requestSwap();
	};

	const onCanPlay = (id: BufferId) => {
		if (id === activeRef.current) {
			void element(id)
				?.play()
				.catch(() => {});
			return;
		}
		if (waitingRef.current && id === otherBuffer(activeRef.current)) {
			performSwap();
		}
	};

	const onError = (id: BufferId) => {
		const fallback = markFailed(id);
		if (fallback === null) return;
		if (id === activeRef.current) {
			const incoming = element(otherBuffer(id));
			if (incoming && incoming.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
				performSwap();
				return;
			}
		}
		loadInto(id, fallback);
	};

	if (dead) return null;

	return (
		<div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
			<video
				ref={aRef}
				muted
				playsInline
				preload="auto"
				className="absolute inset-0 size-full object-cover"
				style={{ opacity: active === "a" ? 1 : 0 }}
				onTimeUpdate={() => onTimeUpdate("a")}
				onEnded={() => onEnded("a")}
				onCanPlay={() => onCanPlay("a")}
				onError={() => onError("a")}
			/>
			{clips.length > 1 ? (
				<video
					ref={bRef}
					muted
					playsInline
					preload="auto"
					className="absolute inset-0 size-full object-cover"
					style={{ opacity: active === "b" ? 1 : 0 }}
					onTimeUpdate={() => onTimeUpdate("b")}
					onEnded={() => onEnded("b")}
					onCanPlay={() => onCanPlay("b")}
					onError={() => onError("b")}
				/>
			) : null}
		</div>
	);
}
