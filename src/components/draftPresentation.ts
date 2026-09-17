import type { Game, OrgTier, PlayerSeason, Role } from "../data";

export const ROLE_LABELS: Record<Role, string> = {
	awp: "AWP",
	igl: "IGL",
	entry: "Entry",
	support: "Support",
	lurker: "Lurker",
};

export const GAME_LABELS: Record<Game, string> = {
	cs16: "Counter-Strike 1.6",
	css: "Counter-Strike: Source",
	csgo: "CS:GO",
	cs2: "Counter-Strike 2",
};

export const TIER_LABELS: Record<OrgTier, string> = {
	legendary: "Legendary",
	strong: "Strong",
	cult: "Cult",
};

export const TIER_STYLES: Record<OrgTier, string> = {
	legendary: "border-amber-300/40 bg-amber-300/10 text-amber-200",
	strong: "border-sky-300/40 bg-sky-300/10 text-sky-200",
	cult: "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200",
};

const PANEL_HUES = [210, 168, 142, 272, 38, 16] as const;

/** Saturated left-rail color for a draft player row. Stable per `playerId`. */
export function playerPanelTone(playerId: string): { background: string; color: string } {
	let hash = 0;
	for (const char of playerId) {
		hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
	}
	const hue = PANEL_HUES[hash % PANEL_HUES.length] ?? 210;
	return {
		background: `linear-gradient(180deg, hsl(${hue} 52% 38%), hsl(${hue} 48% 20%))`,
		color: "white",
	};
}

export type PlayerCardStat = {
	label: string;
	value: string;
	color: string;
};

type HeatRange = {
	lo: number;
	hi: number;
	invert?: boolean;
};

/**
 * p10–p90 of committed Major-participant LAN seasons. Presentation only — not the
 * elite OVR reference, and not z-scored inside a five-man card.
 */
const STAT_RANGE = {
	rating10: { lo: 0.89, hi: 1.13 },
	rating20: { lo: 0.93, hi: 1.16 },
	kpr: { lo: 0.59, hi: 0.75 },
	dpr: { lo: 0.61, hi: 0.71, invert: true },
	adr: { lo: 66, hi: 81 },
	kast: { lo: 67, hi: 74 },
	impact: { lo: 0.85, hi: 1.2 },
	attribute: { lo: 55, hi: 92 },
	ovr: { lo: 55, hi: 90 },
} as const satisfies Record<string, HeatRange>;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** 0 = floor of the pool band, 1 = ceiling. DPR passes invert so low deaths score high. */
export function heatT(value: number, range: HeatRange): number {
	if (range.hi === range.lo) {
		return 0.5;
	}
	const t = clamp01((value - range.lo) / (range.hi - range.lo));
	return range.invert ? 1 - t : t;
}

/** Continuous red → amber → green, tuned for zinc-900 text. */
export function heatColor(t: number): string {
	const x = clamp01(t);
	const hue = 8 + x * 130;
	return `hsl(${hue} 78% 58%)`;
}

function statTone(value: number, range: HeatRange): string {
	return heatColor(heatT(value, range));
}

function formatRate(value: number): string {
	return value.toFixed(2);
}

function formatAdr(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatKast(value: number): string {
	return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}%`;
}

function row(label: string, value: string, raw: number, range: HeatRange): PlayerCardStat {
	return { label, value, color: statTone(raw, range) };
}

/** Year-LAN HLTV lines when present; otherwise curated aim/clutch so cards never invent a rating. */
export function playerCardStats(
	player: Pick<PlayerSeason, "stats">,
	fallback: { aim: number; clutch: number },
): PlayerCardStat[] {
	const stats = player.stats;
	if (!stats) {
		return [
			row("Aim", String(fallback.aim), fallback.aim, STAT_RANGE.attribute),
			row("Clutch", String(fallback.clutch), fallback.clutch, STAT_RANGE.attribute),
		];
	}

	const ratingRange = stats.ratingVersion === "1.0" ? STAT_RANGE.rating10 : STAT_RANGE.rating20;
	const rows: PlayerCardStat[] = [
		row("Rating", formatRate(stats.rating), stats.rating, ratingRange),
		row("KPR", formatRate(stats.kpr), stats.kpr, STAT_RANGE.kpr),
		row("DPR", formatRate(stats.dpr), stats.dpr, STAT_RANGE.dpr),
	];
	if (stats.adr !== undefined) {
		rows.push(row("ADR", formatAdr(stats.adr), stats.adr, STAT_RANGE.adr));
	}
	if (stats.kast !== undefined) {
		rows.push(row("KAST", formatKast(stats.kast), stats.kast, STAT_RANGE.kast));
	}
	if (stats.impact !== undefined) {
		rows.push(row("Impact", formatRate(stats.impact), stats.impact, STAT_RANGE.impact));
	}
	return rows;
}

/** OVR on the same red→green scale as card stats, against a 55–90 band. */
export function ovrTone(ovr: number): string {
	return statTone(ovr, STAT_RANGE.ovr);
}

/** ISO 3166-1 alpha-2 to a flag emoji; unknown codes stay as the original letters. */
export function flagEmoji(nationality: string): string {
	const code = nationality.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) {
		return nationality;
	}
	return String.fromCodePoint(
		...[...code].map((char) => 0x1f1e6 - "A".charCodeAt(0) + char.charCodeAt(0)),
	);
}
