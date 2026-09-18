import { readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const MAPS_DIR = fileURLToPath(new URL("../public/maps/", import.meta.url));
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 78;
const SOURCE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function optimize(): Promise<void> {
	const names = (await readdir(MAPS_DIR)).filter((name) =>
		SOURCE_EXT.has(path.extname(name).toLowerCase()),
	);
	if (names.length === 0) {
		throw new Error("no map images found under public/maps");
	}
	for (const name of names.sort()) {
		const sourcePath = path.join(MAPS_DIR, name);
		const id = path.basename(name, path.extname(name));
		const destName = `${id}.webp`;
		const destPath = path.join(MAPS_DIR, destName);
		const tmpPath = path.join(MAPS_DIR, `${destName}.tmp`);
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
			`${id}: ${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024 / 1024).toFixed(2)}MB ${meta.width}×${meta.height} webp`,
		);
	}
}

try {
	await optimize();
} catch (error) {
	console.error(error);
	process.exit(1);
}
