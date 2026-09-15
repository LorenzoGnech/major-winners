import { describe, expect, it } from "vitest";
import { type Coach, loadDataset, ROLES, type Role } from "../../data";
import { type CompletedDraft, roleFit } from "../draft";
import { ratePlayers } from "../ratings/rate";
import { buildTeamProfile, CHEMISTRY_BONUS_CAP, TEAM_PROFILE_BASELINES } from "./profile";

const dataset = loadDataset();
const ratedPlayers = ratePlayers(dataset.playerSeasons);
const seasonsById = new Map(dataset.playerSeasons.map((season) => [season.id, season]));

const ASTRALIS_ROSTER: Record<Role, string> = {
	awp: "device-2018-astralis",
	igl: "gla1ve-2018-astralis",
	entry: "dupreeh-2018-astralis",
	support: "xyp9x-2018-astralis",
	lurker: "magisk-2018-astralis",
};

const MIXED_ALL_STARS: Record<Role, string> = {
	awp: "s1mple-2018-navi",
	igl: "carn-2009-fnatic",
	entry: "rain-2022-faze",
	support: "krimz-2015-fnatic",
	lurker: "get_right-2013-nip",
};

const FAZE_ROSTER: Record<Role, string> = {
	awp: "broky-2022-faze",
	igl: "karrigan-2022-faze",
	entry: "rain-2022-faze",
	support: "twistzz-2022-faze",
	lurker: "ropz-2022-faze",
};

function coachById(id: string): Coach {
	const coach = dataset.coaches.find((row) => row.id === id);
	if (!coach) throw new Error(`missing coach ${id}`);
	return coach;
}

function completedDraft(rosterIds: Record<Role, string>, coachId: string): CompletedDraft {
	const roster = Object.fromEntries(
		ROLES.map((role) => {
			const season = seasonsById.get(rosterIds[role]);
			if (!season) throw new Error(`missing season ${rosterIds[role]}`);
			const roster = dataset.orgYears.find((row) => row.playerSeasonIds.includes(season.id));
			if (!roster) throw new Error(`missing roster for ${season.id}`);
			return [
				role,
				{
					orgYearId: roster.id,
					playerSeasonId: season.id,
					role,
					fit: roleFit(season, role),
				},
			];
		}),
	) as CompletedDraft["roster"];
	return { seed: 42, cards: [], roster, coachId };
}

function profile(roster: Record<Role, string>, coach: Coach) {
	return buildTeamProfile({
		draft: completedDraft(roster, coach.id),
		playerSeasons: dataset.playerSeasons,
		ratedPlayers,
		coach,
	});
}

describe("buildTeamProfile", () => {
	it("recognizes a perfect-role intact Astralis-style five", () => {
		const result = profile(ASTRALIS_ROSTER, coachById("zonic-2018"));

		expect(result.details.structure.naturalRoleCount).toBe(5);
		expect(result.details.structure.iglFit).toBe("primary");
		expect(result.details.chemistry.sharedOrgYearPairs).toBe(10);
		expect(result.strengths).toContain("Natural role coverage");
		expect(Object.values(result.attributes)).toHaveLength(6);
		expect(result.overall).toBeGreaterThan(80);
	});

	it("keeps a mixed all-star lineup powerful without inventing chemistry", () => {
		const result = profile(MIXED_ALL_STARS, coachById("robban-2022"));

		expect(result.components.baseStrength).toBeGreaterThan(80);
		expect(result.components.chemistry).toBe(TEAM_PROFILE_BASELINES.chemistry);
		expect(result.weaknesses).toContain("No shared org-year history");
	});

	it("applies a strong structure penalty for an off-role IGL", () => {
		const offRoleRoster = {
			...ASTRALIS_ROSTER,
			igl: "magisk-2018-astralis",
			lurker: "gla1ve-2018-astralis",
		};
		const natural = profile(ASTRALIS_ROSTER, coachById("zonic-2018"));
		const offRole = profile(offRoleRoster, coachById("zonic-2018"));

		expect(offRole.details.structure.iglFit).toBe("missing");
		expect(natural.components.structure - offRole.components.structure).toBeGreaterThanOrEqual(40);
		expect(natural.overall - offRole.overall).toBeGreaterThan(4);
		expect(offRole.weaknesses).toContain("No proven caller in the IGL slot");
	});

	it("caps pair-based chemistry so an intact five cannot run away", () => {
		const result = profile(ASTRALIS_ROSTER, coachById("zonic-2018"));

		expect(result.details.chemistry.bonus).toBe(CHEMISTRY_BONUS_CAP);
		expect(result.components.chemistry).toBe(
			TEAM_PROFILE_BASELINES.chemistry + CHEMISTRY_BONUS_CAP,
		);
	});

	it("keeps the international FaZe lineup viable", () => {
		const result = profile(FAZE_ROSTER, coachById("robban-2022"));

		expect(new Set(result.members.map((member) => member.nationality)).size).toBe(5);
		expect(result.components.communication).toBeGreaterThanOrEqual(85);
		expect(result.overall).toBeGreaterThan(75);
	});

	it("turns coach modifiers into tactical scores with modest OVR impact", () => {
		const eliteCoach = coachById("zonic-2018");
		const weakCoach: Coach = {
			...eliteCoach,
			id: "weak-coach",
			modifiers: { comeback: -2, economy: -2, antistrat: -2 },
		};
		const elite = profile(ASTRALIS_ROSTER, eliteCoach);
		const weak = profile(ASTRALIS_ROSTER, weakCoach);

		expect(elite.details.coaching.comebackResilience).toBeGreaterThan(
			weak.details.coaching.comebackResilience,
		);
		expect(elite.details.coaching.economyDiscipline).toBeGreaterThan(
			weak.details.coaching.economyDiscipline,
		);
		expect(elite.details.coaching.antiStrat).toBeGreaterThan(weak.details.coaching.antiStrat);
		expect(elite.overall - weak.overall).toBeGreaterThan(0);
		expect(elite.overall - weak.overall).toBeLessThanOrEqual(3);
		expect(elite).toEqual(profile(ASTRALIS_ROSTER, eliteCoach));
	});
});
