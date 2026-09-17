import type { ReactNode } from "react";
import type { PlayerSeason } from "../data";
import type { TeamMemberProfile } from "../engine";
import { PlayerCrest } from "./PlayerCrest";

export function TimeoutMoment({
	teamLabel,
	coachNick,
	members,
	crestFor,
	moraleGain,
	footer,
}: {
	teamLabel: string;
	coachNick: string;
	members: readonly TeamMemberProfile[];
	crestFor: (member: TeamMemberProfile) => Pick<PlayerSeason, "playerId" | "nick" | "photo">;
	moraleGain: number;
	footer?: ReactNode;
}) {
	return (
		<div
			role="dialog"
			aria-label={`Timeout. ${teamLabel} morale up ${moraleGain}.`}
			className="absolute inset-0 z-40 flex flex-col justify-center bg-zinc-950/86 px-4 py-6 backdrop-blur-[3px] motion-safe:animate-[timeout-moment-in_420ms_ease-out] sm:px-8"
		>
			<div className="mx-auto w-full max-w-3xl text-center">
				<p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">
					Tactical pause
				</p>
				<h4 className="mt-2 text-4xl font-semibold tracking-[0.12em] text-white sm:text-6xl">
					TIMEOUT
				</h4>
				<p className="mt-3 text-sm text-zinc-300 sm:text-base">
					{teamLabel}
					<span className="text-zinc-600"> · </span>
					Coach {coachNick}
				</p>
				<p
					className="timeout-morale-pop mt-5 text-2xl font-semibold tabular-nums text-emerald-300 sm:text-3xl"
					aria-live="polite"
				>
					+{moraleGain} morale
				</p>
				<ul
					className="mt-7 flex flex-wrap items-end justify-center gap-3"
					aria-label={`${teamLabel} huddle`}
				>
					{members.map((member) => (
						<li key={member.id} className="flex flex-col items-center gap-1.5">
							<div className="rounded-xl ring-2 ring-emerald-300/55 ring-offset-2 ring-offset-zinc-950">
								<PlayerCrest player={crestFor(member)} size="lg" loading="eager" />
							</div>
							<p className="text-xs font-semibold text-emerald-100">{member.nick}</p>
						</li>
					))}
				</ul>
			</div>
			{footer ? <div className="mt-8 flex justify-center">{footer}</div> : null}
		</div>
	);
}
