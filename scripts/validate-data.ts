import { DatasetValidationError, loadDataset } from "../src/data";

try {
	const dataset = loadDataset();
	const lines = [
		`majors          ${dataset.majors.length}`,
		`orgs            ${dataset.orgs.length}`,
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
