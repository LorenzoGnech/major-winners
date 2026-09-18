import type { ReactNode } from "react";
import type { PlayerSeason } from "../data";
import type { TeamMemberProfile } from "../engine";
import { PlayerCrest } from "./PlayerCrest";

const CLUTCH_MOMENT_IN_MS = 400;
const CLUTCH_LINE_REVEAL_MS = 240;

function keyedLines(lines: readonly string[]): { key: string; line: string; latest: boolean }[] {
	const seen = new Map<string, number>();
	return lines.map((line, index) => {
		const count = (seen.get(line) ?? 0) + 1;
		seen.set(line, count);
		return {
			key: count === 1 ? line : `${line} #${count}`,
			line,
			latest: index === lines.length - 1,
		};
	});
}

export function ClutchMoment({
	player,
	playerCrest,
	opponents,
	against,
	lines,
	speed = 1,
	footer,
}: {
	player: string;
	playerCrest: Pick<PlayerSeason, "playerId" | "nick" | "photo">;
	opponents: readonly { member: TeamMemberProfile; crest: typeof playerCrest; dead: boolean }[];
	against: number;
	lines: readonly string[];
	speed?: 1 | 2 | 4;
	footer?: ReactNode;
}) {
	return (
		<div
			role="dialog"
			aria-label={`${player} clutch, 1 vs ${against}`}
			className="absolute inset-0 z-30 flex flex-col justify-center bg-zinc-950/82 px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[clutch-moment-in_400ms_ease-out] sm:px-8"
			style={{ animationDuration: `${CLUTCH_MOMENT_IN_MS / speed}ms` }}
		>
			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_minmax(10rem,16rem)]">
				<div className="flex flex-col items-center text-center">
					<div className="rounded-2xl ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-zinc-950">
						<PlayerCrest player={playerCrest} size="hero" loading="eager" />
					</div>
					<p className="mt-3 text-lg font-semibold text-emerald-200 sm:text-xl">{player}</p>
					<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
						Alone
					</p>
				</div>

				<section className="min-w-0 text-center" aria-label="Clutch cast">
					<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
						Clutch
					</p>
					<h4 className="mt-1 text-4xl font-semibold tabular-nums text-white sm:text-5xl">
						1 <span className="text-zinc-600">vs</span> {against}
					</h4>
					<ol className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm leading-snug sm:text-base">
						{keyedLines(lines).map(({ key, line, latest }) => (
							<li
								key={key}
								className={
									latest
										? "font-medium text-white motion-safe:animate-[draft-reveal_240ms_ease-out]"
										: "text-zinc-400"
								}
								style={
									latest ? { animationDuration: `${CLUTCH_LINE_REVEAL_MS / speed}ms` } : undefined
								}
							>
								{line}
							</li>
						))}
					</ol>
				</section>

				<ul
					className="flex flex-wrap items-center justify-center gap-3 sm:justify-end"
					aria-label="Remaining opponents"
				>
					{opponents.map(({ member, crest, dead }) => (
						<li
							key={member.id}
							aria-label={dead ? `${member.nick}, eliminated` : member.nick}
							className={`flex flex-col items-center gap-1.5 motion-safe:transition-[opacity,filter] ${
								dead ? "opacity-35 grayscale" : ""
							}`}
						>
							<div
								className={`rounded-xl ${
									dead ? "" : "ring-2 ring-amber-300/70 ring-offset-2 ring-offset-zinc-950"
								}`}
							>
								<PlayerCrest player={crest} size="xl" loading="eager" />
							</div>
							<p className={`text-xs font-semibold ${dead ? "text-zinc-500" : "text-amber-200"}`}>
								{member.nick}
							</p>
						</li>
					))}
				</ul>
			</div>
			{footer ? <div className="mt-8 flex justify-center">{footer}</div> : null}
		</div>
	);
}
