import { type Dataset, datasetSchema, ROLES, type Role } from "./schema";

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
	const orgIds = new Set(data.orgs.map((org) => org.id));
	const seasonById = new Map(data.playerSeasons.map((season) => [season.id, season]));
	const coachById = new Map(data.coaches.map((coach) => [coach.id, coach]));

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

		const fillable = new Set<Role>();
		for (const seasonId of orgYear.playerSeasonIds) {
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
			for (const role of season.roles) {
				fillable.add(role);
			}
		}
		for (const role of ROLES) {
			if (!fillable.has(role)) {
				issues.push({
					path: `orgYears.${orgYear.id}`,
					message: `role "${role}" is not fillable without going fully off-role`,
				});
			}
		}
	}

	for (const season of data.playerSeasons) {
		if (!orgIds.has(season.orgId)) {
			issues.push({
				path: `playerSeasons.${season.id}.orgId`,
				message: `unknown org "${season.orgId}"`,
			});
		}
		const referenced = data.orgYears.some((orgYear) => orgYear.playerSeasonIds.includes(season.id));
		if (!referenced) {
			issues.push({
				path: `playerSeasons.${season.id}`,
				message: "not referenced by any org-year",
			});
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
