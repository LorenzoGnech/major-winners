import { parseDisplayName } from "./elo";

export const PUBLISHED_FINGERPRINTS_KEY = "major-winners:published-fingerprints:v1";
export const PENDING_DISPLAY_NAME_KEY = "major-winners:pending-display-name:v1";

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

export function loadPendingDisplayName(storage: Storage): string | null {
	try {
		return parseDisplayName(storage.getItem(PENDING_DISPLAY_NAME_KEY));
	} catch {
		return null;
	}
}

export function rememberPendingDisplayName(storage: Storage, name: string): void {
	const parsed = parseDisplayName(name);
	if (!parsed) return;
	storage.setItem(PENDING_DISPLAY_NAME_KEY, parsed);
}

export function clearPendingDisplayName(storage: Storage): void {
	try {
		storage.removeItem(PENDING_DISPLAY_NAME_KEY);
	} catch {
		// Clearing a pending username is best-effort.
	}
}
