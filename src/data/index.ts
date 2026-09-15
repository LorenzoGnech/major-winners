import coachesJson from "./json/coaches.json" with { type: "json" };
import majorsJson from "./json/majors.json" with { type: "json" };
import orgYearsJson from "./json/org-years.json" with { type: "json" };
import orgsJson from "./json/orgs.json" with { type: "json" };
import playerSeasonsJson from "./json/player-seasons.json" with { type: "json" };
import type { Dataset } from "./schema";
import { assertValidDataset, parseDataset } from "./validate";

export function loadDataset(): Dataset {
	const dataset = parseDataset({
		majors: majorsJson,
		orgs: orgsJson,
		orgYears: orgYearsJson,
		playerSeasons: playerSeasonsJson,
		coaches: coachesJson,
	});
	assertValidDataset(dataset);
	return dataset;
}

export * from "./schema";
export {
	assertValidDataset,
	collectDatasetIssues,
	DatasetValidationError,
	parseDataset,
} from "./validate";
