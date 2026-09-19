import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { gotScraping } from "got-scraping";
import { type BrowserContext, chromium, type Page } from "patchright";
import type { PlayerSeason } from "../src/data";
import {
	applyPlayerPhotos,
	extensionForPhotoUrl,
	type PhotoResolution,
	parseStatsHeadshot,
	publicPhotoPath,
} from "./hltv-photos";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const CACHE_DIR = new URL("../.cache/hltv-import/", import.meta.url);
const PHOTO_DIR = new URL("../public/photos/players/", import.meta.url);
const PROFILE_DIR = ".cache/hltv-import/browser-profile";
const USER_AGENT = "MajorWinners/1.0 (https://major-winners.com)";
const DEFAULT_DELAY_MS = 20_000;
const ERROR_BACKOFF_MS = 90_000;
const MAX_ATTEMPTS = 4;
const PAGE_TIMEOUT_MS = 90_000;
const IMAGE_DELAY_MS = 1100;

/** HLTV search term when our playerId / nick would miss. */
const SEARCH_NAME_BY_PLAYER_ID: Readonly<Record<string, string>> = {
	forest: "f0rest",
};

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

type CachedHeadshot = {
	playerId: string;
	year: number;
	hltvId: number;
	ign: string;
	sourceUrl: string;
	photoUrl?: string;
	fetchedAt: string;
};

type SearchPlayer = {
	id: number;
	nickName: string;
	firstName?: string;
	lastName?: string;
	flagUrl?: string;
};

type YearJob = {
	player: PlayerSeason;
	year: number;
};

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes("--write");
const OFFLINE = ARGS.includes("--offline");
const FORCE = ARGS.includes("--force");
const DRY_RUN = ARGS.includes("--dry-run");
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

const DELAY_MS = Number.parseInt(argValue("--delay-ms") ?? "", 10) || DEFAULT_DELAY_MS;
const LIMIT = Number.parseInt(argValue("--limit") ?? "", 10) || undefined;
const YEAR_FILTER = Number.parseInt(argValue("--year") ?? "", 10) || undefined;
const PLAYER_IDS = new Set(argValues("--player-id"));

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

async function exists(url: URL): Promise<boolean> {
	try {
		await access(url);
		return true;
	} catch {
		return false;
	}
}

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

function searchNameFor(player: Pick<PlayerSeason, "playerId" | "nick">): string {
	return SEARCH_NAME_BY_PLAYER_ID[player.playerId] ?? player.nick;
}

function countryCodeFrom(flagUrl: string | undefined): string | undefined {
	const code = flagUrl?.split("/").pop()?.split(".")[0];
	return code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : undefined;
}

function pickSearchResult(results: SearchPlayer[], searchName: string): SearchPlayer | undefined {
	const wanted = searchName.toLowerCase();
	return results.find((result) => result.nickName?.toLowerCase() === wanted) ?? results[0];
}

function identityCachePath(playerId: string): URL {
	return cacheUrl("identities", `${playerId}.json`);
}

function headshotCachePath(hltvId: number, year: number): URL {
	return cacheUrl("photos", `${hltvId}-${year}.json`);
}

function photoFileUrl(publicPath: string): URL {
	return new URL(`.${publicPath}`, new URL("../public/", import.meta.url));
}

function statsUrl(identity: CachedIdentity, year: number): string {
	const slug = identity.ign.toLowerCase().replace(/[^a-z0-9]+/g, "") || "player";
	return `https://www.hltv.org/stats/players/${identity.hltvId}/${slug}?startDate=${year}-01-01&endDate=${year}-12-31&matchType=Lan`;
}

async function resolveIdentity(player: PlayerSeason): Promise<CachedIdentity | undefined> {
	const cached = await readJson<CachedIdentity>(identityCachePath(player.playerId));
	if (cached) return cached;
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
	const realName = [result.firstName, result.lastName].filter(Boolean).join(" ").trim();
	const identity: CachedIdentity = {
		playerId: player.playerId,
		nick: player.nick,
		searchName,
		hltvId: result.id,
		ign: result.nickName,
		realName: realName || undefined,
		countryCode: countryCodeFrom(result.flagUrl),
		fetchedAt: new Date().toISOString(),
	};
	await writeJson(identityCachePath(player.playerId), identity);
	return identity;
}

function jobsFrom(seasons: PlayerSeason[]): YearJob[] {
	const seen = new Set<string>();
	const jobs: YearJob[] = [];
	for (const season of seasons) {
		if (PLAYER_IDS.size > 0 && !PLAYER_IDS.has(season.playerId)) continue;
		if (YEAR_FILTER && season.year !== YEAR_FILTER) continue;
		const key = `${season.playerId}:${season.year}`;
		if (seen.has(key)) continue;
		seen.add(key);
		jobs.push({ player: season, year: season.year });
	}
	return jobs.sort((a, b) => a.player.playerId.localeCompare(b.player.playerId) || a.year - b.year);
}

async function selectWork(all: YearJob[]): Promise<{
	unfinished: YearJob[];
	cached: number;
}> {
	const unfinished: YearJob[] = [];
	let cached = 0;
	for (const job of all) {
		const identity = await readJson<CachedIdentity>(identityCachePath(job.player.playerId));
		const haveCache =
			!FORCE &&
			identity !== undefined &&
			(await exists(headshotCachePath(identity.hltvId, job.year)));
		if (haveCache) cached += 1;
		else unfinished.push(job);
	}
	return { unfinished, cached };
}

async function scrapeStatsHtml(url: string): Promise<string> {
	return enqueue(async () => {
		const page = await statsPage();
		console.log(`OPEN ${url}`);
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
		await page.waitForSelector(
			".player-summary-stat-box-left-bodyshot, .context-item-image, .stats-row",
			{ timeout: PAGE_TIMEOUT_MS },
		);
		if (isChallenge(await page.content())) {
			throw new Error(`HLTV served a Cloudflare challenge for ${url}`);
		}
		return page.content();
	});
}

async function loadHeadshot(
	job: YearJob,
	identity: CachedIdentity,
	fetchIfMissing: boolean,
): Promise<CachedHeadshot | undefined> {
	const cachePath = headshotCachePath(identity.hltvId, job.year);
	if (!FORCE || OFFLINE) {
		const cached = await readJson<CachedHeadshot>(cachePath);
		if (cached) return cached;
	}
	if (!fetchIfMissing || OFFLINE) {
		if (OFFLINE) console.warn(`missing headshot cache for ${job.player.playerId} ${job.year}`);
		return undefined;
	}
	const sourceUrl = statsUrl(identity, job.year);
	const html = await scrapeStatsHtml(sourceUrl);
	const cached: CachedHeadshot = {
		playerId: job.player.playerId,
		year: job.year,
		hltvId: identity.hltvId,
		ign: identity.ign,
		sourceUrl,
		photoUrl: parseStatsHeadshot(html),
		fetchedAt: new Date().toISOString(),
	};
	await writeJson(cachePath, cached);
	return cached;
}

async function downloadPhoto(url: string, target: URL): Promise<number> {
	const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!response.ok) throw new Error(`${url} returned ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.byteLength === 0) throw new Error(`${url} returned an empty file`);
	await mkdir(new URL("./", target), { recursive: true });
	await writeFile(target, bytes);
	return bytes.byteLength;
}

async function loadSeasons(): Promise<PlayerSeason[]> {
	return JSON.parse(
		await readFile(new URL("player-seasons.json", JSON_DIR), "utf8"),
	) as PlayerSeason[];
}

async function main(): Promise<void> {
	const seasons = await loadSeasons();
	const planned = jobsFrom(seasons);
	const { unfinished, cached } = await selectWork(planned);
	const toFetch = LIMIT === undefined ? unfinished : unfinished.slice(0, LIMIT);
	const fetchKeys = new Set(toFetch.map((job) => `${job.player.playerId}:${job.year}`));
	console.log(
		`${planned.length} player-years (${cached} headshots cached, ${unfinished.length} remaining)` +
			` · this run ${toFetch.length} stats pages · delay ${DELAY_MS}ms` +
			(OFFLINE ? " · offline" : "") +
			(DRY_RUN ? " · dry-run" : "") +
			(WRITE ? " · write" : ""),
	);
	if (DRY_RUN) {
		for (const job of toFetch.slice(0, 15)) {
			console.log(`  headshot ${job.player.playerId} ${job.year}`);
		}
		return;
	}

	await mkdir(CACHE_DIR, { recursive: true });
	const headshots = new Map<string, CachedHeadshot>();
	let identityErrors = 0;
	let fetchErrors = 0;
	const shouldVisit = (job: YearJob): boolean =>
		fetchKeys.has(`${job.player.playerId}:${job.year}`) || WRITE || OFFLINE;

	for (const [index, job] of planned.entries()) {
		if (!shouldVisit(job)) continue;
		const key = `${job.player.playerId}:${job.year}`;
		try {
			const identity = await resolveIdentity(job.player);
			if (!identity) {
				identityErrors += 1;
				continue;
			}
			const row = await loadHeadshot(job, identity, fetchKeys.has(key));
			if (!row) {
				if (fetchKeys.has(key)) fetchErrors += 1;
				continue;
			}
			headshots.set(key, row);
			if (fetchKeys.has(key)) {
				console.log(
					`headshot ${index + 1}/${planned.length} ${job.player.playerId} ${job.year} · ${row.photoUrl ? "bodyshot" : "none"}`,
				);
			}
		} catch (error) {
			fetchErrors += 1;
			console.warn(
				`headshot failed ${job.player.playerId} ${job.year}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
	await closeBrowser();

	const plannedPhotos: (PhotoResolution & { sourceUrl: string })[] = [];
	const unmatched: string[] = [];
	for (const job of planned) {
		const row = headshots.get(`${job.player.playerId}:${job.year}`);
		if (!row) continue;
		if (!row.photoUrl) {
			unmatched.push(`${job.player.playerId} ${job.year}`);
			continue;
		}
		plannedPhotos.push({
			playerId: job.player.playerId,
			year: job.year,
			photo: publicPhotoPath(job.player.playerId, job.year, extensionForPhotoUrl(row.photoUrl)),
			sourceUrl: row.photoUrl,
		});
	}

	console.log(
		`\n${headshots.size} cached pages · ${plannedPhotos.length} year headshots · ${unmatched.length} without a portrait · ${identityErrors} identity errors · ${fetchErrors} fetch errors`,
	);
	for (const row of unmatched.slice(0, 20)) console.log(`  unmatched  ${row}`);
	if (unmatched.length > 20) console.log(`  unmatched  … ${unmatched.length - 20} more`);
	for (const row of plannedPhotos.slice(0, 8)) {
		console.log(`  sample     ${row.playerId} ${row.year} → ${row.photo}`);
	}

	if (!WRITE) {
		console.log("\nDry apply. Pass --write to download images and rewrite player-seasons.json.");
		return;
	}

	await mkdir(PHOTO_DIR, { recursive: true });
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;
	const written: PhotoResolution[] = [];
	for (const [index, row] of plannedPhotos.entries()) {
		const target = photoFileUrl(row.photo);
		if ((await exists(target)) && !FORCE) {
			skipped += 1;
			written.push(row);
			continue;
		}
		try {
			const bytes = await downloadPhoto(row.sourceUrl, target);
			downloaded += 1;
			written.push(row);
			console.log(`  saved      ${row.photo.slice(1).padEnd(42)} ${(bytes / 1024).toFixed(1)} KiB`);
		} catch (error) {
			failed += 1;
			console.error(
				`  failed     ${row.playerId} ${row.year}: ${error instanceof Error ? error.message : error}`,
			);
		}
		if (index < plannedPhotos.length - 1) await sleep(IMAGE_DELAY_MS);
	}

	const previousPaths = new Set(seasons.flatMap((season) => (season.photo ? [season.photo] : [])));
	const { seasons: next, updated } = applyPlayerPhotos(seasons, written, { overwrite: true });
	const nextPaths = new Set(next.flatMap((season) => (season.photo ? [season.photo] : [])));
	for (const oldPath of previousPaths) {
		if (nextPaths.has(oldPath)) continue;
		try {
			await unlink(photoFileUrl(oldPath));
		} catch {
			// leftover gallery file may already be gone
		}
	}
	await writeFile(
		new URL("player-seasons.json", JSON_DIR),
		`${JSON.stringify(next, null, "\t")}\n`,
	);
	console.log(
		`\nphotos ${downloaded} downloaded · ${skipped} already present · ${failed} failed · ${updated} player-seasons now reference a photo`,
	);
}

try {
	await main();
} finally {
	await closeBrowser();
}
