import { type Dataset, datasetSchema } from "./schema";

export type DatasetIssue = {
	path: string;
	message: string;
};

export class DatasetValidationError extends Error {
	readonly issues: DatasetIssue[];

	constructor(issues: DatasetIssue[]) {
		super(`Dataset validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
		this.name = "DatasetValidationError";
		this.issues = issues;
	}
}

function uniqueIds(label: string, ids: string[], issues: DatasetIssue[]): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			issues.push({ path: label, message: `duplicate id "${id}"` });
		}
		seen.add(id);
	}
}

export function collectDatasetIssues(data: Dataset): DatasetIssue[] {
	const issues: DatasetIssue[] = [];
	const majorById = new Map(data.majors.map((major) => [major.id, major]));
	const orgIds = new Set(data.orgs.map((org) => org.id));
	const seasonById = new Map(data.playerSeasons.map((season) => [season.id, season]));
	const coachById = new Map(data.coaches.map((coach) => [coach.id, coach]));

	uniqueIds(
		"majors",
		data.majors.map((major) => major.id),
		issues,
	);
	uniqueIds(
		"orgs",
		data.orgs.map((org) => org.id),
		issues,
	);
	uniqueIds(
		"orgYears",
		data.orgYears.map((orgYear) => orgYear.id),
		issues,
	);
	uniqueIds(
		"playerSeasons",
		data.playerSeasons.map((season) => season.id),
		issues,
	);
	uniqueIds(
		"coaches",
		data.coaches.map((coach) => coach.id),
		issues,
	);

	for (const orgYear of data.orgYears) {
		const major = orgYear.majorId ? majorById.get(orgYear.majorId) : undefined;
		if (orgYear.kind === "major" && !major) {
			issues.push({
				path: `orgYears.${orgYear.id}.majorId`,
				message: `unknown Major "${orgYear.majorId}"`,
			});
		}
		if (major && (major.year !== orgYear.year || major.game !== orgYear.game)) {
			issues.push({
				path: `orgYears.${orgYear.id}`,
				message: `does not match Major ${major.id} (year/game)`,
			});
		}
		if (major && orgYear.placement && orgYear.placement > major.teamCount) {
			issues.push({
				path: `orgYears.${orgYear.id}.placement`,
				message: `placement exceeds ${major.id} field size`,
			});
		}
		if (new Set(orgYear.playerSeasonIds).size !== orgYear.playerSeasonIds.length) {
			issues.push({
				path: `orgYears.${orgYear.id}.playerSeasonIds`,
				message: "starter ids must be unique",
			});
		}
		if (!orgIds.has(orgYear.orgId)) {
			issues.push({
				path: `orgYears.${orgYear.id}.orgId`,
				message: `unknown org "${orgYear.orgId}"`,
			});
		}
		if (orgYear.coachId) {
			const coach = coachById.get(orgYear.coachId);
			if (!coach) {
				issues.push({
					path: `orgYears.${orgYear.id}.coachId`,
					message: `unknown coach "${orgYear.coachId}"`,
				});
			}
		}

		for (const seasonId of [...orgYear.playerSeasonIds, ...orgYear.substituteSeasonIds]) {
			const season = seasonById.get(seasonId);
			if (!season) {
				issues.push({
					path: `orgYears.${orgYear.id}.playerSeasonIds`,
					message: `unknown player-season "${seasonId}"`,
				});
				continue;
			}
			if (
				season.orgId !== orgYear.orgId ||
				season.year !== orgYear.year ||
				season.game !== orgYear.game
			) {
				issues.push({
					path: `playerSeasons.${season.id}`,
					message: `does not match org-year ${orgYear.id} (org/year/game)`,
				});
			}
		}
	}

	for (const major of data.majors) {
		const rosters = data.orgYears.filter((roster) => roster.majorId === major.id);
		if (rosters.length !== major.teamCount) {
			issues.push({
				path: `majors.${major.id}.teamCount`,
				message: `expected ${major.teamCount} played rosters, found ${rosters.length}`,
			});
		}
		const placementCounts = new Map<number, number>();
		for (const roster of rosters) {
			placementCounts.set(roster.placement, (placementCounts.get(roster.placement) ?? 0) + 1);
		}
		if ((placementCounts.get(1) ?? 0) !== 1 || (placementCounts.get(2) ?? 0) !== 1) {
			issues.push({
				path: `majors.${major.id}.placement`,
				message: "expected exactly one champion and one runner-up",
			});
		}
		if ((placementCounts.get(3) ?? 0) !== 2) {
			issues.push({
				path: `majors.${major.id}.placement`,
				message: "expected exactly two semifinalists (3rd-4th)",
			});
		}
		if (placementCounts.size < 4) {
			issues.push({
				path: `majors.${major.id}.placement`,
				message: "placement table looks collapsed (need more than 1st/2nd/3rd-4th)",
			});
		}
		if (major.sources.some((source) => !source.revision)) {
			issues.push({
				path: `majors.${major.id}.sources`,
				message: "Major sources require a pinned revision",
			});
		}
	}

	/** Same career, documented flag change (dual national). */
	const multiNationalityPlayerIds = new Set(["volt"]);
	const nationalityByPlayerId = new Map<string, string>();
	for (const season of data.playerSeasons) {
		if (!orgIds.has(season.orgId)) {
			issues.push({
				path: `playerSeasons.${season.id}.orgId`,
				message: `unknown org "${season.orgId}"`,
			});
		}
		const referenced = data.orgYears.some(
			(orgYear) =>
				orgYear.playerSeasonIds.includes(season.id) ||
				orgYear.substituteSeasonIds.includes(season.id),
		);
		if (!referenced) {
			issues.push({
				path: `playerSeasons.${season.id}`,
				message: "not referenced by any org-year",
			});
		}
		if (season.nationality !== "ZZ" && !multiNationalityPlayerIds.has(season.playerId)) {
			const seen = nationalityByPlayerId.get(season.playerId);
			if (!seen) nationalityByPlayerId.set(season.playerId, season.nationality);
			else if (seen !== season.nationality) {
				issues.push({
					path: `playerSeasons.${season.id}.nationality`,
					message: `playerId "${season.playerId}" mixes ${seen} and ${season.nationality}`,
				});
			}
		}
	}

	for (const coach of data.coaches) {
		if (!orgIds.has(coach.orgId)) {
			issues.push({ path: `coaches.${coach.id}.orgId`, message: `unknown org "${coach.orgId}"` });
		}
	}

	return issues;
}

export function parseDataset(input: unknown): Dataset {
	return datasetSchema.parse(input);
}

export function assertValidDataset(data: Dataset): void {
	const issues = collectDatasetIssues(data);
	if (issues.length > 0) {
		throw new DatasetValidationError(issues);
	}
}
