export {
	fetchBestRuns,
	fetchMyTeams,
	fetchSavedTeams,
	getSession,
	getSupabase,
	isCommunityEnabled,
	onAuthChange,
	type PublishResult,
	publishFinishedRun,
	rosterNicks,
	signInWithMagicLink,
	signOut,
} from "./client";
export { completedDraftFromSnapshot } from "./draft";
export {
	applyRoomVeto,
	clearPersistedDuel,
	DUEL_CODE_LENGTH,
	DUEL_POLL_MS,
	DUEL_STORAGE_KEY,
	DUEL_STORAGE_VERSION,
	type DuelClaim,
	type DuelMapQueueRow,
	type DuelRoom,
	type DuelRosterSnapshot,
	type DuelSide,
	type DuelStatus,
	draftFromDuelRoster,
	liveSeriesFromDuelRoom,
	loadPersistedDuel,
	mapContextsFromRows,
	normalizeDuelCode,
	otherSide,
	type PersistedDuel,
	parseDuelCode,
	parsePersistedDuel,
	profileFromDuelRoster,
	rosterForSide,
	savedTeamFromDuelRoster,
	savePersistedDuel,
	sideIndex,
	vetoStateFromRoom,
} from "./duel";
export {
	createDuel,
	fetchDuel,
	joinDuel,
	submitDuelRoster,
	submitDuelVeto,
} from "./duelClient";
export { loadPublishedFingerprints, rememberPublishedFingerprint } from "./local";
export {
	buildCommunityOpponents,
	mergeOpponentPools,
	teamOverallFromSnapshot,
} from "./opponents";
export { compareBestRuns, compareHighestRated, uniqueTeamsByRoster } from "./ranking";
export {
	AUTHOR_NAME_MAX,
	COMMUNITY_BOARD_SIZE,
	type CommunityGameMode,
	communityModeSchema,
	DEFAULT_AUTHOR_NAME,
	type PublishedRunSnapshot,
	parseAuthorName,
	type RosterSnapshot,
	rosterSnapshotSchema,
	runFingerprint,
	type SavedTeamSnapshot,
	savedTeamSnapshotSchema,
} from "./schema";
export { rosterFromDraft, snapshotDraftFields, traitsFromDraft } from "./snapshot";
