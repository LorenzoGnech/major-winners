import type { TournamentMatch, TournamentState } from "../engine";

/** Header/history shown while a match is playing back, without the result of that match. */
export function visibleTournamentBoard(
	state: TournamentState,
	playbackMatch: TournamentMatch | undefined,
	playbackComplete: boolean,
): Pick<
	TournamentState,
	"status" | "stage" | "playoffRound" | "challengers" | "legends" | "history"
> {
	if (!playbackMatch || playbackComplete) {
		return {
			status: state.status,
			stage: state.stage,
			playoffRound: state.playoffRound,
			challengers: state.challengers,
			legends: state.legends,
			history: state.history,
		};
	}
	return {
		status: "active",
		stage: playbackMatch.stage,
		playoffRound: playbackMatch.playoffRound ?? null,
		challengers:
			playbackMatch.stage === "challengers" && playbackMatch.record
				? playbackMatch.record
				: state.challengers,
		legends:
			playbackMatch.stage === "legends" && playbackMatch.record
				? playbackMatch.record
				: state.legends,
		history: state.history.filter((match) => match.matchNumber !== playbackMatch.matchNumber),
	};
}
