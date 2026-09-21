const VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";
/** Tailwind `lg` — compact HUD and iOS scroll-snap live below this. */
const DESKTOP_VIEWPORT = "(min-width: 1024px)";

let restoreTimer = 0;

export function isDesktopViewport(): boolean {
	return typeof window !== "undefined" && window.matchMedia(DESKTOP_VIEWPORT).matches;
}

/** Drop focus so unmounting a clicked control does not scroll the page to the top. */
export function blurWithoutScroll(): void {
	if (typeof document === "undefined") return;
	const focused = document.activeElement;
	if (focused instanceof HTMLElement) focused.blur();
}

/** Snap iOS Safari back to scale 1 after a pinch, focus-zoom, or layout-width expansion. */
export function resetMobileViewport(): void {
	if (typeof document === "undefined") return;
	const meta = document.querySelector('meta[name="viewport"]');
	if (!(meta instanceof HTMLMetaElement)) return;
	blurWithoutScroll();
	meta.content = `${VIEWPORT_CONTENT}, maximum-scale=1`;
	if (!isDesktopViewport()) {
		window.scrollTo(0, 0);
	}
	window.clearTimeout(restoreTimer);
	// iOS applies the clamp after blur/layout; one frame often restores too soon.
	restoreTimer = window.setTimeout(() => {
		meta.content = VIEWPORT_CONTENT;
		restoreTimer = 0;
	}, 300);
}
