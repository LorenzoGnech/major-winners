import type { PlayerSeason } from "../src/data";

export type PhotoResolution = {
	playerId: string;
	year: number;
	photo: string;
};

const HEADSHOT_CLASSES = [
	"player-summary-stat-box-left-bodyshot",
	"context-item-image",
	"summaryBodyshot",
	"summarySquare",
	"bodyshot-img-square",
	"bodyshot-img",
] as const;

const PLACEHOLDER_RE = /bodyshot\/unknown\.png|player_silhouette\.png|player_blank\.png/i;

function decodeHtml(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function srcFromTag(tag: string): string | undefined {
	const src = /(?:src|data-src)="([^"]+)"/i.exec(tag)?.[1];
	return src ? decodeHtml(src) : undefined;
}

export function isPlaceholderHeadshot(url: string): boolean {
	return PLACEHOLDER_RE.test(url);
}

/**
 * Official year-filtered stats portrait: the large summary bodyshot, then the
 * square context crop, then the older summary/profile selectors.
 */
export function parseStatsHeadshot(html: string): string | undefined {
	for (const className of HEADSHOT_CLASSES) {
		const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const tag = new RegExp(`<img\\b[^>]*\\bclass="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, "i").exec(
			html,
		);
		const srcFirst = new RegExp(
			`<img\\b[^>]*\\b(?:src|data-src)="[^"]+"[^>]*\\bclass="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`,
			"i",
		).exec(html);
		const url = srcFromTag(tag?.[0] ?? srcFirst?.[0] ?? "");
		if (url && !isPlaceholderHeadshot(url)) return url;
	}
	return undefined;
}

export function publicPhotoPath(playerId: string, year: number, extension = "png"): string {
	return `/photos/players/${playerId}/${year}.${extension}`;
}

export function extensionForPhotoUrl(url: string): string {
	const match = /\.(svg|png|jpe?g|webp|avif)(?:$|\?)/i.exec(url);
	const ext = (match?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg").replace("avif", "jpg");
	return ext === "svg" || ext === "png" || ext === "jpg" || ext === "webp" ? ext : "png";
}

export function applyPlayerPhotos(
	seasons: PlayerSeason[],
	resolutions: readonly PhotoResolution[],
	options: { overwrite?: boolean } = {},
): { seasons: PlayerSeason[]; updated: number } {
	const byPlayerYear = new Map(
		resolutions.map((row) => [`${row.playerId}:${row.year}`, row.photo] as const),
	);
	let updated = 0;
	const next = seasons.map((season) => {
		const photo = byPlayerYear.get(`${season.playerId}:${season.year}`);
		if (!photo) return season;
		if (season.photo === photo) return season;
		if (season.photo && !options.overwrite) return season;
		updated += 1;
		return { ...season, photo };
	});
	return { seasons: next, updated };
}
