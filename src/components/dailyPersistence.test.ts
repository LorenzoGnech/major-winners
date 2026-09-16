import { describe, expect, it } from "vitest";
import { loadDataset } from "../data";
import { applyAction, startDraft } from "../engine";
import { DAILY_ATTEMPT_STORAGE_VERSION, parsePersistedDailyAttempt } from "./dailyPersistence";

const dataset = loadDataset();
const day = "2026-09-15";
const seed = 123_456;

describe("daily attempt persistence", () => {
	it("restores deterministic Major and team rerolls", () => {
		const initial = startDraft(dataset, seed);
		const team = applyAction(initial, { type: "rerollTeam" }, dataset);
		if (!team.ok) throw team.error;
		const major = applyAction(team.value, { type: "rerollMajor" }, dataset);
		if (!major.ok) throw major.error;
		const raw = JSON.stringify({
			version: DAILY_ATTEMPT_STORAGE_VERSION,
			day,
			seed,
			draft: major.value,
			tournament: null,
		});

		expect(parsePersistedDailyAttempt(raw, dataset, day, seed)?.draft).toEqual(major.value);
	});

	it("restores a custom team name", () => {
		const original = startDraft(dataset, seed);
		const raw = JSON.stringify({
			version: DAILY_ATTEMPT_STORAGE_VERSION,
			day,
			seed,
			draft: original,
			tournament: null,
			teamName: "Major Winners",
		});
		expect(parsePersistedDailyAttempt(raw, dataset, day, seed)?.teamName).toBe("Major Winners");
	});

	it("rejects a card that does not belong to the historical dataset", () => {
		const original = startDraft(dataset, seed);
		const draft = {
			...original,
			cards: original.cards.map((card, index) =>
				index === 0 ? { ...card, orgYearId: "invented-roster" } : card,
			),
		};
		const raw = JSON.stringify({
			version: DAILY_ATTEMPT_STORAGE_VERSION,
			day,
			seed,
			draft,
			tournament: null,
		});

		expect(parsePersistedDailyAttempt(raw, dataset, day, seed)).toBeNull();
	});
});
