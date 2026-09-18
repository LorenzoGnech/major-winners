import { readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ART_DIR = fileURLToPath(new URL("../public/bonuses/art/", import.meta.url));
const MAX_WIDTH = 960;
const WEBP_QUALITY = 78;
const SOURCE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const RENAME: Record<string, string> = {
	porsche: "new-porsche",
};

async function optimize(): Promise<void> {
	const names = (await readdir(ART_DIR)).filter((name) =>
		SOURCE_EXT.has(path.extname(name).toLowerCase()),
	);
	if (names.length === 0) {
		throw new Error("no overlay art found under public/bonuses/art");
	}
	for (const name of names.sort()) {
		const sourcePath = path.join(ART_DIR, name);
		const rawId = path.basename(name, path.extname(name));
		const id = RENAME[rawId] ?? rawId;
		const destPath = path.join(ART_DIR, `${id}.webp`);
		const tmpPath = `${destPath}.tmp`;
		const before = (await stat(sourcePath)).size;
		await sharp(sourcePath)
			.rotate()
			.resize({ width: MAX_WIDTH, withoutEnlargement: true })
			.webp({ quality: WEBP_QUALITY, effort: 6 })
			.toFile(tmpPath);
		await rename(tmpPath, destPath);
		if (sourcePath !== destPath) {
			await unlink(sourcePath);
		}
		const after = (await stat(destPath)).size;
		const meta = await sharp(destPath).metadata();
		console.log(
			`${id}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB ${meta.width}×${meta.height} webp`,
		);
	}
}

try {
	await optimize();
} catch (error) {
	console.error(error);
	process.exit(1);
}
