export const CUSTOM_SEED_MAX = 64;

export function parseCustomSeed(value: unknown): number | string | null {
	if (typeof value !== "string") return null;
	const seed = value.trim();
	if (seed.length < 1 || seed.length > CUSTOM_SEED_MAX) return null;
	if (/^\d+$/.test(seed)) {
		try {
			const numeric = BigInt(seed);
			if (numeric <= 0xffffffffn) return Number(numeric);
		} catch {
			return seed;
		}
	}
	return seed;
}
