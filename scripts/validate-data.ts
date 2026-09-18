import { access, readFile } from "node:fs/promises";
import { HOME_HIGHLIGHTS } from "../src/components/homeHighlights";
import { DatasetValidationError, loadDataset, playerBonusesFileSchema } from "../src/data";
import { parseRoleOverrides } from "../src/data/roles";
import { BONUS_CATALOG, isBonusId } from "../src/engine/bonuses";
import { MAP_POOL } from "../src/engine/sim/maps";

const PUBLIC_DIR = new URL("../public/", import.meta.url);

try {
	const dataset = loadDataset();
	const overrides = parseRoleOverrides(
		JSON.parse(
			await readFile(new URL("../src/data/json/role-overrides.json", import.meta.url), "utf8"),
		),
	);
	const playerBonuses = playerBonusesFileSchema.parse(
		JSON.parse(
			await readFile(new URL("../src/data/json/player-bonuses.json", import.meta.url), "utf8"),
		),
	);
	const seasonIds = new Set(dataset.playerSeasons.map((season) => season.id));
	const missingOverrides = Object.keys(overrides).filter((id) => !seasonIds.has(id));
	if (missingOverrides.length > 0) {
		for (const id of missingOverrides) {
			console.error(`role-overrides.${id}: unknown player-season`);
		}
		process.exit(1);
	}
	const missingBonusSeasons: string[] = [];
	const unknownBonusIds: string[] = [];
	for (const [seasonId, value] of Object.entries(playerBonuses)) {
		if (!seasonIds.has(seasonId)) missingBonusSeasons.push(seasonId);
		for (const bonusId of Array.isArray(value) ? value : [value]) {
			if (!isBonusId(bonusId)) unknownBonusIds.push(`${seasonId}:${bonusId}`);
		}
	}
	if (missingBonusSeasons.length > 0 || unknownBonusIds.length > 0) {
		for (const id of missingBonusSeasons) {
			console.error(`player-bonuses.${id}: unknown player-season`);
		}
		for (const id of unknownBonusIds) {
			console.error(`player-bonuses.${id}: unknown bonus id`);
		}
		process.exit(1);
	}
	const missingBonusIcons: string[] = [];
	for (const trait of BONUS_CATALOG) {
		try {
			await access(new URL(`.${trait.icon}`, PUBLIC_DIR));
		} catch {
			missingBonusIcons.push(`bonuses.${trait.id}: missing file public${trait.icon}`);
		}
		try {
			await access(new URL(`.${trait.art}`, PUBLIC_DIR));
		} catch {
			missingBonusIcons.push(`bonuses.${trait.id}: missing file public${trait.art}`);
		}
	}
	const missingLogos: string[] = [];
	for (const org of dataset.orgs) {
		if (!org.logo) continue;
		try {
			await access(new URL(`.${org.logo}`, PUBLIC_DIR));
		} catch {
			missingLogos.push(`orgs.${org.id}.logo: missing file public${org.logo}`);
		}
	}
	for (const major of dataset.majors) {
		if (!major.logo) continue;
		try {
			await access(new URL(`.${major.logo}`, PUBLIC_DIR));
		} catch {
			missingLogos.push(`majors.${major.id}.logo: missing file public${major.logo}`);
		}
	}
	const missingPhotos: string[] = [];
	for (const season of dataset.playerSeasons) {
		if (!season.photo) continue;
		try {
			await access(new URL(`.${season.photo}`, PUBLIC_DIR));
		} catch {
			missingPhotos.push(`playerSeasons.${season.id}.photo: missing file public${season.photo}`);
		}
	}
	const missingMaps: string[] = [];
	for (const map of MAP_POOL) {
		try {
			await access(new URL(`.${map.background}`, PUBLIC_DIR));
		} catch {
			missingMaps.push(`maps.${map.id}: missing file public${map.background}`);
		}
	}
	const missingHighlights: string[] = [];
	for (const clip of HOME_HIGHLIGHTS) {
		try {
			await access(new URL(`.${clip}`, PUBLIC_DIR));
		} catch {
			missingHighlights.push(`homeHighlights: missing file public${clip}`);
		}
	}
	if (
		missingLogos.length > 0 ||
		missingPhotos.length > 0 ||
		missingBonusIcons.length > 0 ||
		missingMaps.length > 0 ||
		missingHighlights.length > 0
	) {
		for (const issue of [
			...missingLogos,
			...missingPhotos,
			...missingBonusIcons,
			...missingMaps,
			...missingHighlights,
		]) {
			console.error(issue);
		}
		process.exit(1);
	}
	const lines = [
		`majors          ${dataset.majors.length}`,
		`orgs            ${dataset.orgs.length}`,
		`org logos       ${dataset.orgs.filter((org) => org.logo).length}`,
		`major logos     ${dataset.majors.filter((major) => major.logo).length}`,
		`org-years       ${dataset.orgYears.length}`,
		`player-seasons  ${dataset.playerSeasons.length}`,
		`player photos   ${dataset.playerSeasons.filter((season) => season.photo).length}`,
		`map art         ${MAP_POOL.length}`,
		`home highlights ${HOME_HIGHLIGHTS.length}`,
		`role-overrides  ${Object.keys(overrides).length}`,
		`player-bonuses  ${Object.keys(playerBonuses).length}`,
		`coaches         ${dataset.coaches.length}`,
	];
	for (const line of lines) {
		console.log(line);
	}
} catch (error) {
	if (error instanceof DatasetValidationError) {
		for (const issue of error.issues) {
			console.error(`${issue.path}: ${issue.message}`);
		}
	} else {
		console.error(error);
	}
	process.exit(1);
}
