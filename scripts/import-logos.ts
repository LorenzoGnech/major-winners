import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { Org } from "../src/data";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const CACHE_DIR = new URL("../.cache/major-import/", import.meta.url);
const LOGO_DIR = new URL("../public/logos/", import.meta.url);
const USER_AGENT = "MajorWinners/1.0 (https://major-winners.vercel.app)";
const LIQUIPEDIA = "https://liquipedia.net";
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const THUMB_WIDTH = 128;
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
function crestUrls(src: string): string[] {
	const candidates = [
		src.replace(/\/(\d+)px-([^/]+)$/, `/${THUMB_WIDTH}px-$2`),
		src,
		src.replace(/\/thumb\//, "/").replace(/\/\d+px-[^/]+$/, ""),
	];
	return [...new Set(candidates)].map((candidate) => new URL(candidate, LIQUIPEDIA).toString());
}

function extensionFor(url: string): string {
	const match = /\.(svg|png|jpe?g|webp|gif)(?:$|\?)/i.exec(url);
	return (match?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg");
}

async function collectCandidates(): Promise<Map<string, LogoCandidate>> {
	const candidates = new Map<string, LogoCandidate>();
	const files = (await readdir(CACHE_DIR)).filter((name) => name.endsWith(".html.json"));
	if (files.length === 0) {
		throw new Error("no rendered Major pages cached; run npm run import:majors first");
	}
	for (const file of files) {
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

async function main() {
	const orgs = JSON.parse(await readFile(new URL("orgs.json", JSON_DIR), "utf8")) as Org[];
	const candidates = await collectCandidates();
	await mkdir(LOGO_DIR, { recursive: true });
	const existing = new Set(await readdir(LOGO_DIR).catch(() => []));

	const planned: { org: Org; urls: string[]; file: string }[] = [];
	const missing: Org[] = [];
	for (const org of orgs) {
		const candidate =
			candidates.get(org.id) ?? candidates.get(LOGO_SOURCE_ALIASES[org.id] ?? "") ?? {};
		const src = candidate.darkmode ?? candidate.lightmode;
		if (!src) {
			missing.push(org);
			continue;
		}
		const urls = crestUrls(src);
		planned.push({ org, urls, file: `${org.id}.${extensionFor(src)}` });
	}

	console.log(`${orgs.length} orgs · ${planned.length} resolved · ${missing.length} unmatched`);
	for (const org of missing) console.log(`  unmatched  ${org.id} (${org.name})`);
	if (!WRITE) {
		for (const { org, file, urls } of planned.slice(0, 5)) {
			console.log(`  sample     ${org.id} -> ${file} from ${urls[0]}`);
		}
		console.log("\nDry run. Pass --write to download.");
		return;
	}

	const logoByOrgId = new Map<string, string>();
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;
	for (const { org, urls, file } of planned) {
		logoByOrgId.set(org.id, `/logos/${file}`);
		if (existing.has(file) && !FORCE) {
			skipped++;
			continue;
		}
		try {
			const bytes = await download(urls, new URL(file, LOGO_DIR));
			downloaded++;
			console.log(`  saved      ${file.padEnd(28)} ${(bytes / 1024).toFixed(1)} KiB`);
		} catch (error) {
			failed++;
			logoByOrgId.delete(org.id);
			console.error(`  failed     ${org.id}: ${(error as Error).message}`);
		}
		await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
	}

	const updated = orgs.map((org) => {
		const logo = logoByOrgId.get(org.id);
		return logo ? { ...org, logo } : org;
	});
	await writeFile(new URL("orgs.json", JSON_DIR), `${JSON.stringify(updated, null, "\t")}\n`);
	console.log(
		`\n${downloaded} downloaded · ${skipped} already present · ${failed} failed · ${logoByOrgId.size} orgs reference a logo`,
	);
}

await main();
