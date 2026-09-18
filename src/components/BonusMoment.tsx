import { useState } from "react";
import type { PlayerSeason } from "../data";
import type { BonusDefinition } from "../engine/bonuses";
import { PlayerCrest } from "./PlayerCrest";

function TraitArt({ trait, malus }: { trait: BonusDefinition; malus: boolean }) {
	const [src, setSrc] = useState(trait.art);
	const ring = malus ? "ring-amber-300/55" : "ring-sky-300/55";
	return (
		<img
			src={src}
			alt=""
			onError={() => {
				if (src !== trait.icon) setSrc(trait.icon);
			}}
			className={`aspect-square w-full max-w-56 rounded-2xl object-cover ring-2 ring-offset-2 ring-offset-zinc-950 ${ring}`}
		/>
	);
}

export function BonusMoment({
	trait,
	player,
	footer,
}: {
	trait: BonusDefinition;
	player: Pick<PlayerSeason, "playerId" | "nick" | "photo">;
	footer?: React.ReactNode;
}) {
	const malus = trait.polarity === "malus";
	const tone = malus ? "text-amber-300/80" : "text-sky-300/80";
	const nick = malus ? "text-amber-100" : "text-sky-100";
	const ring = malus ? "ring-amber-300/55" : "ring-sky-300/55";
	return (
		<div
			role="dialog"
			aria-label={`${trait.name}. ${player.nick}. ${trait.blurb}`}
			className={`absolute inset-0 z-40 flex flex-col justify-center px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[timeout-moment-in_420ms_ease-out] sm:px-8 ${
				malus ? "bg-amber-950/86" : "bg-zinc-950/86"
			}`}
		>
			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_minmax(8rem,12rem)]">
				<div className="flex justify-center">
					<TraitArt trait={trait} malus={malus} />
				</div>
				<div className="min-w-0 text-center">
					<p className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${tone}`}>
						{malus ? "Malus" : "Bonus"}
					</p>
					<h4 className="mt-2 text-3xl font-semibold tracking-[0.08em] text-white sm:text-5xl">
						{trait.name}
					</h4>
					<p className="mt-3 text-sm text-zinc-300 sm:text-base">{trait.blurb}</p>
				</div>
				<div className="flex flex-col items-center gap-2">
					<div className={`rounded-xl ring-2 ring-offset-2 ring-offset-zinc-950 ${ring}`}>
						<PlayerCrest player={player} size="hero" loading="eager" />
					</div>
					<p className={`text-sm font-semibold sm:text-base ${nick}`}>{player.nick}</p>
				</div>
			</div>
			{footer ? <div className="mt-8 flex justify-center">{footer}</div> : null}
		</div>
	);
}
