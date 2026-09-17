import { MAP_POOL, type SimMapId } from "../engine";

const STYLE_LABEL = {
	aim: "Aim",
	tactical: "Tactical",
	hybrid: "Hybrid",
} as const;

export function MapPicker({
	format,
	onPick,
}: {
	format: "BO1" | "BO3";
	onPick: (mapId: SimMapId) => void;
}) {
	return (
		<section className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/70 p-4 sm:p-6">
			<p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
				{format} · map pick
			</p>
			<h3 className="mt-1 text-center text-xl font-semibold text-white">Choose your map</h3>
			<p className="mx-auto mt-2 max-w-lg text-center text-sm text-zinc-400">
				You get a home bonus on this map. Remaining maps in a BO3 are drawn from the leftover pool.
				Aim maps reward riflers; tactical maps reward IGLs and coaches.
			</p>
			<ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{MAP_POOL.map((map) => (
					<li key={map.id}>
						<button
							type="button"
							onClick={() => onPick(map.id)}
							className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 text-left transition hover:border-emerald-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
						>
							<span className="relative block h-32 w-full overflow-hidden bg-zinc-800">
								<img
									src={map.background}
									alt=""
									className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
								/>
								<span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
							</span>
							<span className="flex items-center justify-between gap-2 px-3 py-2.5">
								<span className="font-semibold text-white">{map.label}</span>
								<span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
									{STYLE_LABEL[map.style]}
								</span>
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
