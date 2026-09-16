import { access } from "node:fs/promises";
import { DatasetValidationError, loadDataset } from "../src/data";

const PUBLIC_DIR = new URL("../public/", import.meta.url);

try {
	const dataset = loadDataset();
	const missingLogos: string[] = [];
	for (const org of dataset.orgs) {
		if (!org.logo) continue;
		try {
			await access(new URL(`.${org.logo}`, PUBLIC_DIR));
		} catch {
			missingLogos.push(`orgs.${org.id}.logo: missing file public${org.logo}`);
		}
	}
	if (missingLogos.length > 0) {
		for (const issue of missingLogos) {
			console.error(issue);
		}
		process.exit(1);
	}
	const lines = [
		`majors          ${dataset.majors.length}`,
		`orgs            ${dataset.orgs.length}`,
		`org logos       ${dataset.orgs.filter((org) => org.logo).length}`,
		`org-years       ${dataset.orgYears.length}`,
		`player-seasons  ${dataset.playerSeasons.length}`,
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
