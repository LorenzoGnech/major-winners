import { afterEach, describe, expect, it, vi } from "vitest";
import { isDesktopViewport } from "./mobileViewport";

describe("isDesktopViewport", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is true at the lg breakpoint", () => {
		vi.stubGlobal("window", {
			matchMedia: (query: string) => ({ matches: query === "(min-width: 1024px)" }),
		});
		expect(isDesktopViewport()).toBe(true);
	});

	it("is false below lg", () => {
		vi.stubGlobal("window", {
			matchMedia: () => ({ matches: false }),
		});
		expect(isDesktopViewport()).toBe(false);
	});
});
