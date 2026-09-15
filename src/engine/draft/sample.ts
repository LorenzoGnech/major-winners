import type { OrgYear } from "../../data/schema";
import { type IntRng, pickWeighted } from "../rng";
import { DraftError } from "./error";
import { orgYearWeight, PLAYER_CARD_COUNT } from "./weights";

export type SampleableOrgYear = Pick<OrgYear, "id" | "tier">;

export function sampleOrgYears<T extends SampleableOrgYear>(
	orgYears: readonly T[],
	rng: IntRng,
	count = PLAYER_CARD_COUNT,
): T[] {
	if (orgYears.length < count) {
		throw new DraftError(
			"insufficient_org_years",
			`need ${count} org-years to roll player cards, got ${orgYears.length}`,
		);
	}
	const remaining = [...orgYears];
	const picked: T[] = [];
	for (let i = 0; i < count; i++) {
		const choice = pickWeighted(remaining, (orgYear) => orgYearWeight(orgYear.tier), rng);
		picked.push(choice);
		remaining.splice(remaining.indexOf(choice), 1);
	}
	return picked;
}
