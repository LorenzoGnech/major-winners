export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function roundInt(value: number): number {
	return Math.round(value);
}

/** Map a raw stat onto 55–96. `lo` → 55, `hi` → 96. */
export function scaleStat(value: number, lo: number, hi: number, outMin = 55, outMax = 96): number {
	if (hi === lo) {
		return roundInt((outMin + outMax) / 2);
	}
	const t = clamp((value - lo) / (hi - lo), 0, 1);
	return roundInt(outMin + t * (outMax - outMin));
}
