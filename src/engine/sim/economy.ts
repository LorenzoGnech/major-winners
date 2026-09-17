import { clamp } from "../math";
import type { BuyType, EconomyRound, EconomyState } from "./types";

export const INITIAL_ECONOMY: EconomyState = {
	bank: 800,
	lossBonus: 1_400,
	losses: 0,
};

const BUY_COST: Record<BuyType, number> = {
	pistol: 0,
	"full-buy": 4_500,
	force: 2_200,
	eco: 500,
};

/** Five-player loadout value shown on the this-round bar. */
export const EQUIPMENT_VALUE: Record<BuyType, number> = {
	pistol: 4_000,
	eco: 2_500,
	force: 11_000,
	"full-buy": 22_500,
};

const BANK_DISPLAY_SCALE = 5;

export function equipmentValue(buy: BuyType | undefined): number {
	return buy ? EQUIPMENT_VALUE[buy] : EQUIPMENT_VALUE.pistol;
}

export function displayBank(amount: number): number {
	return amount * BANK_DISPLAY_SCALE;
}

export function bankAfterBuy(row: Pick<EconomyRound, "buy" | "bankBefore">): number {
	return Math.max(0, row.bankBefore - Math.min(row.bankBefore, BUY_COST[row.buy]));
}

export function playbackBanks(
	rows: readonly [EconomyRound | undefined, EconomyRound | undefined] | undefined,
	settled: boolean,
): readonly [number, number] {
	return ([0, 1] as const).map((team) => {
		const row = rows?.[team];
		if (!row) return displayBank(INITIAL_ECONOMY.bank);
		return displayBank(settled ? row.bankAfter : bankAfterBuy(row));
	}) as [number, number];
}

export const EQUIPMENT_STRENGTH: Record<BuyType, number> = {
	pistol: 0.48,
	"full-buy": 1,
	force: 0.7,
	eco: 0.28,
};

/** Full buy vs eco is about +0.35 for the rifles. */
export const EQUIPMENT_WEIGHT = 0.48;

export function chooseBuy(
	state: EconomyState,
	options: { pistol: boolean; economyDiscipline: number },
): BuyType {
	if (options.pistol) return "pistol";
	const discipline = clamp(options.economyDiscipline, 0, 100);
	const fullBuyThreshold = 4_100 - (discipline - 50) * 4;
	if (state.bank >= fullBuyThreshold) return "full-buy";
	const forceThreshold = 2_000 + (discipline - 50) * 8;
	return state.bank >= forceThreshold ? "force" : "eco";
}

export function resolveEconomyRound(
	state: EconomyState,
	buy: BuyType,
	won: boolean,
): { state: EconomyState; round: EconomyRound } {
	const spent = Math.min(state.bank, BUY_COST[buy]);
	const income = won ? 3_250 : state.lossBonus;
	const losses = won ? 0 : state.losses + 1;
	const lossBonus = won ? 1_400 : Math.min(3_400, 1_400 + losses * 500);
	const bank = Math.min(16_000, state.bank - spent + income);
	return {
		state: { bank, lossBonus, losses },
		round: {
			buy,
			bankBefore: state.bank,
			bankAfter: bank,
			lossBonusBefore: state.lossBonus,
			lossBonusAfter: lossBonus,
		},
	};
}
