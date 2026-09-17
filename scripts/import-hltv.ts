import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gotScraping } from "got-scraping";
import { type BrowserContext, chromium, type Page } from "patchright";
import type { PlayerSeason } from "../src/data";
import { applyHltvCache } from "./hltv-apply";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const CACHE_DIR = new URL("../.cache/hltv-import/", import.meta.url);
const PROFILE_DIR = ".cache/hltv-import/browser-profile";
const DEFAULT_DELAY_MS = 20_000;
const ERROR_BACKOFF_MS = 90_000;
const MAX_ATTEMPTS = 4;
const PAGE_TIMEOUT_MS = 90_000;

/** HLTV search term when our playerId / nick would miss. */
const SEARCH_NAME_BY_PLAYER_ID: Readonly<Record<string, string>> = {
	forest: "f0rest",
};

type MatchFilter = "lan" | "big-events" | "majors" | "all";

type CachedIdentity = {
	playerId: string;
	nick: string;
	searchName: string;
	hltvId: number;
	ign: string;
	realName?: string;
	countryCode?: string;
	fetchedAt: string;
};

/** Raw numbers as printed by HLTV, before any engine-facing interpretation. */
type ScrapedStats = {
	ign?: string;
	ratingLabel?: string;
	rating?: number;
	tRating?: number;
	ctRating?: number;
	kast?: number;
	adr?: number;
	kpr?: number;
	dpr?: number;
	impact?: number;
	mapsPlayed?: number;
	roundsPlayed?: number;
	headshotPercent?: number;
	kdRatio?: number;
	openingKills?: number;
	openingDeaths?: number;
};

type MappedSeasonStats = {
	playerId: string;
	nick: string;
	year: number;
	playerSeasonIds: string[];
	hltvId: number;
	matchFilter: MatchFilter;
	sourceUrl: string;
	fetchedAt: string;
	ratingVersion?: "1.0" | "2.0";
} & ScrapedStats;

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes("--write");
const APPLY = ARGS.includes("--apply");
const OFFLINE = ARGS.includes("--offline");
const FORCE = ARGS.includes("--force");
const DRY_RUN = ARGS.includes("--dry-run");
const IDENTITIES_ONLY = ARGS.includes("--identities-only");
const VERIFIED_ONLY = ARGS.includes("--verified-only");
const INCLUDE_VERIFIED = ARGS.includes("--include-verified");
const WITH_INDIVIDUAL = ARGS.includes("--with-individual");
const HEADLESS = ARGS.includes("--headless");

function argValue(name: string): string | undefined {
	const index = ARGS.indexOf(name);
	if (index < 0) return undefined;
	return ARGS[index + 1];
}

function argValues(name: string): string[] {
	const values: string[] = [];
	for (let index = 0; index < ARGS.length; index++) {
		if (ARGS[index] === name && ARGS[index + 1]) values.push(ARGS[index + 1]);
	}
	return values;
}

function parseMatchFilter(value: string): MatchFilter {
	if (value === "lan" || value === "big-events" || value === "majors" || value === "all")
		return value;
	throw new Error(`unknown --match-type ${value} (lan | big-events | majors | all)`);
}

const DELAY_MS = Number.parseInt(argValue("--delay-ms") ?? "", 10) || DEFAULT_DELAY_MS;
const LIMIT = Number.parseInt(argValue("--limit") ?? "", 10) || undefined;
const YEAR_FILTER = Number.parseInt(argValue("--year") ?? "", 10) || undefined;
const MIN_MAPS = Number.parseInt(argValue("--min-maps") ?? "", 10) || 10;
const PLAYER_IDS = new Set(argValues("--player-id"));
const MATCH_FILTER = parseMatchFilter(argValue("--match-type") ?? "lan");

const MATCH_TYPE_PARAM: Readonly<Record<MatchFilter, string | undefined>> = {
	lan: "Lan",
	"big-events": "BigEvents",
	majors: "Majors",
	all: undefined,
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheUrl(...parts: string[]): URL {
	return new URL(parts.join("/"), CACHE_DIR);
}

async function readJson<T>(url: URL): Promise<T | undefined> {
	try {
		return JSON.parse(await readFile(url, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function writeJson(url: URL, value: unknown): Promise<void> {
	await mkdir(new URL("./", url), { recursive: true });
	await writeFile(url, `${JSON.stringify(value, null, "\t")}\n`);
}

/**
 * Both transports share one gate so the browser and the plain HTTP client can never overlap or
 * bunch up against HLTV.
 */
let lastRequestAt = 0;
let requestChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = async (): Promise<T> => {
		const wait = DELAY_MS - (Date.now() - lastRequestAt);
		if (wait > 0) await sleep(wait);
		try {
			return await task();
		} finally {
			lastRequestAt = Date.now();
		}
	};
	const next = requestChain.then(run, run);
	requestChain = next.then(
		() => undefined,
		() => undefined,
	);
	return next;
}

function isChallenge(body: string): boolean {
	return /just a moment|cf-browser-verification|attention required|_cf_chl/i.test(body);
}

/** Plain HTTP, used for the JSON search endpoint which Cloudflare leaves open. */
async function fetchJsonPage(url: string): Promise<string> {
	return enqueue(async () => {
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			console.log(`GET ${url}`);
			const response = await gotScraping({
				url,
				throwHttpErrors: false,
				retry: { limit: 0 },
				timeout: { request: 60_000 },
			});
			const { body, statusCode } = response;
			if (statusCode >= 200 && statusCode < 300 && !isChallenge(body)) return body;
			if (isChallenge(body)) {
				throw new Error(`HLTV served a Cloudflare challenge (${statusCode}) for ${url}`);
			}
			if (attempt === MAX_ATTEMPTS) {
				throw new Error(`HLTV request failed (${statusCode}) for ${url}`);
			}
			console.warn(
				`HLTV ${statusCode} on attempt ${attempt}/${MAX_ATTEMPTS}; waiting ${ERROR_BACKOFF_MS * attempt}ms`,
			);
			await sleep(ERROR_BACKOFF_MS * attempt);
		}
		throw new Error(`HLTV request failed for ${url}`);
	});
}

/**
 * The /stats/ pages sit behind a Cloudflare JS challenge that header and TLS impersonation cannot
 * solve, so they are loaded in a real Chrome. The persistent profile keeps the clearance cookie
 * between runs. Headless Chrome is detected and hangs on the challenge, so headed is the default.
 */
let browser: BrowserContext | undefined;
let browserPage: Page | undefined;

async function statsPage(): Promise<Page> {
	if (browserPage) return browserPage;
	browser = await chromium.launchPersistentContext(PROFILE_DIR, {
		channel: "chrome",
		headless: HEADLESS,
		viewport: null,
	});
	browserPage = browser.pages()[0] ?? (await browser.newPage());
	browserPage.setDefaultTimeout(PAGE_TIMEOUT_MS);
	return browserPage;
}

async function closeBrowser(): Promise<void> {
	await browser?.close();
	browser = undefined;
	browserPage = undefined;
}

async function scrapeStats(url: string, readySelector: string): Promise<Page> {
	return enqueue(async () => {
		const page = await statsPage();
		console.log(`OPEN ${url}`);
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
		await page.waitForSelector(readySelector, { timeout: PAGE_TIMEOUT_MS });
		return page;
	});
}

function searchNameFor(player: Pick<PlayerSeason, "playerId" | "nick">): string {
	return SEARCH_NAME_BY_PLAYER_ID[player.playerId] ?? player.nick;
}

function yearRange(year: number): { startDate: string; endDate: string } {
	return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function statsCacheKey(hltvId: number, year: number): string {
	return `${hltvId}-${year}-${MATCH_FILTER}`;
}

function statsUrl(identity: CachedIdentity, year: number, section: "" | "individual"): string {
	const { startDate, endDate } = yearRange(year);
	const params = new URLSearchParams({ startDate, endDate });
	const matchTypeParam = MATCH_TYPE_PARAM[MATCH_FILTER];
	if (matchTypeParam) params.set("matchType", matchTypeParam);
	const slug = identity.ign.toLowerCase().replace(/[^a-z0-9]+/g, "") || "player";
	const prefix = section ? `${section}/` : "";
	return `https://www.hltv.org/stats/players/${prefix}${identity.hltvId}/${slug}?${params}`;
}

type SearchPlayer = {
	id: number;
	nickName: string;
	firstName?: string;
	lastName?: string;
	flagUrl?: string;
};

/**
 * The library's getPlayerByName spends a second request on the profile page and parses it with
 * selectors HLTV has since retired. The search response already carries id, nick, real name, and
 * country, so resolve identity from it directly.
 */
function pickSearchResult(results: SearchPlayer[], searchName: string): SearchPlayer | undefined {
	const wanted = searchName.toLowerCase();
	return results.find((result) => result.nickName?.toLowerCase() === wanted) ?? results[0];
}

function countryCodeFrom(flagUrl: string | undefined): string | undefined {
	const code = flagUrl?.split("/").pop()?.split(".")[0];
	return code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : undefined;
}

function identityFrom(
	player: PlayerSeason,
	searchName: string,
	result: SearchPlayer,
): CachedIdentity {
	const realName = [result.firstName, result.lastName].filter(Boolean).join(" ").trim();
	return {
		playerId: player.playerId,
		nick: player.nick,
		searchName,
		hltvId: result.id,
		ign: result.nickName,
		realName: realName || undefined,
		countryCode: countryCodeFrom(result.flagUrl),
		fetchedAt: new Date().toISOString(),
	};
}

async function resolveIdentity(player: PlayerSeason): Promise<CachedIdentity | undefined> {
	const cachePath = identityCachePath(player.playerId);
	if (!FORCE) {
		const cached = await readJson<CachedIdentity>(cachePath);
		if (cached) return cached;
	}
	if (OFFLINE) {
		console.warn(`missing identity cache for ${player.playerId}`);
		return undefined;
	}
	const searchName = searchNameFor(player);
	const body = await fetchJsonPage(
		`https://www.hltv.org/search?term=${encodeURIComponent(searchName)}`,
	);
	const results = (JSON.parse(body) as { players?: SearchPlayer[] }[])[0]?.players ?? [];
	const result = pickSearchResult(results, searchName);
	if (!result) throw new Error(`no HLTV search hit for "${searchName}"`);
	const identity = identityFrom(player, searchName, result);
	await writeJson(cachePath, identity);
	return identity;
}

type RawStatsPage = {
	rows: Record<string, string>;
	cells: Record<string, string>;
	ign: string | null;
	ratingText: string | null;
	ratingLabel: string | null;
	tRatingText: string | null;
	ctRatingText: string | null;
};

/**
 * Runs inside the page, so it stays free of helper functions: tsx compiles those with esbuild's
 * keepNames, whose `__name` wrapper does not exist once the source is serialized into the browser.
 * All interpretation happens back in Node.
 */
function readStatsPage(): RawStatsPage {
	const rows: Record<string, string> = {};
	for (const row of document.querySelectorAll(".stats-row")) {
		const spans = row.querySelectorAll("span");
		const label = spans[0]?.textContent?.trim().toLowerCase();
		const value = spans[1]?.textContent?.trim();
		if (label && value) rows[label] = value;
	}
	const cells: Record<string, string> = {};
	for (const cell of document.querySelectorAll(".player-summary-stat-box-data-wrapper")) {
		const labelEl = cell.querySelector(".player-summary-stat-box-data-text");
		labelEl?.querySelector(".player-summary-tooltip")?.remove();
		const label = labelEl?.textContent?.trim().toLowerCase();
		const value = cell.querySelector(".player-summary-stat-box-data")?.textContent?.trim();
		if (label && value) cells[label] = value;
	}
	return {
		rows,
		cells,
		ign:
			document.querySelector(".player-summary-stat-box-left-nickname")?.textContent?.trim() ?? null,
		ratingText:
			document.querySelector(".player-summary-stat-box-rating-data-text")?.textContent?.trim() ??
			null,
		ratingLabel:
			document
				.querySelector(".player-summary-stat-box-rating-wrapper")
				?.textContent?.match(/Rating\s+\d\.\d/i)?.[0] ?? null,
		tRatingText:
			document
				.querySelector(".t-rating .player-summary-stat-box-rating-data-text")
				?.textContent?.trim() ?? null,
		ctRatingText:
			document
				.querySelector(".ct-rating .player-summary-stat-box-rating-data-text")
				?.textContent?.trim() ?? null,
	};
}

function num(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseFloat(value.replace("%", "").trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The unofficial parser still looks for the `Rating 1.0` / `Rating 2.0` stat rows HLTV retired, so
 * rating, KAST and impact come from the summary box instead.
 */
function toScrapedStats(raw: RawStatsPage): ScrapedStats {
	return {
		ign: raw.ign ?? undefined,
		ratingLabel: raw.ratingLabel ?? undefined,
		rating: num(raw.ratingText),
		tRating: num(raw.tRatingText),
		ctRating: num(raw.ctRatingText),
		kast: num(raw.cells.kast),
		adr: num(raw.cells.adr),
		kpr: num(raw.cells.kpr),
		dpr: num(raw.cells.dpr),
		impact: num(raw.rows["impact rating"]),
		mapsPlayed: num(raw.rows["maps played"]),
		roundsPlayed: num(raw.rows["rounds played"]),
		headshotPercent: num(raw.rows["headshot %"]),
		kdRatio: num(raw.rows["k/d ratio"]),
		openingKills: num(raw.rows["total opening kills"]),
		openingDeaths: num(raw.rows["total opening deaths"]),
	};
}

function normalizeRatingVersion(label: string | undefined): "1.0" | "2.0" | undefined {
	const version = label?.match(/(\d\.\d)/)?.[1];
	return version === "1.0" || version === "2.0" ? version : undefined;
}

async function loadSeasons(): Promise<PlayerSeason[]> {
	return JSON.parse(
		await readFile(new URL("player-seasons.json", JSON_DIR), "utf8"),
	) as PlayerSeason[];
}

type Job = {
	player: PlayerSeason;
	year: number;
	seasonIds: string[];
};

function jobsFrom(seasons: PlayerSeason[]): { identities: PlayerSeason[]; stats: Job[] } {
	const eligible = seasons.filter((season) => {
		if (season.game !== "csgo" && season.game !== "cs2") return false;
		if (VERIFIED_ONLY && season.dataRegime !== "full" && season.dataRegime !== "partial")
			return false;
		if (!VERIFIED_ONLY && !INCLUDE_VERIFIED && season.dataRegime !== "fallback") return false;
		if (PLAYER_IDS.size > 0 && !PLAYER_IDS.has(season.playerId)) return false;
		if (YEAR_FILTER && season.year !== YEAR_FILTER) return false;
		return true;
	});
	const byPlayer = new Map<string, PlayerSeason>();
	const byPlayerYear = new Map<string, Job>();
	for (const season of eligible) {
		if (!byPlayer.has(season.playerId)) byPlayer.set(season.playerId, season);
		const key = `${season.playerId}:${season.year}`;
		const existing = byPlayerYear.get(key);
		if (existing) {
			existing.seasonIds.push(season.id);
			continue;
		}
		byPlayerYear.set(key, { player: season, year: season.year, seasonIds: [season.id] });
	}
	const identities = [...byPlayer.values()].sort((a, b) => a.playerId.localeCompare(b.playerId));
	const stats = [...byPlayerYear.values()].sort(
		(a, b) => a.player.playerId.localeCompare(b.player.playerId) || a.year - b.year,
	);
	return { identities, stats };
}

function identityCachePath(playerId: string): URL {
	return cacheUrl("identities", `${playerId}.json`);
}

function statsCachePath(hltvId: number, year: number): URL {
	return cacheUrl("stats", `${statsCacheKey(hltvId, year)}.json`);
}

async function existsJson(url: URL): Promise<boolean> {
	return (await readJson<unknown>(url)) !== undefined;
}

/**
 * `--limit` counts players that still need a network call, not the first N names alphabetically,
 * so a rerun continues where the last one stopped.
 */
async function selectWork(all: { identities: PlayerSeason[]; stats: Job[] }): Promise<{
	identities: PlayerSeason[];
	stats: Job[];
	cachedIdentities: number;
	cachedStats: number;
	remainingIdentities: number;
	remainingStats: number;
}> {
	const identityCached = new Map<string, boolean>();
	let cachedIdentities = 0;
	for (const player of all.identities) {
		const cached = !FORCE && (await existsJson(identityCachePath(player.playerId)));
		identityCached.set(player.playerId, cached);
		if (cached) cachedIdentities += 1;
	}

	const unfinishedStats = new Set<string>();
	let cachedStats = 0;
	for (const job of all.stats) {
		const identity = identityCached.get(job.player.playerId)
			? await readJson<CachedIdentity>(identityCachePath(job.player.playerId))
			: undefined;
		const cached =
			!FORCE &&
			identity !== undefined &&
			(await existsJson(statsCachePath(identity.hltvId, job.year)));
		if (cached) cachedStats += 1;
		else unfinishedStats.add(job.player.playerId);
	}

	const remainingPlayers = all.identities.filter(
		(player) => !identityCached.get(player.playerId) || unfinishedStats.has(player.playerId),
	);
	const selected = LIMIT === undefined ? remainingPlayers : remainingPlayers.slice(0, LIMIT);
	const allowed = new Set(selected.map((player) => player.playerId));

	return {
		identities: selected,
		stats: all.stats.filter((job) => allowed.has(job.player.playerId)),
		cachedIdentities,
		cachedStats,
		remainingIdentities: remainingPlayers.length,
		remainingStats: all.stats.length - cachedStats,
	};
}

async function fetchSeasonStats(
	job: Job,
	identity: CachedIdentity,
): Promise<MappedSeasonStats | undefined> {
	const cachePath = statsCachePath(identity.hltvId, job.year);
	if (!FORCE) {
		const cached = await readJson<MappedSeasonStats>(cachePath);
		if (cached) return cached;
	}
	if (OFFLINE) {
		console.warn(`missing stats cache for ${job.player.playerId} ${job.year}`);
		return undefined;
	}
	const url = statsUrl(identity, job.year, "");
	const page = await scrapeStats(url, ".stats-row");
	const scraped = toScrapedStats(await page.evaluate(readStatsPage));
	if (scraped.rating === undefined && scraped.mapsPlayed === undefined) {
		throw new Error(`empty stats page for ${job.player.playerId} ${job.year}`);
	}
	if (WITH_INDIVIDUAL) {
		const individualPage = await scrapeStats(
			statsUrl(identity, job.year, "individual"),
			".stats-row",
		);
		const individual = toScrapedStats(await individualPage.evaluate(readStatsPage));
		scraped.openingKills = individual.openingKills;
		scraped.openingDeaths = individual.openingDeaths;
	}
	const mapped: MappedSeasonStats = {
		playerId: job.player.playerId,
		nick: job.player.nick,
		year: job.year,
		playerSeasonIds: job.seasonIds,
		hltvId: identity.hltvId,
		matchFilter: MATCH_FILTER,
		sourceUrl: url,
		fetchedAt: new Date().toISOString(),
		ratingVersion: normalizeRatingVersion(scraped.ratingLabel),
		...scraped,
	};
	await writeJson(cachePath, mapped);
	return mapped;
}

/** Side-by-side check against the hand-transcribed rows, so parser drift is obvious. */
function reportAgainstVerified(mapped: MappedSeasonStats[], seasons: PlayerSeason[]): void {
	const byId = new Map(seasons.map((season) => [season.id, season]));
	const comparisons: string[] = [];
	for (const row of mapped) {
		for (const seasonId of row.playerSeasonIds) {
			const season = byId.get(seasonId);
			const committed = season?.stats;
			if (!season || !committed) continue;
			const delta = (fetched: number | undefined, existing: number | undefined): string => {
				if (fetched === undefined || existing === undefined) return "—";
				const diff = fetched - existing;
				return `${existing} → ${fetched} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`;
			};
			comparisons.push(
				[
					seasonId.padEnd(28),
					`rating ${delta(row.rating, committed.rating).padEnd(24)}`,
					`adr ${delta(row.adr, committed.adr).padEnd(22)}`,
					`kast ${delta(row.kast, committed.kast).padEnd(22)}`,
					`impact ${delta(row.impact, committed.impact)}`,
				].join(" "),
			);
		}
	}
	if (comparisons.length === 0) return;
	console.log(`\nComparison with committed stats (${MATCH_FILTER} filter):`);
	for (const line of comparisons) console.log(`  ${line}`);
}

async function loadCachedStats(): Promise<MappedSeasonStats[]> {
	const dir = fileURLToPath(new URL("stats/", CACHE_DIR));
	let names: string[] = [];
	try {
		names = await readdir(dir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const suffix = `-${MATCH_FILTER}.json`;
	const rows: MappedSeasonStats[] = [];
	for (const name of names) {
		if (!name.endsWith(suffix)) continue;
		const row = await readJson<MappedSeasonStats>(cacheUrl("stats", name));
		if (row) rows.push(row);
	}
	return rows;
}

async function applyCachedStats(seasons: PlayerSeason[]): Promise<void> {
	const {
		seasons: next,
		applied,
		skipped,
	} = applyHltvCache(seasons, await loadCachedStats(), {
		minMaps: MIN_MAPS,
		searchAliases: SEARCH_NAME_BY_PLAYER_ID,
	});
	if (!APPLY) {
		console.log(
			`Cache can promote ${applied} fallback rows (min ${MIN_MAPS} maps). Pass --apply to write player-seasons.json.`,
		);
		return;
	}
	await writeFile(
		new URL("player-seasons.json", JSON_DIR),
		`${JSON.stringify(next, null, "\t")}\n`,
	);
	console.log(
		`Applied ${applied} fallback rows → src/data/json/player-seasons.json · skipped thin ${skipped["thin-sample"]} · incomplete ${skipped.incomplete} · ign mismatch ${skipped["ign-mismatch"]}`,
	);
}

async function main(): Promise<void> {
	const seasons = await loadSeasons();
	const planned = jobsFrom(seasons);
	const { identities, stats, cachedIdentities, cachedStats, remainingIdentities, remainingStats } =
		await selectWork(planned);
	console.log(
		`${planned.identities.length} fallback players (${cachedIdentities} identities cached) · ${planned.stats.length} player-years (${cachedStats} cached, ${remainingStats} remaining)` +
			` · this run ${identities.length} players / ${stats.length} years · delay ${DELAY_MS}ms · filter ${MATCH_FILTER}` +
			(VERIFIED_ONLY ? " · verified-only" : "") +
			(INCLUDE_VERIFIED ? " · include-verified" : "") +
			(OFFLINE ? " · offline" : "") +
			(DRY_RUN ? " · dry-run" : "") +
			(APPLY ? " · apply" : ""),
	);
	if (DRY_RUN) {
		console.log(`  remaining unfinished players: ${remainingIdentities}`);
		for (const player of identities.slice(0, 15)) {
			console.log(`  identity ${player.playerId} (${searchNameFor(player)})`);
		}
		for (const job of stats.slice(0, 15)) {
			console.log(`  stats ${job.player.playerId} ${job.year} → ${job.seasonIds.join(", ")}`);
		}
		return;
	}

	await mkdir(CACHE_DIR, { recursive: true });
	const identityByPlayerId = new Map<string, CachedIdentity>();
	let identityErrors = 0;
	for (const [index, player] of identities.entries()) {
		try {
			const identity = await resolveIdentity(player);
			if (!identity) {
				identityErrors += 1;
				continue;
			}
			identityByPlayerId.set(player.playerId, identity);
			const knownNames = [player.nick, searchNameFor(player)].map((name) => name.toLowerCase());
			if (!knownNames.includes(identity.ign.toLowerCase())) {
				console.warn(
					`ign mismatch ${player.playerId}: dataset "${player.nick}" vs HLTV "${identity.ign}"`,
				);
			}
			console.log(
				`identity ${index + 1}/${identities.length} ${player.playerId} → ${identity.hltvId} (${identity.ign})`,
			);
		} catch (error) {
			identityErrors += 1;
			console.warn(
				`identity failed ${player.playerId}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}

	const mapped: MappedSeasonStats[] = [];
	let statsErrors = 0;
	if (!IDENTITIES_ONLY) {
		for (const [index, job] of stats.entries()) {
			const identity = identityByPlayerId.get(job.player.playerId);
			if (!identity) {
				statsErrors += 1;
				continue;
			}
			try {
				const row = await fetchSeasonStats(job, identity);
				if (!row) {
					statsErrors += 1;
					continue;
				}
				mapped.push(row);
				console.log(
					`stats ${index + 1}/${stats.length} ${job.player.playerId} ${job.year} · maps ${row.mapsPlayed ?? "—"} · ${row.ratingLabel ?? "rating"} ${row.rating ?? "—"} · kast ${row.kast ?? "—"} · impact ${row.impact ?? "—"}`,
				);
			} catch (error) {
				statsErrors += 1;
				console.warn(
					`stats failed ${job.player.playerId} ${job.year}: ${error instanceof Error ? error.message : error}`,
				);
			}
		}
	}
	await closeBrowser();

	const summary = {
		fetchedAt: new Date().toISOString().slice(0, 10),
		matchFilter: MATCH_FILTER,
		players: identityByPlayerId.size,
		playerYears: mapped.length,
		identityErrors,
		statsErrors,
	};
	await writeJson(cacheUrl("summary.json"), summary);
	console.log(
		`\n${summary.players} identities · ${summary.playerYears} season stats · ${identityErrors} identity errors · ${statsErrors} stats errors`,
	);

	reportAgainstVerified(mapped, seasons);
	await applyCachedStats(seasons);

	if (WRITE) {
		const mappedPath = cacheUrl("mapped-player-stats.json");
		await writeJson(
			mappedPath,
			mapped.sort((a, b) => a.playerId.localeCompare(b.playerId) || a.year - b.year),
		);
		console.log(`Wrote ${path.relative(process.cwd(), fileURLToPath(mappedPath))}`);
	}
}

try {
	await main();
} finally {
	await closeBrowser();
}
