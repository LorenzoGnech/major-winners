import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { applyRoleOverrides, parseRoleOverrides } from "../src/data/roles";
import { playerSeasonSchema } from "../src/data/schema";

const JSON_DIR = new URL("../src/data/json/", import.meta.url);
const out = new URL("player-seasons.json", JSON_DIR);

const seasons = z.array(playerSeasonSchema).parse(JSON.parse(await readFile(out, "utf8")));
const overrides = parseRoleOverrides(
	JSON.parse(await readFile(new URL("role-overrides.json", JSON_DIR), "utf8")),
);
const { seasons: next, applied } = applyRoleOverrides(seasons, overrides);
await writeFile(out, `${JSON.stringify(next, null, "\t")}\n`);
const formatted = spawnSync("npx", ["biome", "check", "--write", fileURLToPath(out)], {
	stdio: "inherit",
});
if (formatted.status) throw new Error("biome failed on player-seasons.json");
console.log(
	`Applied ${applied} curated role overrides → ${path.relative(process.cwd(), fileURLToPath(out))}`,
);
