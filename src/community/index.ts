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
