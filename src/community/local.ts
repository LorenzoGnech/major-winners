export const PUBLISHED_FINGERPRINTS_KEY = "major-winners:published-fingerprints:v1";

export function loadPublishedFingerprints(storage: Storage): Set<string> {
	try {
		const raw = storage.getItem(PUBLISHED_FINGERPRINTS_KEY);
		if (!raw) return new Set();
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
			return new Set();
		}
		return new Set(value);
	} catch {
		return new Set();
	}
}

export function rememberPublishedFingerprint(storage: Storage, fingerprint: string): void {
	const next = loadPublishedFingerprints(storage);
	next.add(fingerprint);
	storage.setItem(PUBLISHED_FINGERPRINTS_KEY, JSON.stringify([...next]));
}
