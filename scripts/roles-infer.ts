import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	applyRoleOverrides,
	fillOpeningKpr,
	inferPlayerRoles,
	type LiquipediaRoleCache,
	type OpeningKillRow,
	parseInfoboxRoles,
	parseRoleOverrides,
} from "../src/data/roles";
import { orgYearSchema, playerSeasonSchema } from "../src/data/schema";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const HLTV_STATS_DIR = new URL("../.cache/hltv-import/stats/", import.meta.url);
const PLAYER_ROLE_CACHE = new URL("../.cache/player-roles/", import.meta.url);
const USER_AGENT = "MajorWinners/1.0 (https://major-winners.com)";
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const FETCH_ROLES = ARGS.includes("--fetch-roles");

async function readJson<T>(url: URL): Promise<T> {
	return JSON.parse(await readFile(url, "utf8")) as T;
}

async function loadHltvOpeningRows(): Promise<OpeningKillRow[]> {
	let names: string[] = [];
	try {
		names = await readdir(fileURLToPath(HLTV_STATS_DIR));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const rows: OpeningKillRow[] = [];
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const row = await readJson<OpeningKillRow & { matchFilter?: string }>(
			new URL(name, HLTV_STATS_DIR),
		);
		rows.push(row);
	}
	return rows;
}

async function loadLiquipediaTags(): Promise<Record<string, LiquipediaRoleCache["tags"]>> {
	let names: string[] = [];
	try {
		names = await readdir(fileURLToPath(PLAYER_ROLE_CACHE));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
	const tags: Record<string, LiquipediaRoleCache["tags"]> = {};
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const row = await readJson<LiquipediaRoleCache>(new URL(name, PLAYER_ROLE_CACHE));
		tags[row.playerId] = row.tags;
	}
	return tags;
}

async function fetchMissingLiquipediaRoles(playerIds: string[]): Promise<number> {
	const { mkdir } = await import("node:fs/promises");
	await mkdir(PLAYER_ROLE_CACHE, { recursive: true });
	const existing = await loadLiquipediaTags();
	let fetched = 0;
	for (const playerId of playerIds) {
		if (existing[playerId]) continue;
		const url = new URL("https://liquipedia.net/counterstrike/api.php");
		url.searchParams.set("action", "query");
		url.searchParams.set("titles", playerId);
		url.searchParams.set("prop", "revisions");
		url.searchParams.set("rvprop", "content|ids");
		url.searchParams.set("format", "json");
		const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (!response.ok) {
			console.warn(`role fetch failed ${playerId}: ${response.status}`);
			continue;
		}
		const payload = (await response.json()) as {
			query?: {
				pages?: Record<string, { title?: string; revisions?: { "*"?: string; revid?: number }[] }>;
			};
		};
		const page = Object.values(payload.query?.pages ?? {})[0];
		const wikitext = page?.revisions?.[0]?.["*"] ?? "";
		const parsed = parseInfoboxRoles(wikitext);
		const cache: LiquipediaRoleCache = {
			playerId,
			page: page?.title ?? playerId,
			roleRaw: parsed.raw,
			tags: parsed.tags,
			revision: page?.revisions?.[0]?.revid ? String(page.revisions[0].revid) : undefined,
			fetchedAt: new Date().toISOString().slice(0, 10),
		};
		await writeFile(
			new URL(`${playerId}.json`, PLAYER_ROLE_CACHE),
			`${JSON.stringify(cache, null, "\t")}\n`,
		);
		existing[playerId] = parsed.tags;
		fetched += 1;
		await new Promise((resolve) => setTimeout(resolve, 2100));
	}
	return fetched;
}

async function main(): Promise<void> {
	const seasons = z
		.array(playerSeasonSchema)
		.parse(await readJson(new URL("player-seasons.json", JSON_DIR)));
	const orgYears = z
		.array(orgYearSchema)
		.parse(await readJson(new URL("org-years.json", JSON_DIR)));
	const overrides = parseRoleOverrides(await readJson(new URL("role-overrides.json", JSON_DIR)));
	if (FETCH_ROLES) {
		const fetched = await fetchMissingLiquipediaRoles(
			[...new Set(seasons.map((season) => season.playerId))].sort(),
		);
		console.log(`Fetched ${fetched} Liquipedia player Role infoboxes`);
	}
	const { seasons: withOpening, filled } = fillOpeningKpr(seasons, await loadHltvOpeningRows());
	const liquipediaTags = await loadLiquipediaTags();
	const inferred = inferPlayerRoles({
		seasons: withOpening,
		orgYears,
		overrides,
		liquipediaTags,
	});
	const applied = applyRoleOverrides(inferred.seasons, overrides);
	console.log(
		`openingKpr filled ${filled} · inferred ${inferred.inferred} · curated ${applied.applied} · teamcard ${inferred.unchanged}`,
	);
	if (DRY_RUN) return;
	const out = new URL("player-seasons.json", JSON_DIR);
	await writeFile(out, `${JSON.stringify(applied.seasons, null, "\t")}\n`);
	const formatted = spawnSync("npx", ["biome", "check", "--write", fileURLToPath(out)], {
		stdio: "inherit",
	});
	if (formatted.status) throw new Error("biome failed on player-seasons.json");
	console.log(`Wrote ${path.relative(process.cwd(), fileURLToPath(out))}`);
}

await main();
