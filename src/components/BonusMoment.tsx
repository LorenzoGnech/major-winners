import { useState } from "react";
import type { PlayerSeason } from "../data";
import type { BonusDefinition } from "../engine/bonuses";
import { PlayerCrest } from "./PlayerCrest";

const MOTES = [
	{ left: "8%", delay: "80ms", duration: "1.6s" },
	{ left: "22%", delay: "220ms", duration: "1.9s" },
	{ left: "37%", delay: "40ms", duration: "1.5s" },
	{ left: "51%", delay: "300ms", duration: "1.8s" },
	{ left: "66%", delay: "140ms", duration: "2s" },
	{ left: "79%", delay: "360ms", duration: "1.7s" },
	{ left: "91%", delay: "200ms", duration: "1.6s" },
	{ left: "14%", delay: "480ms", duration: "1.9s" },
] as const;

function TraitArt({ trait }: { trait: BonusDefinition }) {
	const [src, setSrc] = useState(trait.art);
	return (
		<img
			src={src}
			alt=""
			onError={() => {
				if (src !== trait.icon) setSrc(trait.icon);
			}}
			className="bonus-art-drift max-h-[min(22rem,46vh)] w-auto max-w-full object-contain"
		/>
	);
}

export function BonusMoment({
	trait,
	player,
}: {
	trait: BonusDefinition;
	player: Pick<PlayerSeason, "playerId" | "nick" | "photo">;
}) {
	const malus = trait.polarity === "malus";
	const tone = malus ? "text-amber-300" : "text-sky-300";
	const nick = malus ? "text-amber-100" : "text-sky-100";
	const ring = malus ? "ring-amber-300/60" : "ring-sky-300/60";
	const frame = malus
		? "border-amber-300/35 bg-amber-950/40 shadow-[0_0_48px_rgb(251_191_36_/_0.18)]"
		: "border-sky-300/35 bg-sky-950/35 shadow-[0_0_48px_rgb(56_189_248_/_0.2)]";

	return (
		<div
			role="dialog"
			aria-label={`${trait.name}. ${player.nick}. ${trait.blurb}`}
			className={`bonus-moment-root absolute inset-0 z-40 flex flex-col justify-center overflow-hidden px-4 py-6 backdrop-blur-[3px] sm:px-8 ${
				malus ? "bg-amber-950/88" : "bg-zinc-950/88"
			}`}
		>
			<div aria-hidden className={`bonus-moment-flash ${malus ? "bg-amber-200" : "bg-sky-200"}`} />
			<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
				{MOTES.map((mote) => (
					<span
						key={`${mote.left}-${mote.delay}`}
						className={`bonus-mote ${malus ? "bonus-mote-malus" : "bonus-mote-bonus"}`}
						style={{
							left: mote.left,
							animationDelay: mote.delay,
							animationDuration: mote.duration,
						}}
					/>
				))}
			</div>

			<div
				className={`relative mx-auto flex w-full max-w-5xl flex-col items-center gap-6 ${
					malus ? "bonus-moment-shake" : ""
				}`}
			>
				<div className="bonus-art-slam flex w-full justify-center">
					<div
						className={`flex max-w-3xl items-center justify-center rounded-3xl border px-3 py-3 sm:px-5 sm:py-4 ${frame}`}
					>
						<TraitArt trait={trait} />
					</div>
				</div>

				<div className="flex w-full flex-col items-center gap-5 sm:flex-row sm:items-end sm:justify-center sm:gap-8">
					<div className="min-w-0 text-center sm:text-left">
						<p className={`bonus-stamp text-[11px] font-bold uppercase tracking-[0.28em] ${tone}`}>
							{malus ? "Malus" : "Bonus"}
						</p>
						<h4 className="bonus-title-slam mt-2 text-3xl font-semibold tracking-[0.08em] text-white sm:text-5xl">
							{trait.name}
						</h4>
						<p className="bonus-copy-in mt-3 max-w-xl text-sm text-zinc-300 sm:text-base">
							{trait.blurb}
						</p>
					</div>
					<div className="bonus-player-pop flex shrink-0 flex-col items-center gap-2">
						<div className={`rounded-xl ring-2 ring-offset-2 ring-offset-zinc-950 ${ring}`}>
							<PlayerCrest player={player} size="hero" loading="eager" />
						</div>
						<p className={`text-sm font-semibold sm:text-base ${nick}`}>{player.nick}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
