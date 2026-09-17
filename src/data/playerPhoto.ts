import { orgCrestTone } from "./orgLogo";
import type { PlayerSeason } from "./schema";

export function playerPhotoSrc(player: Pick<PlayerSeason, "photo">): string | undefined {
	return player.photo;
}

/** Fallback mark for a player-season whose HLTV stats headshot has not been imported. */
export function playerInitials(nick: string): string {
	const compact = nick.replaceAll(/[^a-zA-Z0-9]/g, "");
	return (compact.slice(0, 2) || "?").toUpperCase();
}

export function playerCrestTone(playerId: string): { background: string; foreground: string } {
	return orgCrestTone(playerId);
}
