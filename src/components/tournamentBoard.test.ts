import { describe, expect, it } from "vitest";
import { loadDataset } from "../data";
import {
	buildHistoricalOpponents,
	createTournament,
	ratePlayers,
	runNextMatch,
	type SeriesResolver,
} from "../engine";
import { visibleTournamentBoard } from "./tournamentBoard";

const dataset = loadDataset();
const opponents = buildHistoricalOpponents(dataset, ratePlayers(dataset.playerSeasons));
const playerTeam = opponents[0]?.profile;
if (!playerTeam) throw new Error("test dataset needs an opponent");

function forced(won: boolean): SeriesResolver {
	return ({ teams, seed, format }) => ({
		seed,
		format,
		teams,
		winner: won ? 0 : 1,
		score: won ? [format === "BO1" ? 1 : 2, 0] : [0, format === "BO1" ? 1 : 2],
		maps: [],
	});
}

function play(state: ReturnType<typeof createTournament>, won: boolean) {
	const result = runNextMatch(state, playerTeam, opponents, forced(won));
	if (!result.ok) throw result.error;
	return result.value;
}

describe("visibleTournamentBoard", () => {
	it("hides the current Swiss result until playback completes", () => {
		let state = createTournament({ rootSeed: 42, playerTeam, opponents });
		state = play(state, true);
		state = play(state, true);
		state = play(state, true);
		const current = state.history.at(-1);
		expect(state.stage).toBe("legends");
		expect(state.challengers).toEqual({ wins: 3, losses: 0 });

		const during = visibleTournamentBoard(state, current, false);
		expect(during.status).toBe("active");
		expect(during.stage).toBe("challengers");
		expect(during.challengers).toEqual({ wins: 2, losses: 0 });
		expect(during.history).toHaveLength(2);

		const after = visibleTournamentBoard(state, current, true);
		expect(after.stage).toBe("legends");
		expect(after.challengers).toEqual({ wins: 3, losses: 0 });
		expect(after.history).toHaveLength(3);
	});

	it("does not reveal a playoff outcome or elimination while the series is playing", () => {
		let state = createTournament({ rootSeed: 7, playerTeam, opponents });
		for (let i = 0; i < 6; i++) {
			state = play(state, true);
		}
		expect(state.stage).toBe("champions");
		expect(state.playoffRound).toBe("quarterfinal");
		state = play(state, false);
		const current = state.history.at(-1);
		expect(state.status).toBe("eliminated");

		const during = visibleTournamentBoard(state, current, false);
		expect(during.status).toBe("active");
		expect(during.stage).toBe("champions");
		expect(during.playoffRound).toBe("quarterfinal");
		expect(during.history.some((match) => match.playoffRound === "quarterfinal")).toBe(false);

		const after = visibleTournamentBoard(state, current, true);
		expect(after.status).toBe("eliminated");
	});
});
