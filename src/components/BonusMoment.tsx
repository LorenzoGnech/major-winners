import type { PlayerSeason } from "../data";
import type { BonusDefinition } from "../engine/bonuses";
import { PlayerCrest } from "./PlayerCrest";

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
	return (
		<div
			role="dialog"
			aria-label={`${trait.name}. ${player.nick}. ${trait.blurb}`}
			className={`absolute inset-0 z-40 flex flex-col justify-center px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[timeout-moment-in_420ms_ease-out] sm:px-8 ${
				malus ? "bg-amber-950/86" : "bg-zinc-950/86"
			}`}
		>
			<div className="mx-auto w-full max-w-xl text-center">
				<p
					className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${
						malus ? "text-amber-300/80" : "text-sky-300/80"
					}`}
				>
					{malus ? "Malus" : "Bonus"}
				</p>
				<img src={trait.icon} alt="" className="mx-auto mt-4 size-16 rounded-2xl sm:size-20" />
				<h4 className="mt-4 text-3xl font-semibold tracking-[0.08em] text-white sm:text-5xl">
					{trait.name}
				</h4>
				<p className="mt-3 text-sm text-zinc-300 sm:text-base">{trait.blurb}</p>
				<div className="mt-7 flex flex-col items-center gap-2">
					<div
						className={`rounded-xl ring-2 ring-offset-2 ring-offset-zinc-950 ${
							malus ? "ring-amber-300/55" : "ring-sky-300/55"
						}`}
					>
						<PlayerCrest player={player} size="lg" loading="eager" />
					</div>
					<p className={`text-sm font-semibold ${malus ? "text-amber-100" : "text-sky-100"}`}>
						{player.nick}
					</p>
				</div>
			</div>
			{footer ? <div className="mt-8 flex justify-center">{footer}</div> : null}
		</div>
	);
}
