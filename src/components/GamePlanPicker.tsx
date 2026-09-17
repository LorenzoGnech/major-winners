import { useState } from "react";
import {
	DEFAULT_GAME_PLAN,
	GAME_PLANS,
	type GamePlanId,
	type SeriesFormat,
	type SimMap,
} from "../engine";

const STYLE_LABEL = {
	aim: "Aim",
	tactical: "Tactical",
	hybrid: "Hybrid",
} as const;

export function GamePlanPicker({
	map,
	mapNumber,
	format,
	onConfirm,
}: {
	map: SimMap;
	mapNumber: number;
	format: SeriesFormat;
	onConfirm: (plan: GamePlanId) => void;
}) {
	const [selected, setSelected] = useState<GamePlanId>(DEFAULT_GAME_PLAN);

	return (
		<section className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6">
			<p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
				{format} · map {mapNumber} · {STYLE_LABEL[map.style]}
			</p>
			<h3 className="mt-1 text-center text-xl font-semibold text-white">
				How do you play {map.label}?
			</h3>
			<p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-400">
				One plan for this map. Standard defaults is the baseline. Other cards trade tempo, utility,
				and calling.
			</p>
			<ul className="mt-5 grid gap-3 sm:grid-cols-2">
				{GAME_PLANS.map((plan) => {
					const active = selected === plan.id;
					const favored = plan.favoredStyles.includes(map.style);
					return (
						<li key={plan.id}>
							<button
								type="button"
								onClick={() => setSelected(plan.id)}
								className={`flex h-full w-full flex-col rounded-2xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
									active
										? "border-emerald-300/70 bg-emerald-300/10"
										: "border-white/10 bg-zinc-900 hover:border-emerald-300/40"
								}`}
							>
								<span className="flex items-center justify-between gap-2">
									<span className="font-semibold text-white">{plan.label}</span>
									{favored ? (
										<span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
											Fits {STYLE_LABEL[map.style]}
										</span>
									) : null}
								</span>
								<span className="mt-2 text-xs leading-5 text-zinc-400">
									<span className="font-semibold text-zinc-300">T · </span>
									{plan.tSide}
								</span>
								<span className="mt-1 text-xs leading-5 text-zinc-400">
									<span className="font-semibold text-zinc-300">CT · </span>
									{plan.ctSide}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
			<div className="mt-5 flex justify-center">
				<button
					type="button"
					onClick={() => onConfirm(selected)}
					className="rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
				>
					Play {map.label}
				</button>
			</div>
		</section>
	);
}
