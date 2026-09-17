import { describe, expect, it } from "vitest";
import type { PlayerSeason } from "../src/data";
import {
	applyPlayerPhotos,
	extensionForPhotoUrl,
	isPlaceholderHeadshot,
	parseStatsHeadshot,
	publicPhotoPath,
} from "./hltv-photos";

const STATS_2018 = `
<div class="player-summary-stat-box compact">
  <div class="player-summary-stat-box-left">
    <img alt="Oleksandr 's1mple' Kostyliev" class="player-summary-stat-box-left-bodyshot"
      src="https://img-cdn.hltv.org/playerbodyshot/BKRJk1a6JCAUcQRJtF82CR.png?ixlib=java-2.1.0&amp;w=400&amp;s=b51b">
  </div>
</div>
<img class="context-item-image" src="https://img-cdn.hltv.org/playerbodyshot/BKRJk1a6JCAUcQRJtF82CR.png?bg=3e4c54&amp;w=200">
`;

const STATS_2024 = `
<img src="https://img-cdn.hltv.org/playerbodyshot/FJie4BbfsiM5nurHLjBVZz.png?ixlib=java-2.1.0&amp;w=400"
  class="player-summary-stat-box-left-bodyshot" alt="s1mple">
`;

const LEGACY = `
<img class="summaryBodyshot" src="https://img-cdn.hltv.org/playerbodyshot/old.png">
`;

const EMPTY = `
<img class="player-summary-stat-box-left-bodyshot" src="https://static.hltv.org/images/playerprofile/bodyshot/unknown.png">
<img class="flag" src="https://www.hltv.org/img/static/flags/30x20/UA.gif">
`;

const season = (id: string, playerId: string, year: number, photo?: string): PlayerSeason => ({
	id,
	playerId,
	nick: playerId,
	realName: playerId,
	nationality: "UA",
	year,
	orgId: "navi",
	game: "csgo",
	roles: ["awp"],
	primaryRole: "awp",
	roleProvenance: { kind: "curated" },
	dataRegime: "full",
	ratingProvenance: { kind: "verified-stats" },
	accolades: { majorWins: 0, majorMvps: 0, eventMvps: 0 },
	...(photo ? { photo } : {}),
});

describe("parseStatsHeadshot", () => {
	it("reads the year-filtered summary bodyshot and decodes imgix URLs", () => {
		expect(parseStatsHeadshot(STATS_2018)).toBe(
			"https://img-cdn.hltv.org/playerbodyshot/BKRJk1a6JCAUcQRJtF82CR.png?ixlib=java-2.1.0&w=400&s=b51b",
		);
		expect(parseStatsHeadshot(STATS_2024)).toBe(
			"https://img-cdn.hltv.org/playerbodyshot/FJie4BbfsiM5nurHLjBVZz.png?ixlib=java-2.1.0&w=400",
		);
		expect(parseStatsHeadshot(STATS_2018)).not.toBe(parseStatsHeadshot(STATS_2024));
	});

	it("falls back to the older summary selector and skips placeholders", () => {
		expect(parseStatsHeadshot(LEGACY)).toBe("https://img-cdn.hltv.org/playerbodyshot/old.png");
		expect(parseStatsHeadshot(EMPTY)).toBeUndefined();
		expect(
			isPlaceholderHeadshot("https://static.hltv.org/images/playerprofile/bodyshot/unknown.png"),
		).toBe(true);
	});
});

describe("applyPlayerPhotos", () => {
	it("writes the same player-year path onto every org appearance", () => {
		const { seasons, updated } = applyPlayerPhotos(
			[
				season("s1mple-2018-navi", "s1mple", 2018),
				season("electronic-2018-navi", "electronic", 2018),
				season("s1mple-2018-liquid", "s1mple", 2018),
			],
			[{ playerId: "s1mple", year: 2018, photo: "/photos/players/s1mple/2018.png" }],
		);
		expect(updated).toBe(2);
		expect(seasons.map((row) => row.photo)).toEqual([
			"/photos/players/s1mple/2018.png",
			undefined,
			"/photos/players/s1mple/2018.png",
		]);
	});

	it("keeps an existing photo unless overwrite is set", () => {
		const current = "/photos/players/s1mple/2018.jpg";
		const next = "/photos/players/s1mple/2018.png";
		const kept = applyPlayerPhotos(
			[season("s1mple-2018-navi", "s1mple", 2018, current)],
			[{ playerId: "s1mple", year: 2018, photo: next }],
		);
		expect(kept.updated).toBe(0);
		expect(kept.seasons[0]?.photo).toBe(current);
		const overwritten = applyPlayerPhotos(
			[season("s1mple-2018-navi", "s1mple", 2018, current)],
			[{ playerId: "s1mple", year: 2018, photo: next }],
			{ overwrite: true },
		);
		expect(overwritten.updated).toBe(1);
		expect(overwritten.seasons[0]?.photo).toBe(next);
	});
});

describe("photo paths", () => {
	it("stores png/jpg under /photos/players/{id}/{year}", () => {
		expect(publicPhotoPath("s1mple", 2018)).toBe("/photos/players/s1mple/2018.png");
		expect(
			extensionForPhotoUrl(
				"https://img-cdn.hltv.org/playerbodyshot/aaa.png?ixlib=java-2.1.0&w=400",
			),
		).toBe("png");
	});
});
