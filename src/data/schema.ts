import { z } from "zod";

export const ROLES = ["awp", "igl", "entry", "support", "lurker"] as const;
export const GAMES = ["cs16", "css", "csgo", "cs2"] as const;
export const DATA_REGIMES = ["full", "partial", "none"] as const;
export const ORG_TIERS = ["legendary", "strong", "cult"] as const;

export const roleSchema = z.enum(ROLES);
export const gameSchema = z.enum(GAMES);
export const dataRegimeSchema = z.enum(DATA_REGIMES);
export const orgTierSchema = z.enum(ORG_TIERS);

export const attributesSchema = z.object({
	aim: z.number().min(0).max(100).optional(),
	entry: z.number().min(0).max(100).optional(),
	clutch: z.number().min(0).max(100).optional(),
	utility: z.number().min(0).max(100).optional(),
	consistency: z.number().min(0).max(100).optional(),
	igl: z.number().min(0).max(100).optional(),
});

export const statsSchema = z.object({
	rating: z.number().positive(),
	ratingVersion: z.enum(["1.0", "2.0"]),
	kpr: z.number().nonnegative(),
	dpr: z.number().nonnegative(),
	adr: z.number().nonnegative().optional(),
	kast: z.number().min(0).max(100).optional(),
	impact: z.number().nonnegative().optional(),
	openingKpr: z.number().nonnegative().optional(),
	clutchRate: z.number().min(0).max(1).optional(),
});

export const curatedSchema = z.object({
	ovr: z.number().min(0).max(100),
	attributes: attributesSchema,
	rationale: z.string().min(1),
});

export const accoladesSchema = z.object({
	top20Rank: z.number().int().min(1).max(20).optional(),
	majorWins: z.number().int().min(0),
	majorMvps: z.number().int().min(0),
	eventMvps: z.number().int().min(0),
});

export const orgSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	country: z.string().length(2),
});

export const orgYearSchema = z.object({
	id: z.string().min(1),
	orgId: z.string().min(1),
	year: z.number().int(),
	game: gameSchema,
	tier: orgTierSchema,
	playerSeasonIds: z.array(z.string().min(1)).length(5),
	coachId: z.string().min(1).optional(),
	note: z.string().optional(),
});

export const coachSchema = z.object({
	id: z.string().min(1),
	nick: z.string().min(1),
	realName: z.string().min(1),
	nationality: z.string().length(2),
	year: z.number().int(),
	orgId: z.string().min(1),
	modifiers: z.object({
		comeback: z.number().int().min(-2).max(2),
		economy: z.number().int().min(-2).max(2),
		antistrat: z.number().int().min(-2).max(2),
	}),
});

export const playerSeasonSchema = z
	.object({
		id: z.string().min(1),
		playerId: z.string().min(1),
		nick: z.string().min(1),
		realName: z.string().min(1),
		nationality: z.string().length(2),
		year: z.number().int(),
		orgId: z.string().min(1),
		game: gameSchema,
		roles: z.array(roleSchema).min(1),
		primaryRole: roleSchema,
		dataRegime: dataRegimeSchema,
		stats: statsSchema.optional(),
		curated: curatedSchema.optional(),
		accolades: accoladesSchema,
	})
	.superRefine((row, ctx) => {
		if (row.id !== `${row.playerId}-${row.year}`) {
			ctx.addIssue({
				code: "custom",
				path: ["id"],
				message: `expected "${row.playerId}-${row.year}"`,
			});
		}
		if (!row.roles.includes(row.primaryRole)) {
			ctx.addIssue({
				code: "custom",
				path: ["primaryRole"],
				message: "primaryRole must be listed in roles",
			});
		}
		if (row.dataRegime === "none" && !row.curated) {
			ctx.addIssue({
				code: "custom",
				path: ["curated"],
				message: "regime none requires curated OVR and rationale",
			});
		}
		if (row.dataRegime === "partial" && !row.stats) {
			ctx.addIssue({
				code: "custom",
				path: ["stats"],
				message: "regime partial requires rating, kpr, and dpr",
			});
		}
		if (row.dataRegime === "full") {
			const stats = row.stats;
			if (
				!stats ||
				stats.adr === undefined ||
				stats.kast === undefined ||
				stats.impact === undefined
			) {
				ctx.addIssue({
					code: "custom",
					path: ["stats"],
					message: "regime full requires rating plus ADR, KAST, and impact",
				});
			}
		}
	});

export const datasetSchema = z.object({
	orgs: z.array(orgSchema).min(1),
	orgYears: z.array(orgYearSchema).min(1),
	playerSeasons: z.array(playerSeasonSchema).min(1),
	coaches: z.array(coachSchema).min(1),
});

export type Role = z.infer<typeof roleSchema>;
export type Game = z.infer<typeof gameSchema>;
export type DataRegime = z.infer<typeof dataRegimeSchema>;
export type OrgTier = z.infer<typeof orgTierSchema>;
export type Org = z.infer<typeof orgSchema>;
export type OrgYear = z.infer<typeof orgYearSchema>;
export type PlayerSeason = z.infer<typeof playerSeasonSchema>;
export type Coach = z.infer<typeof coachSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
