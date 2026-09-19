import { describe, expect, it } from "vitest";
import { donateOptions, donateUrl, formatWalletAddress, httpUrl } from "./donate";

describe("httpUrl", () => {
	it("keeps http and https URLs", () => {
		expect(httpUrl("https://ko-fi.com/majorwinners")).toBe("https://ko-fi.com/majorwinners");
		expect(httpUrl(" http://localhost:4321/ ")).toBe("http://localhost:4321/");
	});

	it("rejects empty, invalid, and non-http schemes", () => {
		expect(httpUrl("")).toBeNull();
		expect(httpUrl("   ")).toBeNull();
		expect(httpUrl("not-a-url")).toBeNull();
		expect(httpUrl("javascript:alert(1)")).toBeNull();
	});
});

describe("donateUrl", () => {
	it("defaults to the Major Winners Ko-fi page", () => {
		expect(donateUrl()).toBe("https://ko-fi.com/majorwinners");
	});
});

describe("donateOptions", () => {
	it("always includes the Ko-fi page", () => {
		expect(donateOptions().kofiUrl).toBe("https://ko-fi.com/majorwinners");
	});

	it("lists the committed Bitcoin, Ethereum, and Solana addresses", () => {
		expect(donateOptions().crypto).toEqual([
			{ id: "btc", label: "Bitcoin", address: "bc1qcsr5zwnnf75k7r4hdx3uazevnmz9h3vgv5ymux" },
			{ id: "eth", label: "Ethereum", address: "0xaBF19795f84aF924884b31Bdc16D7eBe434B9eD9" },
			{ id: "sol", label: "Solana", address: "2qAWr5bqe34yGR6x8g6DXJgcsAuSKbLysradcr3fM6Vb" },
		]);
	});

	it("includes the Steam trade offer for CS skins", () => {
		expect(donateOptions().skinsTradeUrl).toBe(
			"https://steamcommunity.com/tradeoffer/new/?partner=163311756&token=V8V-aJWj",
		);
	});
});

describe("formatWalletAddress", () => {
	it("leaves short addresses intact", () => {
		expect(formatWalletAddress("short")).toBe("short");
		expect(formatWalletAddress("1234567890123456")).toBe("1234567890123456");
	});

	it("truncates long addresses for display", () => {
		expect(formatWalletAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe("bc1qxy…0wlh");
	});
});
