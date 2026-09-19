import { describe, expect, it } from "vitest";
import type { Attributes } from "../ratings/attributes";
import type { TeamMemberProfile, TeamProfile } from "../team";
import { featuredClutchWindow } from "./clutch";
import {
	chooseBuy,
	equipmentValue,
	INITIAL_ECONOMY,
	playbackBanks,
	resolveEconomyRound,
} from "./economy";
import {
	MAX_FEATURED_CLUTCHES,
	playRound,
	queueTimeout,
	simulateSeries,
	skipCurrentMap,
	skipRemaining,
	startLiveSeries,
} from "./live";
import { MAP_POOL } from "./maps";
import { TIMEOUT_MORALE } from "./morale";
import { formatRoundSummary } from "./roundSummary";
import { equipmentWinDelta, roundWinProbability, scoreboardRating } from "./simulate";
import { maybeQueueAutoTimeout } from "./timeout";
import { isWeaponLegalForBuy } from "./weapons";

const attributes: Attributes = {
	aim: 80,
	entry: 80,
	clutch: 80,
	utility: 80,
	consistency: 80,
	igl: 80,
};

function profile(prefix: string, overall = 80): TeamProfile {
	const slots = ["awp", "igl", "entry", "support", "lurker"] as const;
	const members: TeamMemberProfile[] = slots.map((slot, index) => ({
		id: `${prefix}-player-${index}`,
		playerId: `${prefix}-player-${index}`,
		nick: `${prefix}${index}`,
		nationality: "DK",
		orgId: prefix,
		year: 2020,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: overall,
		effectiveOvr: overall,
		attributes,
	}));
	return {
		seed: 1,
		overall,
		components: {
			baseStrength: overall,
			chemistry: 70,
			communication: 90,
			structure: 90,
			coaching: 60,
		},
		details: {
			chemistry: {
				score: 70,
				sharedOrgYearPairs: 5,
				sharedTeamPairs: 5,
				sharedNationalityPairs: 10,
				bonus: 20,
			},
			communication: {
				score: 90,
				playerPairCompatibility: 90,
				coachCompatibility: 90,
				languageScore: 90,
				iglAbility: 80,
				heuristic: "language-family-and-igl",
			},
			structure: {
				score: 90,
				naturalRoleCount: 5,
				secondaryRoleCount: 0,
				offRoleCount: 0,
				iglFit: "primary",
				primaryAwpCount: 1,
			},
			coaching: {
				score: 60,
				overallImpact: 0.5,
				comebackResilience: 80,
				economyDiscipline: 80,
				antiStrat: 80,
			},
		},
		attributes,
		members,
		coach: { id: `${prefix}-coach`, nick: `${prefix} coach` },
		strengths: [],
		weaknesses: [],
	};
}

const equalTeams = [profile("alpha"), profile("bravo")] as const;

describe("simulateSeries", () => {
	it("is deeply deterministic for the same inputs", () => {
		const input = { teams: equalTeams, seed: "stable", format: "BO3" as const };
		expect(simulateSeries(input)).toEqual(simulateSeries(input));
	});

	it("ends regulation at 13 wins or reaches a 12-12 overtime", () => {
		for (let seed = 0; seed < 100; seed += 1) {
			const map = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
			expect(map).toBeDefined();
			if ((map?.overtimeBlocks ?? 0) === 0) {
				expect(Math.max(...(map?.score ?? [0, 0]))).toBe(13);
				expect(map?.rounds.length).toBeLessThanOrEqual(24);
			} else {
				expect(map?.regulationScore).toEqual([12, 12]);
			}
		}
	});

	it("can enter overtime and always terminates", () => {
		let overtimeMap = simulateSeries({ teams: equalTeams, seed: 0, format: "BO1" }).maps[0];
		for (let seed = 1; seed < 2_000 && overtimeMap?.overtimeBlocks === 0; seed += 1) {
			overtimeMap = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
		}
		expect(overtimeMap?.regulationScore).toEqual([12, 12]);
		expect(overtimeMap?.overtimeBlocks).toBeGreaterThan(0);
		expect(overtimeMap?.overtimeBlocks).toBeLessThanOrEqual(12);
		expect(overtimeMap?.score[0]).not.toBe(overtimeMap?.score[1]);
		expect(overtimeMap?.rounds.length).toBeLessThanOrEqual(97);
	});

	it("stops a BO3 as soon as one team wins two maps", () => {
		const result = simulateSeries({ teams: equalTeams, seed: 77, format: "BO3" });
		expect(result.score[result.winner]).toBe(2);
		expect(result.maps.length).toBeGreaterThanOrEqual(2);
		expect(result.maps.length).toBeLessThanOrEqual(3);
		if (result.maps.length === 3) expect(result.score).toContain(1);
	});

	it("is symmetric for equal teams across many seeds", () => {
		let winsA = 0;
		const samples = 600;
		for (let seed = 0; seed < samples; seed += 1) {
			winsA += simulateSeries({ teams: equalTeams, seed, format: "BO1" }).winner === 0 ? 1 : 0;
		}
		expect(winsA / samples).toBeGreaterThan(0.45);
		expect(winsA / samples).toBeLessThan(0.58);
	});

	it("gives a ten-OVR stronger team a clear but non-certain advantage", () => {
		const teams = [profile("strong", 90), profile("weak", 80)] as const;
		let wins = 0;
		const samples = 500;
		for (let seed = 0; seed < samples; seed += 1) {
			wins += simulateSeries({ teams, seed, format: "BO1" }).winner === 0 ? 1 : 0;
		}
		expect(wins / samples).toBeGreaterThan(0.78);
		expect(wins / samples).toBeLessThan(0.93);
	});

	it("keeps scoreboard kills and deaths consistent with actual events", () => {
		const map = simulateSeries({ teams: equalTeams, seed: 123, format: "BO1" }).maps[0];
		expect(map).toBeDefined();
		const kills = map?.scoreboard.map((team) =>
			team.reduce((total, player) => total + player.kills, 0),
		);
		const deaths = map?.scoreboard.map((team) =>
			team.reduce((total, player) => total + player.deaths, 0),
		);
		expect(kills?.[0]).toBe(deaths?.[1]);
		expect(kills?.[1]).toBe(deaths?.[0]);
		for (const team of map?.scoreboard ?? []) {
			expect(team).toHaveLength(5);
			for (const player of team) {
				expect(player.kast).toBeGreaterThanOrEqual(0);
				expect(player.kast).toBeLessThanOrEqual(100);
				expect(player.adr).toBeGreaterThanOrEqual(0);
				expect(player.rating).toBeGreaterThanOrEqual(0.4);
				expect(player.rating).toBeLessThanOrEqual(2);
			}
		}
	});

	it("centers map ratings around 1.00 instead of stacking everyone above it", () => {
		const ratings: number[] = [];
		for (let seed = 0; seed < 80; seed += 1) {
			const map = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
			for (const team of map?.scoreboard ?? []) {
				for (const player of team) ratings.push(player.rating);
			}
		}
		const mean = ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
		const aboveOne = ratings.filter((rating) => rating > 1).length / ratings.length;
		expect(mean).toBeGreaterThan(0.9);
		expect(mean).toBeLessThan(1.1);
		expect(aboveOne).toBeGreaterThan(0.2);
		expect(aboveOne).toBeLessThan(0.8);
		expect(ratings.some((rating) => rating < 1)).toBe(true);
		expect(ratings.some((rating) => rating > 1)).toBe(true);
	});

	it("only emits highlights for valid rounds, players, and coaches", () => {
		const map = simulateSeries({ teams: equalTeams, seed: 456, format: "BO3" }).maps[0];
		const playerIds = new Set(
			equalTeams.flatMap((team) => team.members.map((member) => member.id)),
		);
		for (const highlight of map?.highlights ?? []) {
			expect(highlight.round).toBeGreaterThanOrEqual(1);
			expect(highlight.round).toBeLessThanOrEqual(map?.rounds.length ?? 0);
			if ("playerId" in highlight) expect(playerIds.has(highlight.playerId)).toBe(true);
			if (highlight.type === "opening-duel") expect(playerIds.has(highlight.victimId)).toBe(true);
			if (highlight.type === "player-timeout") expect(highlight.team).toBe(0);
		}
	});

	it("uses the player map pick as map 1 with a home bonus flag", () => {
		const map = simulateSeries({
			teams: equalTeams,
			seed: 9,
			format: "BO1",
			playerMapId: "nuke",
		}).maps[0];
		expect(map?.mapContext).toMatchObject({
			mapId: "nuke",
			label: "Nuke",
			homePick: true,
			style: "tactical",
		});
		expect(map?.label).toBe("Nuke");
	});

	it("shuffles the pool with no home bonus when no map is picked", () => {
		const result = simulateSeries({
			teams: equalTeams,
			seed: 11,
			format: "BO3",
		});
		const ids = result.maps.map((map) => map.mapContext?.mapId);
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
		expect(result.maps.every((map) => map.mapContext?.homePick === false)).toBe(true);
	});

	it("plays a BO5 first to three without repeating maps", () => {
		const result = simulateSeries({
			teams: equalTeams,
			seed: 22,
			format: "BO5",
		});
		expect(Math.max(...result.score)).toBe(3);
		expect(result.maps.length).toBeGreaterThanOrEqual(3);
		expect(result.maps.length).toBeLessThanOrEqual(5);
		expect(new Set(result.maps.map((map) => map.mapContext?.mapId)).size).toBe(result.maps.length);
	});

	it("fills remaining BO3 maps from the pool without repeating the pick", () => {
		const result = simulateSeries({
			teams: equalTeams,
			seed: 11,
			format: "BO3",
			playerMapId: "mirage",
		});
		expect(result.maps[0]?.mapContext?.mapId).toBe("mirage");
		expect(result.maps[0]?.mapContext?.homePick).toBe(true);
		const ids = result.maps.map((map) => map.mapContext?.mapId);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.slice(1).every((id) => id !== "mirage")).toBe(true);
		expect(result.maps.slice(1).every((map) => map.mapContext?.homePick === false)).toBe(true);
	});

	it("attaches a formatted summary to every round", () => {
		const result = simulateSeries({
			teams: equalTeams,
			seed: 3,
			format: "BO1",
			playerMapId: "mirage",
		});
		const nicks = new Map(
			equalTeams.flatMap((team) => team.members.map((member) => [member.id, member.nick])),
		);
		for (const round of result.maps[0]?.rounds ?? []) {
			expect(round.summary.team).toBe(round.winner);
			const line = formatRoundSummary(
				round.summary,
				["Alpha", "Bravo"],
				(id) => nicks.get(id) ?? id,
			);
			expect(line.length).toBeGreaterThan(10);
			expect(line).toMatch(/Alpha|Bravo/);
		}
	});

	it("never lets a dead player kill, assist, or die twice", () => {
		for (let seed = 0; seed < 40; seed += 1) {
			const map = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
			for (const round of map?.rounds ?? []) {
				const dead = new Set<string>();
				const winnerDeaths = round.kills.filter((kill) => kill.victimTeam === round.winner).length;
				const loserDeaths = round.kills.filter((kill) => kill.victimTeam !== round.winner).length;
				expect(loserDeaths).toBe(5);
				expect(winnerDeaths).toBeGreaterThanOrEqual(0);
				expect(winnerDeaths).toBeLessThanOrEqual(4);
				for (const kill of round.kills) {
					expect(dead.has(kill.killerId)).toBe(false);
					if (kill.assisterId) expect(dead.has(kill.assisterId)).toBe(false);
					expect(dead.has(kill.victimId)).toBe(false);
					dead.add(kill.victimId);
					expect(
						isWeaponLegalForBuy(kill.weapon, round.economy[kill.killerTeam]?.buy ?? "full-buy"),
					).toBe(true);
				}
			}
		}
	});

	it("records clutch-sequence against-count from remaining enemies", () => {
		let found = false;
		for (let seed = 0; seed < 400 && !found; seed += 1) {
			const map = simulateSeries({ teams: equalTeams, seed, format: "BO1" }).maps[0];
			for (const highlight of map?.highlights ?? []) {
				if (highlight.type !== "clutch-sequence") continue;
				const round = map?.rounds.find((item) => item.round === highlight.round);
				expect(round).toBeDefined();
				const alive = new Set(equalTeams[highlight.team].members.map((member) => member.id));
				const enemies = new Set(
					equalTeams[highlight.team === 0 ? 1 : 0].members.map((member) => member.id),
				);
				for (const kill of round?.kills.slice(0, highlight.startKillIndex) ?? []) {
					alive.delete(kill.victimId);
					enemies.delete(kill.victimId);
				}
				expect(alive.size).toBe(1);
				expect(alive.has(highlight.playerId)).toBe(true);
				expect(enemies.size).toBe(highlight.against);
				found = true;
			}
		}
		expect(found).toBe(true);
	});

	it("features at most three player clutches per map, one per window, and splits wins near even", () => {
		let featured = 0;
		let won = 0;
		for (let seed = 0; seed < 80; seed += 1) {
			const map = simulateSeries({
				teams: equalTeams,
				seed,
				format: "BO1",
				playerMapId: "mirage",
			}).maps[0];
			const sequences =
				map?.highlights.filter((highlight) => highlight.type === "clutch-sequence") ?? [];
			expect(sequences.length).toBeLessThanOrEqual(MAX_FEATURED_CLUTCHES);
			expect(sequences.every((highlight) => highlight.team === 0)).toBe(true);
			const windows = new Set(
				sequences.map((highlight) =>
					highlight.type === "clutch-sequence" ? featuredClutchWindow(highlight.round) : -1,
				),
			);
			expect(windows.size).toBe(sequences.length);
			featured += sequences.length;
			won += sequences.filter(
				(highlight) => highlight.type === "clutch-sequence" && highlight.won,
			).length;
		}
		expect(featured).toBeGreaterThan(40);
		expect(won / featured).toBeGreaterThan(0.45);
		expect(won / featured).toBeLessThan(0.9);
	});

	it("spreads early-window clutches instead of stacking them on round 1", () => {
		let early = 0;
		let opening = 0;
		for (let seed = 0; seed < 160; seed += 1) {
			const map = simulateSeries({
				teams: equalTeams,
				seed,
				format: "BO1",
				playerMapId: "mirage",
			}).maps[0];
			for (const highlight of map?.highlights ?? []) {
				if (highlight.type !== "clutch-sequence") continue;
				if (featuredClutchWindow(highlight.round) !== 0) continue;
				early += 1;
				if (highlight.round === 1) opening += 1;
			}
		}
		expect(early).toBeGreaterThan(60);
		expect(opening / early).toBeLessThan(0.28);
	});
});

describe("roundWinProbability", () => {
	const sides = ["CT", "T"] as const;
	const buys = ["full-buy", "full-buy"] as const;
	const score = [0, 0] as const;

	it("gives the home map pick a modest edge", () => {
		const base = roundWinProbability(equalTeams, sides, buys, score, false);
		const home = roundWinProbability(equalTeams, sides, buys, score, false, { homePick: true });
		expect(home).toBeGreaterThan(base);
		expect(home - base).toBeCloseTo(0.03, 3);
	});

	it("applies the same pick edge to either side", () => {
		const base = roundWinProbability(equalTeams, sides, buys, score, false);
		const host = roundWinProbability(equalTeams, sides, buys, score, false, { pickedBy: 0 });
		const guest = roundWinProbability(equalTeams, sides, buys, score, false, { pickedBy: 1 });
		expect(host - base).toBeCloseTo(0.03, 3);
		expect(base - guest).toBeCloseTo(0.03, 3);
	});

	it("favors aimers on aim maps and IGLs on tactical maps", () => {
		const aimTeam = profile("aim", 80);
		aimTeam.attributes = { ...attributes, aim: 95, entry: 92, igl: 55 };
		aimTeam.members = aimTeam.members.map((member) => ({
			...member,
			attributes: aimTeam.attributes,
		}));
		const tacticalTeam = profile("tac", 80);
		tacticalTeam.attributes = { ...attributes, aim: 55, entry: 55, igl: 95, utility: 90 };
		tacticalTeam.members = tacticalTeam.members.map((member) => ({
			...member,
			attributes: tacticalTeam.attributes,
		}));
		tacticalTeam.details = {
			...tacticalTeam.details,
			coaching: { ...tacticalTeam.details.coaching, antiStrat: 95 },
		};
		const teams = [aimTeam, tacticalTeam] as const;
		const aimMap = roundWinProbability(teams, sides, buys, score, false, { mapStyle: "aim" });
		const tacMap = roundWinProbability(teams, sides, buys, score, false, { mapStyle: "tactical" });
		expect(aimMap).toBeGreaterThan(tacMap);
	});

	it("applies a one-round timeout spike", () => {
		const base = roundWinProbability(equalTeams, sides, buys, score, false);
		const timed = roundWinProbability(equalTeams, sides, buys, score, false, { timeoutTeam: 0 });
		expect(timed - base).toBeCloseTo(0.04, 3);
	});

	it("makes an eco a clear underdog against a full buy", () => {
		const even = roundWinProbability(equalTeams, sides, buys, score, false);
		const rifles = roundWinProbability(equalTeams, sides, ["full-buy", "eco"], score, false);
		const eco = roundWinProbability(equalTeams, sides, ["eco", "full-buy"], score, false);
		expect(rifles - even).toBeGreaterThan(0.28);
		expect(rifles).toBeGreaterThan(0.8);
		expect(eco).toBeLessThan(0.22);
	});

	it("lets overall quality outweigh a modest mismatch more than before", () => {
		const mismatch = [profile("favorite", 90), profile("underdog", 80)] as const;
		const even = roundWinProbability(equalTeams, sides, buys, score, false);
		const favored = roundWinProbability(mismatch, sides, buys, score, false);
		expect(favored - even).toBeCloseTo(0.09, 2);
	});

	it("shrinks an underdog's gun advantage as the OVR gap grows", () => {
		const evenGuns = equipmentWinDelta(["eco", "full-buy"], 0);
		const mild = equipmentWinDelta(["eco", "full-buy"], 8);
		const wide = equipmentWinDelta(["eco", "full-buy"], 16);
		expect(evenGuns).toBeLessThan(0);
		expect(Math.abs(mild)).toBeLessThan(Math.abs(evenGuns));
		expect(Math.abs(wide)).toBeLessThan(Math.abs(mild));
		const favoriteEco = roundWinProbability(
			[profile("favorite", 90), profile("underdog", 80)],
			sides,
			["eco", "full-buy"],
			score,
			false,
		);
		const evenEco = roundWinProbability(equalTeams, sides, ["eco", "full-buy"], score, false);
		expect(favoriteEco).toBeGreaterThan(evenEco);
	});
});

describe("live series", () => {
	it("lets a timeout change only the next round", () => {
		const started = startLiveSeries({
			teams: equalTeams,
			seed: 21,
			format: "BO1",
			playerMapId: "mirage",
		});
		const queued = queueTimeout(started);
		expect(queued.ok).toBe(true);
		if (!queued.ok) return;
		expect(queued.value.current?.morale[0]).toBe(
			(started.current?.morale[0] ?? 0) + TIMEOUT_MORALE,
		);
		expect(queued.value.current?.morale[1]).toBe(started.current?.morale[1]);
		const withTimeout = playRound(queued.value);
		const withoutTimeout = playRound(started);
		expect(withTimeout.ok && withoutTimeout.ok).toBe(true);
		if (!withTimeout.ok || !withoutTimeout.ok) return;
		const timedRound = withTimeout.value.current?.rounds[0];
		const plainRound = withoutTimeout.value.current?.rounds[0];
		expect(timedRound?.timeout).toBe(true);
		expect(plainRound?.timeout).toBe(false);
		expect(timedRound?.winProbabilityTeamA).toBeGreaterThan(plainRound?.winProbabilityTeamA ?? 0);
		const continued = playRound(withTimeout.value);
		const continuedPlain = playRound(withoutTimeout.value);
		expect(continued.ok && continuedPlain.ok).toBe(true);
		if (!continued.ok || !continuedPlain.ok) return;
		expect(continued.value.current?.rounds[1]?.timeout).toBe(false);
	});

	it("allows only one timeout per map", () => {
		const started = startLiveSeries({
			teams: equalTeams,
			seed: 21,
			format: "BO1",
			playerMapId: "mirage",
		});
		expect(started.current?.timeoutsRemaining).toBe(1);
		const queued = queueTimeout(started);
		expect(queued.ok).toBe(true);
		if (!queued.ok) return;
		expect(queued.value.current?.timeoutsRemaining).toBe(0);
		const played = playRound(queued.value);
		expect(played.ok).toBe(true);
		if (!played.ok) return;
		const second = queueTimeout(played.value);
		expect(second.ok).toBe(false);
		if (second.ok) return;
		expect(second.error.code).toBe("NO_TIMEOUTS");
	});

	it("applies at most one automatic timeout per map", () => {
		const map = simulateSeries({ teams: equalTeams, seed: 21, format: "BO1" }).maps[0];
		const timed = map?.rounds.filter((round) => round.timeout) ?? [];
		expect(timed.length).toBeLessThanOrEqual(1);
		if (timed[0]) {
			expect(map?.highlights.some((highlight) => highlight.type === "player-timeout")).toBe(true);
		}
	});

	it("lets a strong coach auto-queue a timeout on a trailing rifle streak", () => {
		const started = startLiveSeries({
			teams: equalTeams,
			seed: 21,
			format: "BO1",
			playerMapId: "mirage",
		});
		const current = started.current;
		expect(current).toBeTruthy();
		if (!current) return;
		const stubRound = {
			round: 1,
			phase: "regulation" as const,
			sides: ["T", "CT"] as const,
			winner: 1 as const,
			winProbabilityTeamA: 0.5,
			scoreAfter: [0, 1] as [number, number],
			economy: [
				{
					buy: "full-buy" as const,
					bankBefore: 6_000,
					bankAfter: 4_000,
					lossBonusBefore: 1_400,
					lossBonusAfter: 1_400,
				},
				{
					buy: "full-buy" as const,
					bankBefore: 6_000,
					bankAfter: 4_000,
					lossBonusBefore: 1_400,
					lossBonusAfter: 1_400,
				},
			] as const,
			kills: [],
			moraleAfter: [36, 62] as [number, number],
			timeout: false,
			summary: { kind: "default" as const, team: 1 as const },
		};
		const trailing = maybeQueueAutoTimeout(
			{
				...current,
				score: [4, 7],
				morale: [34, 62],
				economies: [
					{ bank: 6_000, lossBonus: 2_400, losses: 3 },
					{ bank: 6_000, lossBonus: 1_400, losses: 0 },
				],
				rounds: Array.from({ length: 11 }, (_, index) => ({
					...stubRound,
					round: index + 1,
					winner: (index < 4 ? 0 : 1) as 0 | 1,
				})),
			},
			equalTeams,
		);
		expect(trailing.pendingTimeout).toBe(true);
		expect(trailing.timeoutsRemaining).toBe(0);
	});

	it("skipCurrentMap finishes only the open map", () => {
		const live = startLiveSeries({
			teams: equalTeams,
			seed: 88,
			format: "BO3",
		});
		const skipped = skipCurrentMap(live);
		expect(skipped.complete).toBe(false);
		expect(skipped.maps).toHaveLength(1);
		expect(skipped.current).toBeNull();
		expect(skipped.seriesScore[0] + skipped.seriesScore[1]).toBe(1);
		const first = skipRemaining(startLiveSeries({ teams: equalTeams, seed: 88, format: "BO3" }));
		expect(skipped.maps[0]).toEqual(first.maps[0]);
		expect(first.maps.length).toBeGreaterThan(1);
	});

	it("batch skip matches simulateSeries and restores from rng state", () => {
		const input = {
			teams: equalTeams,
			seed: 88,
			format: "BO1" as const,
			playerMapId: "dust2",
		};
		const batched = simulateSeries(input);
		let live = startLiveSeries(input);
		live = skipRemaining(live);
		expect(live.complete).toBe(true);
		expect(live.maps).toEqual(batched.maps);
		live = startLiveSeries(input);
		const first = playRound(live);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const restored = playRound({ ...first.value });
		const fresh = playRound(first.value);
		expect(restored).toEqual(fresh);
	});

	it("exposes the nine-map pool with committed art paths", () => {
		expect(MAP_POOL.map((map) => map.id)).toEqual([
			"mirage",
			"dust2",
			"inferno",
			"nuke",
			"ancient",
			"anubis",
			"overpass",
			"cache",
			"cobble",
		]);
		expect(MAP_POOL.map((map) => map.background)).toEqual([
			"/maps/mirage.webp",
			"/maps/dust2.webp",
			"/maps/inferno.webp",
			"/maps/nuke.webp",
			"/maps/ancient.webp",
			"/maps/anubis.webp",
			"/maps/overpass.webp",
			"/maps/cache.webp",
			"/maps/cobble.webp",
		]);
	});
});

describe("scoreboardRating", () => {
	const average = {
		kills: 14,
		deaths: 14,
		assists: 5,
		adr: 75,
		kast: 70,
		rounds: 21,
	};

	it("puts a typical map at 1.00", () => {
		expect(scoreboardRating(average)).toBe(1);
	});

	it("keeps a strong map above 1 without saturating", () => {
		expect(
			scoreboardRating({ kills: 24, deaths: 10, assists: 4, adr: 98, kast: 82, rounds: 21 }),
		).toBeGreaterThan(1.25);
		expect(
			scoreboardRating({ kills: 24, deaths: 10, assists: 4, adr: 98, kast: 82, rounds: 21 }),
		).toBeLessThan(1.7);
	});

	it("drops a poor map below 1", () => {
		expect(
			scoreboardRating({ kills: 8, deaths: 18, assists: 3, adr: 52, kast: 55, rounds: 21 }),
		).toBeLessThan(0.85);
	});
});

describe("economy", () => {
	it("progresses loss bonus and resets it after a win", () => {
		const firstLoss = resolveEconomyRound(INITIAL_ECONOMY, "pistol", false);
		expect(firstLoss.state.lossBonus).toBe(1_900);
		expect(firstLoss.state.bank).toBe(2_500);
		expect(chooseBuy(firstLoss.state, { pistol: false, economyDiscipline: 80 })).toBe("force");
		const secondLoss = resolveEconomyRound(firstLoss.state, "eco", false);
		expect(secondLoss.state.lossBonus).toBe(2_400);
		const win = resolveEconomyRound(secondLoss.state, "force", true);
		expect(win.state.lossBonus).toBe(1_400);
		expect(win.state.losses).toBe(0);
	});

	it("affords another full buy after two consecutive wins", () => {
		const buy = { pistol: false, economyDiscipline: 50 };
		let state = resolveEconomyRound(INITIAL_ECONOMY, "pistol", true).state;
		expect(chooseBuy(state, buy)).toBe("full-buy");
		state = resolveEconomyRound(state, "full-buy", true).state;
		expect(chooseBuy(state, buy)).toBe("full-buy");
	});

	it("after four consecutive wins, allows two full buys before an eco or force", () => {
		const buy = { pistol: false, economyDiscipline: 50 };
		let state = resolveEconomyRound(INITIAL_ECONOMY, "pistol", true).state;
		for (let i = 0; i < 3; i++) {
			expect(chooseBuy(state, buy)).toBe("full-buy");
			state = resolveEconomyRound(state, "full-buy", true).state;
		}
		expect(chooseBuy(state, buy)).toBe("full-buy");
		state = resolveEconomyRound(state, "full-buy", false).state;
		expect(chooseBuy(state, buy)).toBe("full-buy");
		state = resolveEconomyRound(state, "full-buy", false).state;
		expect(chooseBuy(state, buy)).toBe("full-buy");
		state = resolveEconomyRound(state, "full-buy", false).state;
		expect(["eco", "force"]).toContain(chooseBuy(state, buy));
	});

	it("shows five-player equipment, with pistols even and a full buy above an eco", () => {
		expect(equipmentValue("pistol")).toBe(4_000);
		expect(equipmentValue("full-buy")).toBeGreaterThan(equipmentValue("eco"));
	});

	it("keeps pistol banks even during the round and applies leftover cash after the buy", () => {
		const pistol = [
			{
				buy: "pistol" as const,
				bankBefore: 800,
				bankAfter: 4_050,
				lossBonusBefore: 1_400,
				lossBonusAfter: 1_400,
			},
			{
				buy: "pistol" as const,
				bankBefore: 800,
				bankAfter: 2_200,
				lossBonusBefore: 1_400,
				lossBonusAfter: 1_900,
			},
		] as const;
		expect(playbackBanks(pistol, false)).toEqual([4_000, 4_000]);
		expect(playbackBanks(pistol, true)).toEqual([20_250, 11_000]);

		const gun = [
			{
				buy: "full-buy" as const,
				bankBefore: 4_050,
				bankAfter: 2_800,
				lossBonusBefore: 1_400,
				lossBonusAfter: 1_400,
			},
			{
				buy: "eco" as const,
				bankBefore: 2_200,
				bankAfter: 3_100,
				lossBonusBefore: 1_900,
				lossBonusAfter: 2_400,
			},
		] as const;
		const during = playbackBanks(gun, false);
		expect(during[1]).toBeGreaterThan(during[0]);
	});
});
