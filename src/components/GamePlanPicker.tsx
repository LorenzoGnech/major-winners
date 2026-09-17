import type { ReactNode } from "react";
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

function glyph(d: string): ReactNode {
	return (
		<svg viewBox="0 0 24 24" aria-hidden className="h-8 w-8 shrink-0 text-zinc-200">
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const PLAN_ICON: Record<GamePlanId, ReactNode> = {
	standard: glyph("M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z"),
	rush: glyph("M4 12h11M12 6l7 6-7 6"),
	"late-execute": glyph("M12 7v5l3 2M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"),
	"pick-heavy": glyph("M12 4v3M12 17v3M4 12h3M17 12h3M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"),
	executes: glyph("M5 19c2-5 4-8 7-8s5 3 7 8M9 8a3 3 0 1 1 6 0"),
	"anti-strat": glyph("M5 8h10l-2-2M19 16H9l2 2"),
	contact: glyph("M8 12h8M10 8l2 4 2-4M10 16l2-4 2 4"),
	risky: glyph("M8 19c0-4 2.5-5 4-9 1.5 4 4 5 4 9H8zM12 5v2"),
};

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
			<ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
				{GAME_PLANS.map((plan) => {
					const active = selected === plan.id;
					return (
						<li key={plan.id}>
							<button
								type="button"
								onClick={() => setSelected(plan.id)}
								className={`flex aspect-square h-full w-full flex-col rounded-lg border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
									active
										? "border-emerald-300/70 bg-emerald-300/10"
										: "border-white/10 bg-zinc-900 hover:border-emerald-300/40"
								}`}
							>
								{PLAN_ICON[plan.id]}
								<span className="mt-2 font-semibold text-white">{plan.label}</span>
								<span className="mt-2 text-[11px] leading-4 text-yellow-300">
									<span className="font-semibold">T · </span>
									{plan.tSide}
								</span>
								<span className="mt-1 text-[11px] leading-4 text-blue-400">
									<span className="font-semibold">CT · </span>
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
