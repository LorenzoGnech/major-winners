import type { Org } from "./schema";

const SKIP_WORDS = new Set(["team", "gaming", "esports", "esport", "clan", "the"]);

export function orgLogoSrc(org: Pick<Org, "logo">): string | undefined {
	return org.logo;
}

/** Fallback crest text for an org whose logo file has not been imported. */
export function orgInitials(name: string): string {
	const parts = name
		.split(/[\s._/-]+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && !SKIP_WORDS.has(part.toLowerCase()));
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	const letters = parts.map((part) => part[0]).join("");
	if (letters.length >= 2) return letters.slice(0, 3).toUpperCase();
	return (
		name
			.replaceAll(/[^a-zA-Z0-9]/g, "")
			.slice(0, 2)
			.toUpperCase() || "?"
	);
}

export function orgCrestTone(orgId: string): { background: string; foreground: string } {
	let hash = 0;
	for (const char of orgId) {
		hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
	}
	const hues = [152, 186, 212, 38, 18, 272];
	const hue = hues[hash % hues.length] ?? 152;
	return {
		background: `hsl(${hue} 35% 16%)`,
		foreground: `hsl(${hue} 72% 72%)`,
	};
}
