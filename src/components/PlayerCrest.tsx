import type { PlayerSeason } from "../data";
import { playerCrestTone, playerInitials, playerPhotoSrc } from "../data/playerPhoto";

const SIZE_CLASS = {
	sm: "size-8 text-[10px]",
	md: "size-12 text-xs",
	lg: "size-16 text-sm",
	xl: "size-24 text-lg",
	hero: "h-44 w-32 text-2xl sm:h-56 sm:w-40",
} as const;

type PlayerCrestProps = {
	player: Pick<PlayerSeason, "playerId" | "nick" | "photo">;
	size?: keyof typeof SIZE_CLASS;
	loading?: "lazy" | "eager";
};

export function PlayerCrest({ player, size = "md", loading = "lazy" }: PlayerCrestProps) {
	const src = playerPhotoSrc(player);
	const tone = playerCrestTone(player.playerId);
	if (src) {
		return (
			<img
				src={src}
				alt=""
				loading={loading}
				decoding="async"
				className={`shrink-0 rounded-lg object-cover object-top ${SIZE_CLASS[size]}`}
			/>
		);
	}
	return (
		<div
			aria-hidden
			className={`flex shrink-0 items-center justify-center rounded-lg border border-white/10 font-bold tracking-wide ${SIZE_CLASS[size]}`}
			style={{ background: tone.background, color: tone.foreground }}
		>
			{playerInitials(player.nick)}
		</div>
	);
}
