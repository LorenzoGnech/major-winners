import type { Major } from "./schema";

const SKIP_WORDS = new Set(["the", "major", "open", "one", "tv"]);

export function majorLogoSrc(major: Pick<Major, "logo">): string | undefined {
	return major.logo;
}

/** Fallback mark for a Major whose logo file has not been imported. */
export function majorInitials(name: string): string {
	const parts = name
		.split(/[\s._/-]+/)
		.map((part) => part.trim())
		.filter(
			(part) => part.length > 0 && !SKIP_WORDS.has(part.toLowerCase()) && !/^\d+$/.test(part),
		);
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
