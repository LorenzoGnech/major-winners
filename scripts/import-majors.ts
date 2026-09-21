import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Coach, Major, Org, OrgTier, OrgYear, PlayerSeason, Source } from "../src/data";
import { playerIdFor } from "../src/data/playerId";
import { importRolesFor, parseRoleOverrides } from "../src/data/roles";
import { fillCoachModifiers } from "../src/engine/team/coachModifiers";
import { MAJOR_SOURCES, type MajorSource } from "./major-source-manifest";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const CACHE_DIR = new URL("../.cache/major-import/", import.meta.url);
const USER_AGENT = "MajorWinners/1.0 (https://major-winners.com)";
const ACCESSED_AT = new Date().toISOString().slice(0, 10);
const WRITE = process.argv.includes("--write");
const OFFLINE = process.argv.includes("--offline");

type WikiPage = {
	title: string;
	revision: number;
	wikitext: string;
};

type ParsedTeam = {
	name: string;
	players: { nick: string; canonical: string; nationality: string }[];
	coach?: { nick: string; canonical: string; nationality: string };
	substitutes: { nick: string; canonical: string; nationality: string }[];
	placement: number;
	placementVerified: boolean;
	note?: string;
};

const ORG_ALIASES: Record<string, string> = {
	"natus vincere": "navi",
	navi: "navi",
	"ninjas in pyjamas": "nip",
	nip: "nip",
	"faze clan": "faze",
	faze: "faze",
	"sk gaming": "sk",
	sk: "sk",
	fnc: "fnatic",
	"team vitality": "vitality",
	vitality: "vitality",
	"virtus pro": "virtus-pro",
	"virtus.pro": "virtus-pro",
	vp: "virtus-pro",
	"g2 esports": "g2",
	g2: "g2",
	"team liquid": "liquid",
	liquid: "liquid",
	mousesports: "mouz",
	mouz: "mouz",
	"complexity gaming": "complexity",
	complexity: "complexity",
	col: "complexity",
};

const REPLACED_SOURCE_CARDS: Readonly<Record<string, readonly string[]>> = {
	"eleague-boston-2018": ["immortals", "tyloo"],
	"pgl-copenhagen-2024": ["9pandas"],
	"blast-austin-2025": ["bestia"],
};

function slug(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/@/g, "a")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function personId(person: { canonical: string; nick: string; nationality: string }): string {
	return playerIdFor(person.canonical || person.nick, person.nationality);
}

function normalizeTeam(value: string): string {
	return slug(
		value
			.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
			.replace(/\[\[([^\]]+)\]\]/g, "$1")
			.replace(/\{\{!}}/g, "|")
			.replace(/\borig(?:inal)?\b/gi, "")
			.trim(),
	);
}

function teamAcronym(value: string): string {
	return cleanWikiValue(value)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word && !["team", "gaming", "esports", "e", "in", "the"].includes(word))
		.map((word) => word[0])
		.join("");
}

function extractTemplates(text: string, name: string): string[] {
	const output: string[] = [];
	const needle = `{{${name}`;
	let cursor = 0;
	while (cursor < text.length) {
		const start = text.indexOf(needle, cursor);
		if (start < 0) break;
		const next = text[start + needle.length];
		if (next && !/[\s|}]/.test(next)) {
			cursor = start + needle.length;
			continue;
		}
		let depth = 0;
		let index = start;
		for (; index < text.length - 1; index++) {
			const pair = text.slice(index, index + 2);
			if (pair === "{{") {
				depth++;
				index++;
			} else if (pair === "}}") {
				depth--;
				index++;
				if (depth === 0) {
					output.push(text.slice(start + needle.length, index - 1));
					cursor = index + 1;
					break;
				}
			}
		}
		if (depth !== 0) break;
	}
	return output;
}

function splitTopLevel(value: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < value.length; index++) {
		const pair = value.slice(index, index + 2);
		if (pair === "{{" || pair === "[[") {
			depth++;
			index++;
		} else if (pair === "}}" || pair === "]]") {
			depth = Math.max(0, depth - 1);
			index++;
		} else if (value[index] === "|" && depth === 0) {
			parts.push(value.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(value.slice(start));
	return parts;
}

function templateParams(template: string): Map<string, string> {
	const params = new Map<string, string>();
	let position = 0;
	for (const rawPart of splitTopLevel(template)) {
		const part = rawPart.trim();
		if (!part) continue;
		const equals = part.indexOf("=");
		if (equals > 0) {
			params.set(part.slice(0, equals).trim().toLowerCase(), part.slice(equals + 1).trim());
		} else {
			params.set(String(position++), part);
		}
	}
	return params;
}

function section(text: string, heading: string): string {
	const match = new RegExp(`^==${heading}==\\s*$`, "im").exec(text);
	if (!match?.index) return "";
	const start = match.index + match[0].length;
	const rest = text.slice(start);
	const end = /^==[^=].*==\s*$/m.exec(rest);
	return end ? rest.slice(0, end.index) : rest;
}

function cleanWikiValue(value: string | undefined): string {
	if (!value) return "";
	return value
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
		.replace(/<ref[^/]*\/>/gi, "")
		.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/\{\{[^{}]+}}/g, "")
		.replace(/'''?/g, "")
		.trim();
}

function nationalityMap(wikitext: string): Map<string, string> {
	const output = new Map<string, string>();
	const countrySection = wikitext.split(/===Country Representation===/i)[1]?.split(/\n==/)[0] ?? "";
	for (const row of countrySection.split(/\n\|-\s*\n/)) {
		const country = /\{\{Flag\|([^}|]+)[^}]*}}/i.exec(row)?.[1]?.trim().toUpperCase();
		if (country?.length !== 2) continue;
		for (const player of row.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?]]/g)) {
			const canonical = player[1];
			output.set(playerIdFor(canonical, country), country);
		}
	}
	return output;
}

function placementMap(wikitext: string): Map<string, number> {
	const output = new Map<string, number>();
	const prizeHeading = /^={2,4}Prize Pool={2,4}\s*$/im.exec(wikitext);
	const afterHeading = prizeHeading
		? wikitext.slice(prizeHeading.index + prizeHeading[0].length)
		: wikitext;
	const prizeSection = afterHeading.split(/\n==[^=]/)[0] ?? afterHeading;
	for (const template of extractTemplates(prizeSection, "prize pool slot")) {
		const params = templateParams(template);
		const placement = Number.parseInt(params.get("place") ?? "", 10);
		if (!Number.isFinite(placement)) continue;
		for (let index = 0; params.has(String(index)); index++) {
			const candidate = cleanWikiValue(params.get(String(index)));
			if (candidate && !/^(?:true|false|yes|no|\d+)$/i.test(candidate)) {
				output.set(normalizeTeam(candidate), placement);
				output.set(orgIdFor(candidate), placement);
			}
		}
	}
	return output;
}

function decodeHtml(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&nbsp;/g, " ")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function parsePlaceNumber(value: string): number | undefined {
	const text = decodeHtml(value);
	if (/^[WL]$/i.test(text)) return undefined;
	const match = /(\d+)/.exec(text);
	if (!match) return undefined;
	const placement = Number.parseInt(match[1], 10);
	return Number.isFinite(placement) && placement > 0 ? placement : undefined;
}

export function renderedPlacementMap(html: string): Map<string, number> {
	const output = new Map<string, number>();
	const tableStart = html.indexOf("prizepooltable prizepooltable-placement");
	if (tableStart < 0) return output;
	const tableEnd = html.indexOf("</table>", tableStart);
	const table = html.slice(tableStart, tableEnd < 0 ? undefined : tableEnd);
	let currentPlacement: number | undefined;
	for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
		const body = row[1];
		const placeCell =
			/prizepooltable-place[^>]*>([\s\S]*?)<\/td>/i.exec(body)?.[1] ??
			/prizepooltable-badge[^>]*>([\s\S]*?)<\/span>/i.exec(body)?.[1];
		if (placeCell) {
			const parsed = parsePlaceNumber(placeCell);
			if (parsed !== undefined) currentPlacement = parsed;
		}
		const teamName = /<span class="name"[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(body)?.[1];
		if (!currentPlacement || !teamName) continue;
		const name = decodeHtml(teamName);
		output.set(normalizeTeam(name), currentPlacement);
		output.set(orgIdFor(name), currentPlacement);
	}
	return output;
}

function resolvePlacement(name: string, placements: Map<string, number>): number | undefined {
	const keys = [normalizeTeam(name), orgIdFor(name), teamAcronym(name)];
	for (const key of keys) {
		const placement = placements.get(key);
		if (placement !== undefined) return placement;
	}
	const orgId = orgIdFor(name);
	for (const [key, placement] of placements) {
		if (key.length >= 4 && (key.includes(orgId) || orgId.includes(key))) return placement;
	}
	return undefined;
}

function rosterSection(wikitext: string): string {
	const participants = section(wikitext, "Participants");
	if (
		extractTemplates(participants, "TeamCard").length > 0 ||
		extractTemplates(participants, "Opponent").length > 0
	) {
		return participants;
	}
	const firstCard = wikitext.search(/\{\{TeamCard(?=[\s|}])/);
	const results = wikitext.search(/^==Results==\s*$/m);
	return firstCard >= 0 ? wikitext.slice(firstCard, results > firstCard ? results : undefined) : "";
}

function personFromParams(
	params: Map<string, string>,
	key: string,
	nationalities: Map<string, string>,
): { nick: string; canonical: string; nationality: string } | undefined {
	const nick = cleanWikiValue(params.get(key));
	if (!nick) return undefined;
	const canonical = cleanWikiValue(params.get(`${key}link`)) || nick;
	const explicitFlag = cleanWikiValue(params.get(`${key}flag`)).toUpperCase();
	const nationality =
		(explicitFlag.length === 2 ? explicitFlag : undefined) ??
		nationalities.get(playerIdFor(canonical)) ??
		nationalities.get(playerIdFor(nick)) ??
		"ZZ";
	return {
		nick,
		canonical,
		nationality,
	};
}

function personFromTemplate(
	template: string,
	nationalities: Map<string, string>,
): {
	person: { nick: string; canonical: string; nationality: string };
	role?: string;
	played: boolean;
} | null {
	const params = templateParams(template);
	const nick = cleanWikiValue(params.get("0") ?? params.get("1"));
	if (!nick) return null;
	const canonical = cleanWikiValue(params.get("link")) || nick;
	const explicitFlag = cleanWikiValue(params.get("flag")).toUpperCase();
	return {
		person: {
			nick,
			canonical,
			nationality:
				(explicitFlag.length === 2 ? explicitFlag : undefined) ??
				nationalities.get(playerIdFor(canonical)) ??
				nationalities.get(playerIdFor(nick)) ??
				"ZZ",
		},
		role: cleanWikiValue(params.get("role")).toLowerCase() || undefined,
		played: cleanWikiValue(params.get("played")).toLowerCase() !== "false",
	};
}

function parseOpponentTeams(
	participants: string,
	nationalities: Map<string, string>,
	placements: Map<string, number>,
	teamCount: number,
): ParsedTeam[] {
	return extractTemplates(participants, "Opponent")
		.map((template): ParsedTeam | null => {
			const params = templateParams(template);
			const name = cleanWikiValue(params.get("0") ?? params.get("1"));
			if (!name) return null;
			const people = extractTemplates(params.get("players") ?? template, "Person")
				.map((person) => personFromTemplate(person, nationalities))
				.filter((person): person is NonNullable<typeof person> => person !== null);
			const coach = people.find((person) => person.role === "coach")?.person;
			const activePlayers = people
				.filter((person) => person.role !== "coach" && person.played)
				.map((person) => person.person);
			const substitutes = people
				.filter((person) => person.role !== "coach" && !person.played)
				.map((person) => person.person);
			if (activePlayers.length !== 5) return null;
			const exactPlacement = resolvePlacement(name, placements);
			return {
				name,
				players: activePlayers,
				coach,
				substitutes,
				placement: exactPlacement ?? teamCount,
				placementVerified: exactPlacement !== undefined,
				note: exactPlacement
					? undefined
					: "Placement uses the conservative field-floor fallback; roster is revision-pinned.",
			};
		})
		.filter((team): team is ParsedTeam => team !== null);
}

function parseTeams(
	page: WikiPage,
	teamCount: number,
	majorId: string,
	renderedHtml = "",
): ParsedTeam[] {
	const nationalities = nationalityMap(page.wikitext);
	const placements = placementMap(page.wikitext);
	for (const [team, placement] of renderedPlacementMap(renderedHtml)) {
		placements.set(team, placement);
	}
	const participants = rosterSection(page.wikitext);
	const opponentTeams = parseOpponentTeams(participants, nationalities, placements, teamCount);
	if (opponentTeams.length > 0) return opponentTeams;
	const cards = extractTemplates(participants, "TeamCard");
	return cards
		.map((template): ParsedTeam | null => {
			const params = templateParams(template);
			const name = cleanWikiValue(params.get("team") ?? params.get("1"));
			const players = [1, 2, 3, 4, 5]
				.map((index) => personFromParams(params, `p${index}`, nationalities))
				.filter((player): player is NonNullable<typeof player> => Boolean(player));
			if (!name || players.length !== 5) return null;
			const normalized = normalizeTeam(name);
			const exactPlacement = resolvePlacement(name, placements);
			if (normalized.endsWith("-slot") || REPLACED_SOURCE_CARDS[majorId]?.includes(normalized)) {
				return null;
			}
			const substitutes = ["s", "s1", "s2"]
				.map((key) => personFromParams(params, key, nationalities))
				.filter((player): player is NonNullable<typeof player> => Boolean(player));
			const coach = personFromParams(params, "c", nationalities);
			return {
				name,
				players,
				coach,
				substitutes,
				placement: exactPlacement ?? teamCount,
				placementVerified: exactPlacement !== undefined,
				note: exactPlacement
					? undefined
					: "Placement uses the conservative field-floor fallback; roster is revision-pinned.",
			};
		})
		.filter((team): team is ParsedTeam => team !== null);
}

function infobox(page: WikiPage): Map<string, string> {
	const template = extractTemplates(page.wikitext, "Infobox league")[0];
	if (!template) throw new Error(`${page.title}: missing Infobox league`);
	return templateParams(template);
}

function majorFromPage(source: MajorSource, page: WikiPage, logo?: string): Major {
	const info = infobox(page);
	const startDate = cleanWikiValue(info.get("sdate"));
	const endDate = cleanWikiValue(info.get("edate"));
	const year = Number.parseInt(startDate.slice(0, 4), 10);
	const name = cleanWikiValue(info.get("name")) || page.title.replaceAll("/", " ");
	const city = cleanWikiValue(info.get("city"));
	const country = cleanWikiValue(info.get("country"));
	const sourceRow: Source = {
		label: "Liquipedia",
		url: `https://liquipedia.net/counterstrike/${page.title.replaceAll(" ", "_")}`,
		revision: String(page.revision),
		accessedAt: ACCESSED_AT,
	};
	return {
		id: source.id,
		name,
		shortName: name.replace(/(?:Major Championship|Major):?\s*/i, "").trim(),
		year,
		game: year >= 2024 ? "cs2" : "csgo",
		startDate,
		endDate,
		location: [city, country].filter(Boolean).join(", ") || "Unknown",
		teamCount: Number.parseInt(cleanWikiValue(info.get("team_number")), 10),
		...(logo ? { logo } : {}),
		sources: [sourceRow],
	};
}

function fallbackOvr(placement: number, teamCount: number, slot: number): number {
	const base =
		placement <= 1
			? 84
			: placement <= 2
				? 82
				: placement <= 4
					? 80
					: placement <= 8
						? 77
						: placement <= 16
							? 74
							: placement <= 24
								? 71
								: 69;
	const slotOffset = [0, 2, 1, 0, -1][slot] ?? 0;
	return Math.max(65, Math.min(88, base + slotOffset - (teamCount >= 32 ? 1 : 0)));
}

function tierFromPlacement(placement: number): OrgTier {
	if (placement <= 2) return "legendary";
	if (placement <= 8) return "strong";
	return "cult";
}

function orgIdFor(name: string): string {
	return ORG_ALIASES[name.trim().toLowerCase()] ?? slug(name);
}

async function readJson<T>(name: string): Promise<T> {
	return JSON.parse(await readFile(new URL(name, JSON_DIR), "utf8")) as T;
}

async function fetchPage(source: MajorSource): Promise<WikiPage> {
	const cacheFile = new URL(`${source.id}.json`, CACHE_DIR);
	try {
		return JSON.parse(await readFile(cacheFile, "utf8")) as WikiPage;
	} catch {
		if (OFFLINE) throw new Error(`missing cache for ${source.id}`);
	}
	const url = new URL("https://liquipedia.net/counterstrike/api.php");
	for (const [key, value] of Object.entries({
		action: "query",
		prop: "revisions",
		rvprop: "ids|content",
		rvslots: "main",
		titles: source.page,
		redirects: "1",
		format: "json",
		formatversion: "2",
	})) {
		url.searchParams.set(key, value);
	}
	const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!response.ok) throw new Error(`${source.page}: Liquipedia returned ${response.status}`);
	const payload = (await response.json()) as {
		query?: {
			pages?: {
				title: string;
				missing?: boolean;
				revisions?: { revid: number; slots: { main: { content: string } } }[];
			}[];
		};
	};
	const result = payload.query?.pages?.[0];
	const revision = result?.revisions?.[0];
	if (!result || result.missing || !revision) throw new Error(`${source.page}: page not found`);
	const page = {
		title: result.title,
		revision: revision.revid,
		wikitext: revision.slots.main.content,
	};
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cacheFile, `${JSON.stringify(page)}\n`);
	await new Promise((resolve) => setTimeout(resolve, 2100));
	return page;
}

async function fetchRenderedPage(source: MajorSource): Promise<string> {
	const cacheFile = new URL(`${source.id}.html.json`, CACHE_DIR);
	try {
		const cached = JSON.parse(await readFile(cacheFile, "utf8")) as { html: string };
		return cached.html;
	} catch {
		if (OFFLINE) return "";
	}
	const url = new URL("https://liquipedia.net/counterstrike/api.php");
	for (const [key, value] of Object.entries({
		action: "parse",
		page: source.page,
		prop: "text",
		format: "json",
	})) {
		url.searchParams.set(key, value);
	}
	const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!response.ok) throw new Error(`${source.page}: Liquipedia parse returned ${response.status}`);
	const payload = (await response.json()) as { parse?: { text?: { "*": string } } };
	const html = payload.parse?.text?.["*"];
	if (!html) throw new Error(`${source.page}: rendered placement table is missing`);
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cacheFile, `${JSON.stringify({ html })}\n`);
	await new Promise((resolve) => setTimeout(resolve, 30_100));
	return html;
}

async function main() {
	const existingPlayers = await readJson<PlayerSeason[]>("player-seasons.json");
	const existingCoaches = await readJson<Coach[]>("coaches.json");
	const existingRosters = await readJson<OrgYear[]>("org-years.json");
	const roleOverrides = parseRoleOverrides(await readJson("role-overrides.json"));
	const existingPlayerById = new Map(existingPlayers.map((player) => [player.id, player]));
	const playerById = new Map(
		existingPlayers
			.filter((player) => player.ratingProvenance.kind !== "curated-fallback")
			.map((player) => [player.id, player]),
	);
	const coachById = new Map(existingCoaches.map((coach) => [coach.id, coach]));
	const existingCoachByIdentity = new Map(
		existingCoaches.map((coach) => [
			`${playerIdFor(coach.nick, coach.nationality)}:${coach.year}:${coach.orgId}`,
			coach.id,
		]),
	);
	const existingMajors = await readJson<Major[]>("majors.json");
	const majorLogoById = new Map(
		existingMajors.flatMap((major) => (major.logo ? [[major.id, major.logo] as const] : [])),
	);
	const orgById = new Map((await readJson<Org[]>("orgs.json")).map((org) => [org.id, org]));
	const legacyRosters = existingRosters.filter((roster) => roster.kind === "legacy");
	const majors: Major[] = [];
	const rosters: OrgYear[] = [];
	let verifiedPlacements = 0;

	for (const source of MAJOR_SOURCES) {
		const page = await fetchPage(source);
		const major = majorFromPage(source, page, majorLogoById.get(source.id));
		const renderedHtml = await fetchRenderedPage(source);
		const teams = parseTeams(page, major.teamCount, major.id, renderedHtml);
		if (teams.length !== major.teamCount) {
			throw new Error(
				`${major.id}: expected ${major.teamCount} played TeamCards, parsed ${teams.length}`,
			);
		}
		majors.push(major);
		for (const team of teams) {
			if (team.placementVerified) verifiedPlacements++;
			const orgId = orgIdFor(team.name);
			const playerSeasonIds = team.players.map((player, slot) => {
				const id = `${personId(player)}-${major.year}-${orgId}`;
				const ovr = fallbackOvr(team.placement, major.teamCount, slot);
				if (!playerById.has(id)) {
					const roles = importRolesFor(slot, existingPlayerById.get(id), roleOverrides[id]);
					const existing = existingPlayerById.get(id);
					playerById.set(id, {
						id,
						playerId: personId(player),
						nick: player.nick,
						realName: player.nick,
						nationality: player.nationality,
						year: major.year,
						orgId,
						...(existing?.photo ? { photo: existing.photo } : {}),
						game: major.game,
						...roles,
						dataRegime: "fallback",
						ratingProvenance: {
							kind: "curated-fallback",
							source: `${major.name} placement and TeamCard order`,
							note: "Conservative fallback pending verified individual statistics and role transcription.",
						},
						curated: {
							ovr,
							attributes: {},
							rationale: `Placement-based fallback for ${team.name} at ${major.name}; TeamCard slot is only a weak role prior.`,
						},
						accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
					});
				} else {
					const existing = playerById.get(id);
					if (
						existing?.ratingProvenance.kind === "curated-fallback" &&
						existing.curated &&
						(ovr > existing.curated.ovr ||
							existing.ratingProvenance.source?.endsWith(" substitute"))
					) {
						const roles = importRolesFor(
							slot,
							existingPlayerById.get(id) ?? existing,
							roleOverrides[id],
						);
						playerById.set(id, {
							...existing,
							...roles,
							ratingProvenance: {
								...existing.ratingProvenance,
								source: `${major.name} placement and TeamCard order`,
							},
							curated: {
								...existing.curated,
								ovr,
								rationale: `Best placement-based fallback for ${team.name} in ${major.year}, from ${major.name}; TeamCard slot is only a weak role prior.`,
							},
						});
					}
				}
				return id;
			});
			const substituteSeasonIds = team.substitutes.map((player) => {
				const id = `${personId(player)}-${major.year}-${orgId}`;
				if (!playerById.has(id)) {
					const roles = importRolesFor(3, existingPlayerById.get(id), roleOverrides[id]);
					const existing = existingPlayerById.get(id);
					playerById.set(id, {
						id,
						playerId: personId(player),
						nick: player.nick,
						realName: player.nick,
						nationality: player.nationality,
						year: major.year,
						orgId,
						...(existing?.photo ? { photo: existing.photo } : {}),
						game: major.game,
						...roles,
						dataRegime: "fallback",
						ratingProvenance: { kind: "curated-fallback", source: `${major.name} substitute` },
						curated: {
							ovr: Math.max(65, fallbackOvr(team.placement, major.teamCount, 4) - 1),
							attributes: {},
							rationale: `Conservative substitute fallback for ${team.name} at ${major.name}.`,
						},
						accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
					});
				}
				return id;
			});
			let coachId: string | undefined;
			if (team.coach) {
				const identity = `${personId(team.coach)}:${major.year}:${orgId}`;
				coachId =
					existingCoachByIdentity.get(identity) ?? `${personId(team.coach)}-${major.year}-${orgId}`;
				if (!coachById.has(coachId)) {
					coachById.set(coachId, {
						id: coachId,
						nick: team.coach.nick,
						realName: team.coach.nick,
						nationality: team.coach.nationality,
						year: major.year,
						orgId,
						modifiers: { comeback: 0, economy: 0, antistrat: 0 },
					});
				}
			}
			const countries = team.players
				.map((player) => player.nationality)
				.filter((code) => code !== "ZZ");
			const country =
				countries
					.sort(
						(a, b) =>
							countries.filter((code) => code === b).length -
							countries.filter((code) => code === a).length,
					)
					.at(0) ?? "ZZ";
			if (!orgById.has(orgId)) orgById.set(orgId, { id: orgId, name: team.name, country });
			rosters.push({
				id: `${orgId}-${major.id}`,
				kind: "major",
				majorId: major.id,
				orgId,
				year: major.year,
				game: major.game,
				tier: tierFromPlacement(team.placement),
				placement: team.placement,
				playerSeasonIds,
				substituteSeasonIds,
				coachId,
				sources: major.sources,
				note: team.note,
			});
		}
		console.log(
			`${major.id.padEnd(30)} ${teams.length} teams · ${teams.filter((team) => team.placementVerified).length} exact placements · rev ${page.revision}`,
		);
	}

	const referencedIds = new Set(
		[...legacyRosters, ...rosters].flatMap((roster) => [
			...roster.playerSeasonIds,
			...roster.substituteSeasonIds,
		]),
	);
	const players = [...playerById.values()].filter((player) => referencedIds.has(player.id));
	const played = rosters.length;
	console.log(
		`\n${majors.length} Majors · ${played} played rosters · ${players.length} player-seasons · ${verifiedPlacements} exact placement matches`,
	);
	if (majors.length !== 24) throw new Error(`expected 24 Majors, got ${majors.length}`);
	if (played !== 511) throw new Error(`expected 511 played rosters, got ${played}`);

	if (WRITE) {
		const orgYears = [...legacyRosters, ...rosters];
		const coaches = fillCoachModifiers(
			[...coachById.values()].sort((a, b) => a.id.localeCompare(b.id)),
			orgYears,
		);
		const outputs: [string, unknown][] = [
			["majors.json", majors],
			["orgs.json", [...orgById.values()].sort((a, b) => a.id.localeCompare(b.id))],
			["org-years.json", orgYears],
			["player-seasons.json", players.sort((a, b) => a.id.localeCompare(b.id))],
			["coaches.json", coaches],
		];
		for (const [name, value] of outputs) {
			await writeFile(new URL(name, JSON_DIR), `${JSON.stringify(value, null, "\t")}\n`);
		}
		console.log(
			`Wrote ${outputs.length} datasets under ${path.relative(process.cwd(), fileURLToPath(JSON_DIR))}`,
		);
	}
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
	await main();
}
