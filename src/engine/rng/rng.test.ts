import { describe, expect, it } from "vitest";
import {
	createRng,
	hashStringToSeed,
	normalizeSeed,
	pickWeighted,
	seedFromUtcDate,
	shuffle,
	utcDateKey,
} from "./index";

describe("seed helpers", () => {
	it("hashes the same string to the same uint32", () => {
		expect(hashStringToSeed("major-winners")).toBe(hashStringToSeed("major-winners"));
		expect(hashStringToSeed("major-winners")).not.toBe(hashStringToSeed("major-winners-2"));
		expect(hashStringToSeed("major-winners")).toBeGreaterThanOrEqual(0);
		expect(hashStringToSeed("major-winners")).toBeLessThan(2 ** 32);
	});

	it("normalizes strings through the same hash as createRng.seed", () => {
		expect(normalizeSeed("hello")).toBe(hashStringToSeed("hello"));
		expect(createRng("hello").seed).toBe(hashStringToSeed("hello"));
		expect(createRng(42).seed).toBe(42);
		expect(createRng(-1).seed).toBe(0xffffffff);
	});

	it("uses the UTC civil date so a day is stable across local hours", () => {
		expect(utcDateKey(new Date("2026-09-15T00:00:00.000Z"))).toBe("2026-09-15");
		expect(utcDateKey(new Date("2026-09-15T23:59:59.999Z"))).toBe("2026-09-15");
		expect(seedFromUtcDate(new Date("2026-09-15T04:00:00.000Z"))).toBe(
			seedFromUtcDate(new Date("2026-09-15T20:00:00.000Z")),
		);
		expect(seedFromUtcDate(new Date("2026-09-16T00:00:00.000Z"))).not.toBe(
			seedFromUtcDate(new Date("2026-09-15T00:00:00.000Z")),
		);
	});
});

describe("createRng", () => {
	it("replays the same stream for the same seed", () => {
		const a = createRng(2026);
		const b = createRng(2026);
		const streamA = [a.next(), a.nextUint32(), a.nextInt(7), a.nextInt(1000)];
		const streamB = [b.next(), b.nextUint32(), b.nextInt(7), b.nextInt(1000)];
		expect(streamA).toEqual(streamB);
	});

	it("restores a serialized register and continues the stream", () => {
		const live = createRng(2026);
		live.next();
		live.nextUint32();
		const resumed = createRng(2026, live.state);
		const fresh = createRng(2026);
		fresh.next();
		fresh.nextUint32();
		expect(resumed.next()).toBe(fresh.next());
		expect(resumed.nextInt(12)).toBe(fresh.nextInt(12));
	});

	it("gives a different stream for a different seed", () => {
		const a = createRng(1);
		const b = createRng(2);
		expect([a.next(), a.next()]).not.toEqual([b.next(), b.next()]);
	});

	it("treats a string seed as its FNV-1a hash", () => {
		const fromString = createRng("daily-2026-09-15");
		const fromHash = createRng(hashStringToSeed("daily-2026-09-15"));
		expect(fromString.next()).toBe(fromHash.next());
		expect(fromString.nextInt(12)).toBe(fromHash.nextInt(12));
	});
});

describe("pickWeighted", () => {
	it("maps integer tickets onto items without using Math.random", () => {
		const items = ["cult", "legendary"] as const;
		const weightOf = (item: (typeof items)[number]) => (item === "cult" ? 1 : 5);
		const picked = Array.from({ length: 6 }, (_, ticket) =>
			pickWeighted(items, weightOf, {
				nextInt: (n) => {
					expect(n).toBe(6);
					return ticket;
				},
			}),
		);
		expect(picked).toEqual([
			"cult",
			"legendary",
			"legendary",
			"legendary",
			"legendary",
			"legendary",
		]);
	});
});

describe("shuffle", () => {
	it("is deterministic for a given seed", () => {
		const items = ["a", "b", "c", "d", "e", "f"];
		expect(shuffle(items, createRng(99))).toEqual(shuffle(items, createRng(99)));
		expect(shuffle(items, createRng(99))).not.toEqual(shuffle(items, createRng(100)));
	});
});
