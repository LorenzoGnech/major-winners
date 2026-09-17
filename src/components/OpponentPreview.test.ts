import { describe, expect, it } from "vitest";
import type { TeamMemberProfile } from "../engine";
import { opponentEventLabel, opponentRoster } from "./OpponentPreview";

function member(slot: TeamMemberProfile["slot"], nick: string): TeamMemberProfile {
	return {
		id: nick,
		playerId: nick,
		nick,
		nationality: "DK",
		orgId: "test",
		year: 2018,
		slot,
		primaryRole: slot,
		roles: [slot],
		fit: 1,
		ovr: 80,
		effectiveOvr: 80,
		attributes: { aim: 80, entry: 80, clutch: 80, utility: 80, consistency: 80, igl: 80 },
	};
}

describe("opponentEventLabel", () => {
	it("strips the org name when the label already includes it", () => {
		expect(opponentEventLabel("Vox Eminor · ESL Katowice 2014", "Vox Eminor")).toBe(
			"ESL Katowice 2014",
		);
		expect(opponentEventLabel("Legacy · CPL Winter 2001")).toBe("Legacy · CPL Winter 2001");
	});
});

describe("opponentRoster", () => {
	it("orders starters AWP through lurker", () => {
		const roster = opponentRoster([
			member("lurker", "device"),
			member("awp", "s1mple"),
			member("support", "Xyp9x"),
			member("entry", "dupreeh"),
			member("igl", "gla1ve"),
		]);
		expect(roster.map((row) => row.slot)).toEqual(["awp", "igl", "entry", "support", "lurker"]);
	});
});
