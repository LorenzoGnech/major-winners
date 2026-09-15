import { loadDataset } from "../src/data";
import { ratePlayers } from "../src/engine";

const TOP_N = 15;
const PRINT_N = 50;
const LEGEND_IDS = ["s1mple-2018-navi", "olofmeister-2015-fnatic", "heaton-2003-sk"] as const;

const dataset = loadDataset();
const rated = ratePlayers(dataset.playerSeasons).sort((a, b) => b.ovr - a.ovr);
const byId = new Map(dataset.playerSeasons.map((row) => [row.id, row]));

const pad = (value: string | number, width: number): string => String(value).padEnd(width);

console.log("OVR leaderboard\n");
console.log(
	`${pad("#", 4)}${pad("id", 22)}${pad("ovr", 6)}${pad("z", 8)}${pad("rating", 10)}${pad("accolades", 11)}regime`,
);

for (const [index, row] of rated.slice(0, PRINT_N).entries()) {
	const season = byId.get(row.id);
	const z = row.breakdown.zScore === null ? "—" : row.breakdown.zScore.toFixed(2);
	const fromRating = row.breakdown.fromRating === null ? "—" : row.breakdown.fromRating.toFixed(1);
	console.log(
		`${pad(index + 1, 4)}${pad(row.id, 22)}${pad(row.ovr, 6)}${pad(z, 8)}${pad(fromRating, 10)}${pad(row.breakdown.fromAccolades.toFixed(1), 11)}${season?.dataRegime ?? "?"}`,
	);
}
console.log(`\nShowing top ${Math.min(PRINT_N, rated.length)} of ${rated.length} player-seasons.`);

console.log("\nMean OVR by year\n");
const byYear = new Map<number, number[]>();
for (const row of rated) {
	const season = byId.get(row.id);
	if (!season) {
		continue;
	}
	const list = byYear.get(season.year) ?? [];
	list.push(row.ovr);
	byYear.set(season.year, list);
}
for (const year of [...byYear.keys()].sort()) {
	const values = byYear.get(year) ?? [];
	const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
	console.log(`${year}  n=${values.length}  mean=${mean.toFixed(1)}`);
}

console.log("\nMean OVR by rating provenance\n");
for (const kind of ["verified-stats", "curated-legend", "curated-fallback"] as const) {
	const values = rated
		.filter((row) => byId.get(row.id)?.ratingProvenance.kind === kind)
		.map((row) => row.ovr);
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	console.log(`${kind.padEnd(18)} n=${String(values.length).padEnd(5)} mean=${mean.toFixed(1)}`);
}

console.log("\nSanity\n");
const topIds = rated.slice(0, TOP_N).map((row) => row.id);
const missingLegends = LEGEND_IDS.filter((id) => !topIds.includes(id));
if (missingLegends.length > 0) {
	console.error(`FAIL  legends missing from top ${TOP_N}: ${missingLegends.join(", ")}`);
	process.exitCode = 1;
} else {
	console.log(`ok    ${LEGEND_IDS.join(", ")} are in the top ${TOP_N}`);
}

const topGames = topIds.slice(0, 10).map((id) => byId.get(id)?.game);
const csgoShare = topGames.filter((game) => game === "csgo" || game === "cs2").length;
if (csgoShare === 10) {
	console.error("FAIL  top 10 is entirely CS:GO/CS2 — 1.6 legends were squeezed out");
	process.exitCode = 1;
} else {
	console.log(`ok    top 10 is not a single-game sweep (CS:GO/CS2 share ${csgoShare}/10)`);
}

const fallbackRated = rated.filter(
	(row) => byId.get(row.id)?.ratingProvenance.kind === "curated-fallback",
);
const fallbackMax = Math.max(...fallbackRated.map((row) => row.ovr));
const fallbackTop15 = topIds.filter(
	(id) => byId.get(id)?.ratingProvenance.kind === "curated-fallback",
).length;
if (fallbackMax > 88 || fallbackTop15 > 2) {
	console.error(
		`FAIL  fallback ratings overpower verified legends (max ${fallbackMax}, top-15 count ${fallbackTop15})`,
	);
	process.exitCode = 1;
} else {
	console.log(
		`ok    fallback ceiling remains conservative (max ${fallbackMax}, top-15 count ${fallbackTop15})`,
	);
}
