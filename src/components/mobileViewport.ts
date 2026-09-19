const VIEWPORT_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";

/** Snap iOS Safari back to scale 1 after a pinch or layout-width expansion. */
export function resetMobileViewport(): void {
	if (typeof document === "undefined") return;
	const meta = document.querySelector('meta[name="viewport"]');
	if (!(meta instanceof HTMLMetaElement)) return;
	meta.content = `${VIEWPORT_CONTENT}, maximum-scale=1`;
	window.scrollTo(0, 0);
	window.requestAnimationFrame(() => {
		meta.content = VIEWPORT_CONTENT;
	});
}
