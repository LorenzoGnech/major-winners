import { ROLES, type Role } from "../../data/schema";
import { scoreboardRating } from "../sim";
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

	const players = roster(playerTeam.members).map((member) => {
		let kills = 0;
		let deaths = 0;
		let assists = 0;
		let adrWeight = 0;
		let kastWeight = 0;
		let rounds = 0;
		let aces = 0;
		let clutches = 0;
		for (const map of maps) {
			const row = map.scoreboard[0].find((player) => player.playerId === member.id);
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
				if (round.summary.kind === "ace" && round.summary.team === 0) {
					if (round.summary.playerId === member.id) aces += 1;
				}
				if (round.summary.kind === "clutch" && round.summary.team === 0) {
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

	const scored = players.filter((player) => player.rounds > 0);
	const mvp = scored.reduce<RunPlayerStats | null>((best, player) => {
		if (!best) return player;
		if (player.rating !== best.rating) return player.rating > best.rating ? player : best;
		if (player.kills !== best.kills) return player.kills > best.kills ? player : best;
		return player.seasonId < best.seasonId ? player : best;
	}, null);

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
		mvpSeasonId: mvp?.seasonId ?? null,
		hardestWinLabel: hardestWin(state.history),
		players,
	};
}
