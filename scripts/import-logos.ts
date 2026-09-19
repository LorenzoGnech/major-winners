import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { Major, Org } from "../src/data";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const CACHE_DIR = new URL("../.cache/major-import/", import.meta.url);
const LOGO_DIR = new URL("../public/logos/", import.meta.url);
const MAJOR_LOGO_DIR = new URL("majors/", LOGO_DIR);
const USER_AGENT = "MajorWinners/1.0 (https://major-winners.com)";
const LIQUIPEDIA = "https://liquipedia.net";
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const ORG_THUMB_WIDTH = 128;
const MAJOR_THUMB_WIDTH = 256;
const REQUEST_DELAY_MS = 1100;

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

/** Orgs whose card name never renders its own team-template icon. */
const LOGO_SOURCE_ALIASES: Record<string, string> = {
	clg: "counter-logic-gaming",
};

type LogoCandidate = { darkmode?: string; lightmode?: string };

function slug(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/@/g, "a")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function orgIdFor(name: string): string {
	return ORG_ALIASES[name.trim().toLowerCase()] ?? slug(name);
}

function decodeAttribute(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, "&");
}

/**
 * Liquipedia serves rescaled thumbnails as `/thumb/<hash>/<file>/<width>px-<file>`.
 * A crest-sized thumbnail keeps the download small, but only already-generated widths
 * resolve, so fall back to the width the page itself rendered and then to the original.
 */
function crestUrls(src: string, width: number): string[] {
	const candidates = [
		src.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`),
		src,
		src.replace(/\/thumb\//, "/").replace(/\/\d+px-[^/]+$/, ""),
	];
	return [...new Set(candidates)].map((candidate) => new URL(candidate, LIQUIPEDIA).toString());
}

function extensionFor(url: string): string {
	const match = /\.(svg|png|jpe?g|webp|gif)(?:$|\?)/i.exec(url);
	return (match?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg");
}

async function cachedHtmlFiles(): Promise<string[]> {
	const files = (await readdir(CACHE_DIR)).filter((name) => name.endsWith(".html.json"));
	if (files.length === 0) {
		throw new Error("no rendered Major pages cached; run npm run import:majors first");
	}
	return files;
}

async function collectOrgCandidates(): Promise<Map<string, LogoCandidate>> {
	const candidates = new Map<string, LogoCandidate>();
	for (const file of await cachedHtmlFiles()) {
		const { html } = JSON.parse(await readFile(new URL(file, CACHE_DIR), "utf8")) as {
			html: string;
		};
		for (const span of html.matchAll(
			/<span class="team-template-image-(?:icon|legacy)[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
		)) {
			const mode = /team-template-(lightmode|darkmode)/.exec(span[0])?.[1] ?? "lightmode";
			const title = /title="([^"]+)"/.exec(span[1])?.[1];
			const src = /<img[^>]*?src="([^"]+)"/.exec(span[1])?.[1];
			if (!title || !src) continue;
			const id = orgIdFor(decodeAttribute(title));
			const entry = candidates.get(id) ?? {};
			if (mode === "darkmode") entry.darkmode ??= src;
			else entry.lightmode ??= src;
			candidates.set(id, entry);
		}
	}
	return candidates;
}

async function collectMajorCandidates(): Promise<Map<string, LogoCandidate>> {
	const candidates = new Map<string, LogoCandidate>();
	for (const file of await cachedHtmlFiles()) {
		const id = file.replace(/\.html\.json$/, "");
		const { html } = JSON.parse(await readFile(new URL(file, CACHE_DIR), "utf8")) as {
			html: string;
		};
		const entry: LogoCandidate = {};
		for (const match of html.matchAll(
			/<div class="infobox-image (lightmode|darkmode)">[\s\S]*?<img[^>]*?src="([^"]+)"/g,
		)) {
			const mode = match[1];
			const src = match[2];
			if (!mode || !src) continue;
			if (mode === "darkmode") entry.darkmode ??= src;
			else entry.lightmode ??= src;
		}
		if (entry.darkmode || entry.lightmode) candidates.set(id, entry);
	}
	return candidates;
}

async function download(urls: readonly string[], target: URL): Promise<number> {
	let lastError = new Error("no candidate URL");
	for (const [index, url] of urls.entries()) {
		if (index > 0) await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
		const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (!response.ok) {
			lastError = new Error(`${url} returned ${response.status}`);
			continue;
		}
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.byteLength === 0) {
			lastError = new Error(`${url} returned an empty file`);
			continue;
		}
		await writeFile(target, bytes);
		return bytes.byteLength;
	}
	throw lastError;
}

type PlannedLogo = { id: string; label: string; urls: string[]; file: string; publicPath: string };

async function savePlanned(
	planned: readonly PlannedLogo[],
	directory: URL,
	existing: ReadonlySet<string>,
): Promise<{ downloaded: number; skipped: number; failed: number; paths: Map<string, string> }> {
	const paths = new Map<string, string>();
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;
	for (const item of planned) {
		paths.set(item.id, item.publicPath);
		if (existing.has(item.file) && !FORCE) {
			skipped++;
			continue;
		}
		try {
			const bytes = await download(item.urls, new URL(item.file, directory));
			downloaded++;
			console.log(`  saved      ${item.file.padEnd(40)} ${(bytes / 1024).toFixed(1)} KiB`);
		} catch (error) {
			failed++;
			paths.delete(item.id);
			console.error(`  failed     ${item.id}: ${(error as Error).message}`);
		}
		await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
	}
	return { downloaded, skipped, failed, paths };
}

async function main() {
	const orgs = JSON.parse(await readFile(new URL("orgs.json", JSON_DIR), "utf8")) as Org[];
	const majors = JSON.parse(await readFile(new URL("majors.json", JSON_DIR), "utf8")) as Major[];
	const orgCandidates = await collectOrgCandidates();
	const majorCandidates = await collectMajorCandidates();
	await mkdir(LOGO_DIR, { recursive: true });
	await mkdir(MAJOR_LOGO_DIR, { recursive: true });
	const existingOrgs = new Set(await readdir(LOGO_DIR).catch(() => []));
	const existingMajors = new Set(await readdir(MAJOR_LOGO_DIR).catch(() => []));

	const plannedOrgs: PlannedLogo[] = [];
	const missingOrgs: Org[] = [];
	for (const org of orgs) {
		const candidate =
			orgCandidates.get(org.id) ?? orgCandidates.get(LOGO_SOURCE_ALIASES[org.id] ?? "") ?? {};
		const src = candidate.darkmode ?? candidate.lightmode;
		if (!src) {
			missingOrgs.push(org);
			continue;
		}
		const file = `${org.id}.${extensionFor(src)}`;
		plannedOrgs.push({
			id: org.id,
			label: org.name,
			urls: crestUrls(src, ORG_THUMB_WIDTH),
			file,
			publicPath: `/logos/${file}`,
		});
	}

	const plannedMajors: PlannedLogo[] = [];
	const missingMajors: Major[] = [];
	for (const major of majors) {
		const candidate = majorCandidates.get(major.id) ?? {};
		const src = candidate.darkmode ?? candidate.lightmode;
		if (!src) {
			missingMajors.push(major);
			continue;
		}
		const file = `${major.id}.${extensionFor(src)}`;
		plannedMajors.push({
			id: major.id,
			label: major.shortName,
			urls: crestUrls(src, MAJOR_THUMB_WIDTH),
			file,
			publicPath: `/logos/majors/${file}`,
		});
	}

	console.log(
		`${orgs.length} orgs · ${plannedOrgs.length} resolved · ${missingOrgs.length} unmatched`,
	);
	for (const org of missingOrgs) console.log(`  unmatched  org ${org.id} (${org.name})`);
	console.log(
		`${majors.length} majors · ${plannedMajors.length} resolved · ${missingMajors.length} unmatched`,
	);
	for (const major of missingMajors) console.log(`  unmatched  major ${major.id}`);
	if (!WRITE) {
		for (const item of [...plannedOrgs.slice(0, 3), ...plannedMajors.slice(0, 3)]) {
			console.log(`  sample     ${item.id} -> ${item.publicPath} from ${item.urls[0]}`);
		}
		console.log("\nDry run. Pass --write to download.");
		return;
	}

	const orgResult = await savePlanned(plannedOrgs, LOGO_DIR, existingOrgs);
	const majorResult = await savePlanned(plannedMajors, MAJOR_LOGO_DIR, existingMajors);

	const updatedOrgs = orgs.map((org) => {
		const logo = orgResult.paths.get(org.id);
		return logo ? { ...org, logo } : org;
	});
	const updatedMajors = majors.map((major) => {
		const logo = majorResult.paths.get(major.id);
		return logo ? { ...major, logo } : major;
	});
	await writeFile(new URL("orgs.json", JSON_DIR), `${JSON.stringify(updatedOrgs, null, "\t")}\n`);
	await writeFile(
		new URL("majors.json", JSON_DIR),
		`${JSON.stringify(updatedMajors, null, "\t")}\n`,
	);
	console.log(
		`\norgs   ${orgResult.downloaded} downloaded · ${orgResult.skipped} already present · ${orgResult.failed} failed · ${orgResult.paths.size} reference a logo`,
	);
	console.log(
		`majors ${majorResult.downloaded} downloaded · ${majorResult.skipped} already present · ${majorResult.failed} failed · ${majorResult.paths.size} reference a logo`,
	);
}

await main();
