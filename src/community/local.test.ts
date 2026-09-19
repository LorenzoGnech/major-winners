import { describe, expect, it } from "vitest";
import {
	clearPendingDisplayName,
	loadPendingDisplayName,
	loadPublishedFingerprints,
	rememberPendingDisplayName,
	rememberPublishedFingerprint,
} from "./local";

class MemoryStorage implements Storage {
	private data = new Map<string, string>();
	get length(): number {
		return this.data.size;
	}
	clear(): void {
		this.data.clear();
	}
	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}
	key(index: number): string | null {
		return [...this.data.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.data.delete(key);
	}
	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}
}

describe("published fingerprint memory", () => {
	it("roundtrips fingerprints and ignores corrupt JSON", () => {
		const storage = new MemoryStorage();
		expect(loadPublishedFingerprints(storage).size).toBe(0);
		rememberPublishedFingerprint(storage, "a|b");
		rememberPublishedFingerprint(storage, "a|b");
		expect([...loadPublishedFingerprints(storage)]).toEqual(["a|b"]);
		storage.setItem("major-winners:published-fingerprints:v1", "{nope");
		expect(loadPublishedFingerprints(storage).size).toBe(0);
	});
});

describe("pending display name", () => {
	it("remembers a valid username and ignores junk", () => {
		const storage = new MemoryStorage();
		rememberPendingDisplayName(storage, "ab");
		expect(loadPendingDisplayName(storage)).toBeNull();
		rememberPendingDisplayName(storage, "Lore_2018");
		expect(loadPendingDisplayName(storage)).toBe("Lore_2018");
		clearPendingDisplayName(storage);
		expect(loadPendingDisplayName(storage)).toBeNull();
	});
});
