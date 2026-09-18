import { ROLES, type Role } from "../../data/schema";
import { scoreboardRating } from "../sim";
import type { MapResult, SeriesResult } from "../sim/types";
import type { TeamMemberProfile, TeamProfile } from "../team";
import type { TournamentMatch, TournamentState } from "./types";

export type RunPlayerStats = {
	seasonId: string;
	playerId: string;
	nick: string;
	slot: Role;
	nationality: string;
	year: number;
	ovr: number;
	kills: number;
	deaths: number;
	assists: number;
	adr: number;
	kast: number;
	rating: number;
	rounds: number;
	aces: number;
	clutches: number;
};

export type TournamentRunSummary = {
	status: "champion" | "eliminated";
	wins: number;
	losses: number;
	finish: string;
	perfect: boolean;
	mapsWon: number;
	mapsLost: number;
	roundsWon: number;
	roundsLost: number;
	teamOverall: number;
	coachNick: string;
	mvpSeasonId: string | null;
	hardestWinLabel: string | null;
	players: readonly RunPlayerStats[];
};

export function tournamentFinishLabel(
	state: Pick<TournamentState, "status" | "stage" | "history">,
): string {
	if (state.status === "champion") return "Champion";
	if (state.stage === "challengers") return "Challengers Swiss";
	if (state.stage === "legends") return "Legends Swiss";
	const count = state.history.filter((match) => match.stage === "champions").length;
	return (
		(["Quarterfinal", "Semifinal", "Final"] as const)[Math.max(0, count - 1)] ?? "Quarterfinal"
	);
}

function roster(members: readonly TeamMemberProfile[]): TeamMemberProfile[] {
	return ROLES.flatMap((role) => members.filter((member) => member.slot === role));
}

export type DuelSideSummary = {
	name: string;
	overall: number;
	coachNick: string;
	players: readonly RunPlayerStats[];
	mvpSeasonId: string | null;
};

export type DuelSeriesSummary = {
	winner: 0 | 1;
	score: readonly [number, number];
	rounds: readonly [number, number];
	maps: readonly { label: string; score: readonly [number, number]; winner: 0 | 1 }[];
	sides: readonly [DuelSideSummary, DuelSideSummary];
};

function pickMvp(players: readonly RunPlayerStats[]): string | null {
	const scored = players.filter((player) => player.rounds > 0);
	const mvp = scored.reduce<RunPlayerStats | null>((best, player) => {
		if (!best) return player;
		if (player.rating !== best.rating) return player.rating > best.rating ? player : best;
		if (player.kills !== best.kills) return player.kills > best.kills ? player : best;
		return player.seasonId < best.seasonId ? player : best;
	}, null);
	return mvp?.seasonId ?? null;
}

export function summarizeSeriesRoster(
	maps: readonly MapResult[],
	team: TeamProfile,
	side: 0 | 1,
): { players: RunPlayerStats[]; mvpSeasonId: string | null } {
	const players = roster(team.members).map((member) => {
		let kills = 0;
		let deaths = 0;
		let assists = 0;
		let adrWeight = 0;
		let kastWeight = 0;
		let rounds = 0;
		let aces = 0;
		let clutches = 0;
		for (const map of maps) {
			const row = map.scoreboard[side].find((player) => player.playerId === member.id);
			const mapRounds = map.rounds.length;
			if (row) {
				kills += row.kills;
				deaths += row.deaths;
				assists += row.assists;
				adrWeight += row.adr * mapRounds;
				kastWeight += row.kast * mapRounds;
				rounds += mapRounds;
			}
			for (const round of map.rounds) {
				if (round.summary.kind === "ace" && round.summary.team === side) {
					if (round.summary.playerId === member.id) aces += 1;
				}
				if (round.summary.kind === "clutch" && round.summary.team === side) {
					if (round.summary.playerId === member.id) clutches += 1;
				}
			}
		}
		const adr = rounds === 0 ? 0 : Math.round(adrWeight / rounds);
		const kast = rounds === 0 ? 0 : Math.round(kastWeight / rounds);
		return {
			seasonId: member.id,
			playerId: member.playerId,
			nick: member.nick,
			slot: member.slot,
			nationality: member.nationality,
			year: member.year,
			ovr: member.ovr,
			kills,
			deaths,
			assists,
			adr,
			kast,
			rating: scoreboardRating({ kills, deaths, assists, adr, kast, rounds }),
			rounds,
			aces,
			clutches,
		};
	});
	return { players, mvpSeasonId: pickMvp(players) };
}

export function summarizeDuelSeries(
	result: SeriesResult,
	teamNames: readonly [string, string],
): DuelSeriesSummary {
	const rounds: [number, number] = result.maps.reduce(
		(score, map) => [score[0] + map.score[0], score[1] + map.score[1]],
		[0, 0],
	);
	const host = summarizeSeriesRoster(result.maps, result.teams[0], 0);
	const guest = summarizeSeriesRoster(result.maps, result.teams[1], 1);
	return {
		winner: result.winner,
		score: result.score,
		rounds,
		maps: result.maps.map((map) => ({
			label: map.label,
			score: map.score,
			winner: map.winner,
		})),
		sides: [
			{
				name: teamNames[0],
				overall: result.teams[0].overall,
				coachNick: result.teams[0].coach.nick,
				...host,
			},
			{
				name: teamNames[1],
				overall: result.teams[1].overall,
				coachNick: result.teams[1].coach.nick,
				...guest,
			},
		],
	};
}

function hardestWin(history: readonly TournamentMatch[]): string | null {
	let best: TournamentMatch | null = null;
	for (const match of history) {
		if (!match.won) continue;
		if (!best || match.opponent.profile.overall > best.opponent.profile.overall) {
			best = match;
		}
	}
	return best?.opponent.label ?? null;
}

export function summarizeTournamentRun(
	state: TournamentState,
	playerTeam: TeamProfile,
): TournamentRunSummary {
	const wins = state.history.filter((match) => match.won).length;
	const losses = state.history.length - wins;
	const maps = state.history.flatMap((match) => match.result.maps);
	const mapsWon = state.history.reduce((sum, match) => sum + match.result.score[0], 0);
	const mapsLost = state.history.reduce((sum, match) => sum + match.result.score[1], 0);
	const roundsWon = maps.reduce((sum, map) => sum + map.score[0], 0);
	const roundsLost = maps.reduce((sum, map) => sum + map.score[1], 0);
	const rosterSummary = summarizeSeriesRoster(maps, playerTeam, 0);

	return {
		status: state.status === "champion" ? "champion" : "eliminated",
		wins,
		losses,
		finish: tournamentFinishLabel(state),
		perfect: state.status === "champion" && wins === 9 && losses === 0,
		mapsWon,
		mapsLost,
		roundsWon,
		roundsLost,
		teamOverall: playerTeam.overall,
		coachNick: playerTeam.coach.nick,
		mvpSeasonId: rosterSummary.mvpSeasonId,
		hardestWinLabel: hardestWin(state.history),
		players: rosterSummary.players,
	};
}
