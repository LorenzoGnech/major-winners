import type { CareerTag } from "./careerTags";
import { mergeCareerTags } from "./careerTags";

const ROLE_ALIASES: Readonly<Record<string, CareerTag>> = {
	awp: { awp: true },
	awper: { awp: true },
	sniper: { awp: true },
	igl: { igl: true },
	"in-game leader": { igl: true },
	"in game leader": { igl: true },
	rifle: { rifle: true },
	rifler: { rifle: true },
};

export type LiquipediaRoleCache = {
	playerId: string;
	page: string;
	roleRaw?: string;
	tags: CareerTag;
	revision?: string;
	fetchedAt: string;
};

export function parseInfoboxRoles(wikitext: string): { raw?: string; tags: CareerTag } {
	const match = wikitext.match(/^\|\s*role\s*=\s*(.+)$/im);
	if (!match?.[1]) return { tags: {} };
	const raw = match[1].trim();
	const cleaned = raw
		.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
		.replace(/'{2,}/g, "")
		.replace(/<[^>]+>/g, " ")
		.toLowerCase();
	const parts = cleaned
		.split(/[,/;]/)
		.map((part) => part.trim())
		.filter(Boolean);
	return { raw, tags: mergeCareerTags(...parts.map((part) => ROLE_ALIASES[part] ?? {})) };
}

export function liquipediaTagFor(
	playerId: string,
	cache: Readonly<Record<string, LiquipediaRoleCache>>,
): CareerTag {
	return cache[playerId]?.tags ?? {};
}
