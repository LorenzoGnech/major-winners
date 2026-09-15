/** FNV-1a 32-bit. Stable across runtimes; used to turn share codes and dates into seeds. */
export function hashStringToSeed(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function normalizeSeed(seed: number | string): number {
	if (typeof seed === "string") {
		return hashStringToSeed(seed);
	}
	return seed >>> 0;
}

/** UTC calendar day as `YYYY-MM-DD`. Same civil date → same key regardless of local timezone. */
export function utcDateKey(date: Date = new Date()): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function seedFromUtcDate(date: Date = new Date()): number {
	return hashStringToSeed(utcDateKey(date));
}

export type IntRng = {
	nextInt(maxExclusive: number): number;
};

export type Rng = IntRng & {
	readonly seed: number;
	/** Uniform float in `[0, 1)`. */
	next(): number;
	nextUint32(): number;
};

/**
 * Mulberry32. Same seed → same stream. Does not use `Math.random`.
 */
export function createRng(seed: number | string): Rng {
	const normalized = normalizeSeed(seed);
	let state = normalized | 0;

	const nextUint32 = (): number => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return (t ^ (t >>> 14)) >>> 0;
	};

	return {
		seed: normalized,
		nextUint32,
		next: () => nextUint32() / 4294967296,
		nextInt(maxExclusive: number): number {
			if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
				throw new RangeError(`nextInt expected a positive integer, got ${maxExclusive}`);
			}
			return Math.floor((nextUint32() / 4294967296) * maxExclusive);
		},
	};
}

export function pickWeighted<T>(
	items: readonly T[],
	weightOf: (item: T) => number,
	rng: IntRng,
): T {
	if (items.length === 0) {
		throw new RangeError("pickWeighted requires at least one item");
	}
	const weights = items.map((item) => {
		const weight = weightOf(item);
		if (!Number.isInteger(weight) || weight < 0) {
			throw new RangeError(`pickWeighted expected a non-negative integer weight, got ${weight}`);
		}
		return weight;
	});
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	if (total <= 0) {
		throw new RangeError("pickWeighted requires a positive total weight");
	}
	let ticket = rng.nextInt(total);
	for (let i = 0; i < items.length; i++) {
		ticket -= weights[i];
		if (ticket < 0) {
			return items[i];
		}
	}
	return items[items.length - 1];
}

export function shuffle<T>(items: readonly T[], rng: IntRng): T[] {
	const next = [...items];
	for (let i = next.length - 1; i > 0; i--) {
		const j = rng.nextInt(i + 1);
		const swap = next[i];
		next[i] = next[j];
		next[j] = swap;
	}
	return next;
}
