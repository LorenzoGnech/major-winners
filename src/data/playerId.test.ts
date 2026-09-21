import { describe, expect, it } from "vitest";
import {
	HLTV_ID_BY_PLAYER_ID,
	indexPlayerSeasons,
	pickHltvSearchResult,
	playerDisplayNick,
	playerIdFor,
	resolveCoachId,
	resolvePlayerSeasonId,
} from "./playerId";

describe("playerIdFor", () => {
	it("keeps Liquipedia nationality disambiguators instead of folding them", () => {
		expect(playerIdFor("AdreN (American player)", "US")).toBe("adren_american");
		expect(playerIdFor("AdreN (Kazakh player)", "KZ")).toBe("adren");
		expect(playerIdFor("niko (Danish player)", "DK")).toBe("niko_danish");
		expect(playerIdFor("NiKo", "BA")).toBe("niko");
		expect(playerIdFor("ALEX (Spanish player)", "ES")).toBe("alex_spanish");
		expect(playerIdFor("Lucky (Danish player)", "DK")).toBe("lucky_danish");
	});

	it("splits bare shared nicks by TeamCard flag", () => {
		expect(playerIdFor("adreN", "US")).toBe("adren_american");
		expect(playerIdFor("AdreN", "KZ")).toBe("adren");
		expect(playerIdFor("niko", "DK")).toBe("niko_danish");
		expect(playerIdFor("NiKo", "BA")).toBe("niko");
		expect(playerIdFor("ALEX", "ES")).toBe("alex_spanish");
		expect(playerIdFor("Lucky", "DK")).toBe("lucky_danish");
	});

	it("keeps the f0rest career id", () => {
		expect(playerIdFor("f0rest", "SE")).toBe("forest");
		expect(playerIdFor("steel (Joshua Nissan)", "CA")).toBe("steel_joshua_nissan");
	});
});

describe("homonym aliases", () => {
	it("rewrites published season and coach ids onto the split careers", () => {
		expect(resolvePlayerSeasonId("adren-2015-liquid")).toBe("adren_american-2015-liquid");
		expect(resolvePlayerSeasonId("niko-2018-north")).toBe("niko_danish-2018-north");
		expect(resolvePlayerSeasonId("niko-2018-faze")).toBe("niko-2018-faze");
		expect(resolveCoachId("adren-2019-liquid")).toBe("adren_american-2019-liquid");
	});

	it("indexes both current and aliased season ids", () => {
		const seasons = [
			{ id: "adren_american-2015-liquid", nick: "adreN" },
			{ id: "adren-2015-hellraisers", nick: "AdreN" },
		];
		const byId = indexPlayerSeasons(seasons);
		expect(byId.get("adren-2015-liquid")?.nick).toBe("adreN");
		expect(byId.get("adren_american-2015-liquid")?.nick).toBe("adreN");
		expect(byId.get("adren-2015-hellraisers")?.nick).toBe("AdreN");
	});
});

describe("HLTV homonym pins", () => {
	it("prefers the pinned HLTV id when two AdreNs share a search nick", () => {
		const results = [
			{ id: 334, nickName: "AdreN" },
			{ id: 7433, nickName: "adreN" },
		];
		expect(
			pickHltvSearchResult(results, { searchName: "adren", playerId: "adren_american" })?.id,
		).toBe(HLTV_ID_BY_PLAYER_ID.adren_american);
		expect(pickHltvSearchResult(results, { searchName: "adren", playerId: "adren" })?.id).toBe(
			HLTV_ID_BY_PLAYER_ID.adren,
		);
	});
});

describe("playerDisplayNick", () => {
	it("uses the country suffix when one is stored", () => {
		expect(playerDisplayNick({ nick: "niko", displayNick: "niko (DK)" })).toBe("niko (DK)");
		expect(playerDisplayNick({ nick: "NiKo" })).toBe("NiKo");
	});
});
