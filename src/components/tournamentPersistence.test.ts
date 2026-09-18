import { describe, expect, it } from "vitest";
import { loadDataset, ROLES } from "../data";
import {
	buildHistoricalOpponents,
	type CompletedDraft,
	createTournament,
	ratePlayers,
} from "../engine";
import {
	COMMUNITY_STORAGE_KEY,
	parsePersistedTournamentRun,
	TOURNAMENT_STORAGE_KEY,
	TOURNAMENT_STORAGE_VERSION,
} from "./tournamentPersistence";

const dataset = loadDataset();
const opponents = buildHistoricalOpponents(dataset, ratePlayers(dataset.playerSeasons));
const playerTeam = opponents[0]?.profile;
if (!playerTeam) throw new Error("test dataset needs an opponent");

const draft: CompletedDraft = {
	seed: 123,
	cards: [],
	coachId: playerTeam.coach.id,
	roster: Object.fromEntries(
		ROLES.map((role) => {
			const member = playerTeam.members.find((candidate) => candidate.slot === role);
			if (!member) throw new Error(`missing ${role}`);
			return [
				role,
				{
					orgYearId: opponents[0]?.id ?? "test",
					playerSeasonId: member.id,
					role,
					fit: member.fit,
				},
			];
		}),
	) as CompletedDraft["roster"],
};

describe("tournament persistence", () => {
	it("restores a compatible serialization roundtrip", () => {
		const tournament = createTournament({ rootSeed: 123, playerTeam, opponents });
		const stored = {
			version: TOURNAMENT_STORAGE_VERSION,
			rootSeed: tournament.rootSeed,
			draft,
			tournament,
		};
		expect(parsePersistedTournamentRun(JSON.stringify(stored), dataset)).toEqual(stored);
	});

	it("restores a custom team name", () => {
		const tournament = createTournament({ rootSeed: 123, playerTeam, opponents });
		const stored = {
			version: TOURNAMENT_STORAGE_VERSION,
			rootSeed: tournament.rootSeed,
			draft,
			tournament,
			teamName: "Copenhagen Flames",
		};
		expect(parsePersistedTournamentRun(JSON.stringify(stored), dataset)?.teamName).toBe(
			"Copenhagen Flames",
		);
	});

	it("rejects an empty team name", () => {
		const tournament = createTournament({ rootSeed: 123, playerTeam, opponents });
		expect(
			parsePersistedTournamentRun(
				JSON.stringify({
					version: TOURNAMENT_STORAGE_VERSION,
					rootSeed: tournament.rootSeed,
					draft,
					tournament,
					teamName: "   ",
				}),
				dataset,
			),
		).toBeNull();
	});

	it("ignores corrupt and incompatible values", () => {
		expect(parsePersistedTournamentRun("{broken", dataset)).toBeNull();
		expect(
			parsePersistedTournamentRun(
				JSON.stringify({ version: TOURNAMENT_STORAGE_VERSION + 1 }),
				dataset,
			),
		).toBeNull();
	});

	it("keeps Versus community on a separate storage key", () => {
		expect(COMMUNITY_STORAGE_KEY).not.toBe(TOURNAMENT_STORAGE_KEY);
	});
});
