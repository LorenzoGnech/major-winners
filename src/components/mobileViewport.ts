const VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";

let restoreTimer = 0;

/** Snap iOS Safari back to scale 1 after a pinch, focus-zoom, or layout-width expansion. */
export function resetMobileViewport(): void {
	if (typeof document === "undefined") return;
	const meta = document.querySelector('meta[name="viewport"]');
	if (!(meta instanceof HTMLMetaElement)) return;
	const focused = document.activeElement;
	if (focused instanceof HTMLElement) focused.blur();
	meta.content = `${VIEWPORT_CONTENT}, maximum-scale=1`;
	window.scrollTo(0, 0);
	window.clearTimeout(restoreTimer);
	// iOS applies the clamp after blur/layout; one frame often restores too soon.
	restoreTimer = window.setTimeout(() => {
		meta.content = VIEWPORT_CONTENT;
		restoreTimer = 0;
	}, 300);
}
