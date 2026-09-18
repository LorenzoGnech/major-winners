export const HOME_HIGHLIGHTS = [
	"/home/video1.mp4",
	"/home/video2.mp4",
	"/home/video3.mp4",
	"/home/video4.mp4",
	"/home/video5.mp4",
	"/home/video6.mp4",
] as const;

export const HIGHLIGHT_SWAP_LEAD_S = 0.12;

export function randomHighlightStart(length: number, pick: () => number = Math.random): number {
	if (length <= 0) return 0;
	return Math.min(length - 1, Math.floor(pick() * length));
}

export function nextHighlightIndex(current: number, length: number): number {
	if (length <= 0) return 0;
	return (current + 1) % length;
}

export function firstPlayableHighlightIndex(
	start: number,
	length: number,
	failed: ReadonlySet<number> = new Set(),
): number | null {
	if (length <= 0) return null;
	const origin = ((start % length) + length) % length;
	for (let step = 0; step < length; step += 1) {
		const index = (origin + step) % length;
		if (!failed.has(index)) return index;
	}
	return null;
}

export function nextPlayableHighlightIndex(
	current: number,
	length: number,
	failed: ReadonlySet<number> = new Set(),
): number | null {
	if (length <= 0) return null;
	return firstPlayableHighlightIndex(nextHighlightIndex(current, length), length, failed);
}

export function shouldPlayHighlights(reducedMotion: boolean, clipCount: number): boolean {
	return !reducedMotion && clipCount > 0;
}

export function remainingToSwap(
	duration: number,
	currentTime: number,
	lead = HIGHLIGHT_SWAP_LEAD_S,
): boolean {
	return Number.isFinite(duration) && duration > 0 && duration - currentTime <= lead;
}
