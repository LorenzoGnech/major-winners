# Data

The game never talks to HLTV (or any other live stats API). Everything draftable is committed JSON under `src/data/json/`.

## Files

| File | Contents |
| --- | --- |
| `src/data/json/majors.json` | 24 completed Valve Majors through IEM Cologne 2026 |
| `src/data/json/orgs.json` | Organizations |
| `src/data/json/org-years.json` | 511 played Major roster appearances plus two Legacy wildcards |
| `src/data/json/player-seasons.json` | Player-org-seasons (`s1mple-2018-navi`, not a career), optional `photo` and `displayNick` |
| `src/data/json/role-overrides.json` | Curated `primaryRole` / `roles` locks keyed by player-season id |
| `src/data/json/coaches.json` | Coach cards for the sixth draft round |
| `src/data/schema.ts` | Zod contracts |
| `scripts/validate-data.ts` | Relational checks used in CI |

## Provenance

- **Majors, rosters, placements:** revision-pinned [Liquipedia Counter-Strike](https://liquipedia.net/counterstrike) pages (CC BY-SA 3.0 US), imported through the supported MediaWiki API with the required User-Agent and rate limits. The adapted committed dataset is distributed under [`DATA-LICENSE.md`](../DATA-LICENSE.md).
- **Accolades:** HLTV Top 20 Players of the Year lists (2013–2025; 2010–2011 for 1.6; no 2012 list) plus Major MVPs.
- **Season stats:** HLTV player stats filtered to a calendar year, e.g. `https://www.hltv.org/stats/players?startDate=2018-01-01&endDate=2018-12-31`. Prefer the LAN / big-events filter when it exists.

The complete roster corpus contains every team that actually played at the 24 Valve Majors completed from DreamHack Winter 2013 through IEM Cologne 2026. Replaced source cards are omitted during normalization rather than represented in game logic. Boston 2018 therefore has 23 played teams; 2018–2024 otherwise have 24, and the 2025–2026 fields have 32.

Org logos are committed image files under `public/logos/`, referenced by `org.logo`. Major event logos live under `public/logos/majors/`, referenced by `major.logo`. Player-year portraits live under `public/photos/players/{playerId}/{year}.{ext}`, referenced by optional `playerSeason.photo`. They are team, tournament, and photographer marks rather than CC BY-SA dataset text, so they are tracked separately from the roster corpus (see [`DATA-LICENSE.md`](../DATA-LICENSE.md)). An org, Major, or player-season without a file renders a generated initials crest.

## Data regimes

| Regime | When | Required fields |
| --- | --- | --- |
| `full` | CS:GO 2016+ and CS2 | `stats.rating` plus ADR, KAST, impact |
| `partial` | CS:GO 2013–2015 (Rating 1.0) | `stats.rating`, kpr, dpr |
| `none` | 1.6 / Source, no usable rating | `curated.ovr`, `curated.attributes`, `curated.rationale` |
| `fallback` | Major participant awaiting verified individual stats | Conservative placement OVR, provisional role, rationale |

`dataRegime` is load-bearing: it picks the ratings path and keeps the UI from showing invented statistics. `ratingProvenance.kind` distinguishes verified stats, curated Legacy legends, and conservative fallback rows.

## Roster import workflow

`npm run import:majors -- --write` reads the 24-page manifest in `scripts/major-source-manifest.ts`, calls Liquipedia's supported MediaWiki API, and writes normalized static JSON. Raw responses are cached under ignored `.cache/major-import/`; `--offline` rebuilds exclusively from that cache.

1. Fetch raw page wikitext at no more than one request every two seconds.
2. For modern dynamic prize tables, fetch rendered API output at no more than one `action=parse` request every 30 seconds.
3. Parse the five players who actually played, coach, registered non-playing substitutes, and final placement. Prize-pool ties use the start of the range (3 for 3rd–4th). Replaced source cards and non-team placeholders are discarded before field-size validation.
4. Preserve already verified player ratings and any curated or inferred roles. Generate an explicit `fallback` row for every remaining player-org-season, using TeamCard order only when that season has no role lock. Career ids keep Liquipedia `(X player)` disambiguators and split bare shared nicks by TeamCard flag (`adren` vs `adren_american`, `niko` vs `niko_danish`).
5. Require 24 revision-pinned Majors and exactly 511 played roster appearances before writing.
6. Fill coach modifiers from each coach's best roster placement unless the existing row is hand-tuned (it does not match the placement formula). Champion 5, finalist 4, top eight 3, everyone else 2.
7. Run `npm run validate-data`, `npm run calibrate`, and the full test suite.

This majors importer does not call HLTV. The shipped app never talks to HLTV either.

## HLTV player-stats retrieval

`npm run import:hltv` walks CS:GO and CS2 player-org-seasons and caches year-filtered HLTV stats under ignored `.cache/hltv-import/`. The unofficial [HLTV Node parser](https://github.com/gigobyte/HLTV) is not used for identity or stats: its `getPlayer` parser dies on current profile HTML (`imageUrl.includes` when the bodyshot is missing), and `/stats/` sits behind a Cloudflare challenge.

1. Resolve each nick from the search JSON (`/search?term=…`, including `forest` → `f0rest`). That payload already has id, IGN, real name, and flag. Do not fetch `/player/{id}`.
2. Load calendar-year stats in headed Chrome (Patchright) so Cloudflare clearance cookies persist in `.cache/hltv-import/browser-profile`. Headless is detected and hangs; `--headless` is opt-in only.
3. Serialize every HTTP and browser navigation through one queue, defaulting to 20 seconds between calls (`--delay-ms`). Use `45000` or `60000` for a long unattended run.
4. Prefer LAN (`--match-type lan`). `big-events`, `majors`, or `all` are opt-in.
5. Cache identities under `.cache/hltv-import/identities/` and mapped year stats under `.cache/hltv-import/stats/`. Existing files are reused unless `--force`. Ctrl+C and rerun; finished players are skipped. `--limit` is the next N *unfinished* fallback players, not the first N names.
6. Default scope is `fallback` rows only. Already verified seasons are left alone. `--include-verified` or `--verified-only` are opt-in comparison modes.
7. `--apply` promotes cached rows that meet the bar (default `--min-maps 10`; 2013–2015 → `partial`; 2016+ needs ADR, KAST, and impact → `full`) into `src/data/json/player-seasons.json`. Roles, `roleProvenance`, and accolades stay. Thin, incomplete, or ign-mismatched rows stay fallback. `--offline --apply` writes from cache with no network.

Without `--dry-run` the script talks to HLTV. A full fallback corpus is hundreds of identities and thousands of player-years. Check remaining work with `--dry-run`, then run slowly and rerun the same command until remaining is 0.

## HLTV stats headshot import

`npm run import:photos` is a separate headed-Chrome pass over the same year-filtered `/stats/players` pages the stats importer uses. HLTV serves a different official `playerbodyshot` for 2018 than for 2024; it is not a gallery thumbnail.

1. Reuse cached identities under `.cache/hltv-import/identities/`. Missing nicks are resolved from search JSON the same way as the stats importer. Do not fetch `/player/{id}`.
2. Load `https://www.hltv.org/stats/players/{hltvId}/{ign}?startDate={year}-01-01&endDate={year}-12-31&matchType=Lan` in the same persistent Chrome profile.
3. Read `img.player-summary-stat-box-left-bodyshot` (then the square context crop, then the older `.summaryBodyshot` / `.bodyshot-img` selectors). Skip HLTV placeholder silhouettes.
4. Cache the resolved URL under `.cache/hltv-import/photos/{hltvId}-{year}.json`. Existing files are reused unless `--force`. `--limit` is the next N unfinished player-years.
5. `--write` downloads the img-cdn bodyshot into `public/photos/players/{playerId}/{year}.png` and sets `photo` on every player-season for that year. `--offline --write` applies from cache only.

Without `--write` the script may still fetch missing stats pages so a stopped run can continue; it does not download images or rewrite JSON. The shipped app never hotlinks HLTV. Do not use event-gallery photos for player cards.

## Logo import workflow

`npm run import:logos -- --write` reuses the rendered pages already cached by the Major import, so it makes no extra wiki API calls.

1. Parse every `team-template-image-icon` span in `.cache/major-import/*.html.json` and key it by the same org id normalization the roster import uses. Parse each page's infobox image the same way, keyed by Major id from the cache filename.
2. Prefer the dark-mode variant, since the UI is dark; fall back to light mode.
3. Request a 128 px org thumbnail or a 256 px Major thumbnail, then the width the page rendered, then the original file. Only widths Liquipedia has already generated resolve, so the fallback chain matters.
4. Download at no more than one request per 1.1 s with the project User-Agent, writing `public/logos/{orgId}.{ext}` and `public/logos/majors/{majorId}.{ext}`. Existing files are skipped unless `--force`.
5. Rewrite `orgs.json` and `majors.json` so each downloaded row carries its `logo` path, then run `npm run validate-data`.

Without `--write` the script prints the resolved mapping and downloads nothing.

## Role taxonomy

HLTV does not publish a stable role field. Liquipedia TeamCard `p1`–`p5` is listing order, not IGL/AWP/entry/support/lurker, so it is only a weak prior.

| Role | Meaning in this game |
| --- | --- |
| `awp` | Primary or frequent sniper |
| `igl` | Called the game that season |
| `entry` | First contact, openings |
| `support` | Utility, trades, space |
| `lurker` | Late-round picks, opposite site |

`primaryRole` is the slot this player is remembered for. `roles` is every slot they can fill without going fully off-role (fit 1.0 / 0.9). Off-role (0.75) is always legal in the draft.

`roleProvenance.kind` records how that assignment was produced:

| Kind | Meaning |
| --- | --- |
| `teamcard-slot` | No career or stats signal; TeamCard order stands |
| `inferred` | Roster-aware pass: career AWP/IGL tags, optional cached Liquipedia infobox `Role`, `openingKpr` / impact / ADR, one IGL and typically one AWP per five |
| `curated` | Locked by `src/data/json/role-overrides.json`; later majors/HLTV imports must not overwrite it |

`npm run roles:infer` fills missing `openingKpr` from `.cache/hltv-import/stats` (fill-only; ratings stay), writes inferred roles, then applies overrides. Spot-check a few Majors, add override rows for misses, then `npm run roles:apply`. `--fetch-roles` optionally caches Liquipedia player-infobox Role under `.cache/player-roles/`; it is not required for the first pass and never hits HLTV `/player/{id}`.

## Legacy wildcards

SK Gaming 2003 and fnatic 2009 remain rare pre-Valve-Major cards with `kind: legacy`. At most one can replace a Major card in a draft. They retain curated `none`-regime ratings and are never attached to a synthetic Valve Major.

## Ratings (OVR)

The engine does not z-score a player against their four teammates. It z-scores HLTV rating against a documented elite LAN-pool mean/sd per rating version, then adds a trophy bonus capped at +5. Regime `none` uses `curated.ovr` only.

Constants and the mapping live in `src/engine/ratings/reference.ts`. After changing stats or the formula, run `npm run calibrate`. Retune the reference mean/sd if one era eats the leaderboard; do not special-case a player.

## Validation

`npm run validate-data` (also in CI) checks:

- Zod schema, including regime-consistency
- Unique ids; player-season id equals `{playerId}-{year}-{orgId}`
- One nationality per `playerId` (shared nicks such as AdreN/adreN and NiKo/niko are separate careers)
- 24 revision-pinned Majors and the declared played field size for each
- Every roster has exactly five unique existing player-seasons whose org, year, and game match
- No orphan player-seasons; coach `orgId`s resolve
- Every referenced org logo, Major logo, and player photo file exists
