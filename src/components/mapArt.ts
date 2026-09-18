/** Warm the browser cache so match-board CSS backgrounds do not wait on first paint. */
export function preloadMapArt(urls: readonly string[]): void {
	if (typeof Image === "undefined") return;
	for (const url of new Set(urls.filter(Boolean))) {
		const image = new Image();
		image.decoding = "async";
		image.src = url;
	}
}
