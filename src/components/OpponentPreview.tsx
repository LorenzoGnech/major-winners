import type { Org, PlayerSeason } from "../data";
import { ROLES } from "../data";
import type { HistoricalOpponent, TeamMemberProfile } from "../engine";
import { flagEmoji, ROLE_LABELS } from "./draftPresentation";
import { OrgCrest } from "./OrgCrest";
import { PlayerCrest } from "./PlayerCrest";

export function opponentEventLabel(label: string, orgName?: string): string {
	if (orgName && label.startsWith(`${orgName} · `)) return label.slice(orgName.length + 3);
	return label;
}

export function opponentRoster(members: readonly TeamMemberProfile[]): TeamMemberProfile[] {
	return ROLES.flatMap((role) => members.filter((member) => member.slot === role));
}

function crestFor(
	member: TeamMemberProfile,
	playersById: ReadonlyMap<string, PlayerSeason>,
): Pick<PlayerSeason, "playerId" | "nick" | "photo"> {
	const season = playersById.get(member.id);
	return {
		playerId: season?.playerId ?? member.playerId,
		nick: member.nick,
		photo: season?.photo,
	};
}

export function OpponentPreview({
	opponent,
	org,
	playerTeamName,
	playerOverall,
	format,
	playersById,
}: {
	opponent: HistoricalOpponent;
	org?: Pick<Org, "id" | "name" | "logo">;
	playerTeamName: string;
	playerOverall: number;
	format: string;
	playersById: ReadonlyMap<string, PlayerSeason>;
}) {
	const profile = opponent.profile;
	const event = opponentEventLabel(opponent.label, org?.name);
	const roster = opponentRoster(profile.members);

	return (
		<section aria-label={`${org?.name ?? opponent.label} scouting report`}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					{org ? <OrgCrest org={org} size="md" /> : null}
					<div className="min-w-0">
						<p className="truncate text-lg font-semibold text-white">{org?.name ?? event}</p>
						<p className="mt-0.5 truncate text-xs text-zinc-400">
							{org ? event : null}
							{org ? " · " : null}
							{format}
						</p>
					</div>
				</div>
				<div className="text-right">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
						Team OVR
					</p>
					<p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-200">
						{profile.overall.toFixed(1)}
					</p>
					<p className="text-[11px] tabular-nums text-zinc-500">
						{playerTeamName} {playerOverall.toFixed(1)}
					</p>
				</div>
			</div>

			<ul className="mt-4 space-y-1.5" aria-label="Opponent roster">
				{roster.map((member) => (
					<li
						key={member.id}
						className="flex items-center gap-2.5 rounded-xl bg-black/25 px-2 py-1.5"
					>
						<PlayerCrest player={crestFor(member, playersById)} size="sm" />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold text-zinc-100">{member.nick}</p>
							<p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
								<span>{ROLE_LABELS[member.slot]}</span>
								<span aria-hidden>{flagEmoji(member.nationality)}</span>
								<span className="normal-case tracking-normal">{member.year}</span>
							</p>
						</div>
						<span className="shrink-0 text-sm font-semibold tabular-nums text-amber-100">
							{Math.round(member.ovr)}
						</span>
					</li>
				))}
			</ul>

			<p className="mt-3 text-[11px] text-zinc-500">Coach · {profile.coach.nick}</p>

			{profile.strengths.length > 0 || profile.weaknesses.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{profile.strengths.map((item) => (
						<span
							key={`s-${item}`}
							className="rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200"
						>
							{item}
						</span>
					))}
					{profile.weaknesses.map((item) => (
						<span
							key={`w-${item}`}
							className="rounded-full bg-amber-400/12 px-2.5 py-0.5 text-[10px] font-semibold text-amber-200"
						>
							{item}
						</span>
					))}
				</div>
			) : null}
		</section>
	);
}
