import { describe, expect, it } from "vitest";
import { loadDataset, ROLES } from "../data";
import {
	buildTeamProfile,
	type CompletedDraft,
	hashStringToSeed,
	ratePlayers,
	roleFit,
} from "../engine";
import { createExhibitionMatch } from "./exhibition";

function astralisDraft(): CompletedDraft {
	const dataset = loadDataset();
	const playersById = new Map(dataset.playerSeasons.map((player) => [player.id, player]));
	const playerIds = {
		awp: "device-2018-astralis",
		igl: "gla1ve-2018-astralis",
		entry: "dupreeh-2018-astralis",
		support: "xyp9x-2018-astralis",
		lurker: "magisk-2018-astralis",
	} as const;

	return {
		seed: 12345,
		cards: [],
		coachId: "zonic-2018",
		roster: Object.fromEntries(
			ROLES.map((role) => {
				const playerSeasonId = playerIds[role];
				const player = playersById.get(playerSeasonId);
				if (!player) throw new Error(`missing fixture player "${playerSeasonId}"`);
				return [
					role,
					{
						orgYearId: "astralis-faceit-london-2018",
						playerSeasonId,
						role,
						fit: roleFit(player, role),
					},
				];
			}),
		) as CompletedDraft["roster"],
	};
}

describe("createExhibitionMatch", () => {
	it("creates a deterministic BO1 against a different intact historical roster", () => {
		const dataset = loadDataset();
		const draft = astralisDraft();
		const ratedPlayers = ratePlayers(dataset.playerSeasons);
		const coach = dataset.coaches.find((candidate) => candidate.id === draft.coachId);
		if (!coach) throw new Error("missing fixture coach");
		const draftedTeam = buildTeamProfile({
			draft,
			playerSeasons: dataset.playerSeasons,
			ratedPlayers,
			coach,
		});

		const first = createExhibitionMatch({ dataset, draft, draftedTeam, ratedPlayers });
		const second = createExhibitionMatch({ dataset, draft, draftedTeam, ratedPlayers });
		const draftedIds = new Set(draftedTeam.members.map((member) => member.id));

		expect(first.result).toEqual(second.result);
		expect(first.result.format).toBe("BO1");
		expect(first.result.seed).toBe(hashStringToSeed(`${draft.seed}:exhibition-series`));
		expect(first.result.teams[1].members).toHaveLength(5);
		expect(first.result.teams[1].members.some((member) => !draftedIds.has(member.id))).toBe(true);
	});
});
