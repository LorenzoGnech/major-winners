# Data

The game never talks to HLTV (or any other live stats API). Everything draftable is committed JSON under `src/data/json/`.

## Files

| File | Contents |
| --- | --- |
| `src/data/json/majors.json` | 24 completed Valve Majors through IEM Cologne 2026 |
| `src/data/json/orgs.json` | Organizations |
| `src/data/json/org-years.json` | 511 played Major roster appearances plus two Legacy wildcards |
| `src/data/json/player-seasons.json` | Player-org-seasons (`s1mple-2018-navi`, not a career) |
| `src/data/json/coaches.json` | Coach cards for the sixth draft round |
| `src/data/schema.ts` | Zod contracts |
| `scripts/validate-data.ts` | Relational checks used in CI |

## Provenance

- **Majors, rosters, placements:** revision-pinned [Liquipedia Counter-Strike](https://liquipedia.net/counterstrike) pages (CC BY-SA 3.0 US), imported through the supported MediaWiki API with the required User-Agent and rate limits. The adapted committed dataset is distributed under [`DATA-LICENSE.md`](../DATA-LICENSE.md).
- **Accolades:** HLTV Top 20 Players of the Year lists (2013–2025; 2010–2011 for 1.6; no 2012 list) plus Major MVPs.
- **Season stats:** HLTV player stats filtered to a calendar year, e.g. `https://www.hltv.org/stats/players?startDate=2018-01-01&endDate=2018-12-31`. Prefer the LAN / big-events filter when it exists.

The complete roster corpus contains every team that actually played at the 24 Valve Majors completed from DreamHack Winter 2013 through IEM Cologne 2026. Replaced source cards are omitted during normalization rather than represented in game logic. Boston 2018 therefore has 23 played teams; 2018–2024 otherwise have 24, and the 2025–2026 fields have 32.

There are no org logos or player photos in the dataset. The UI uses text crests and abstract art.

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
3. Parse the five players who actually played, coach, registered non-playing substitutes, and final placement. Replaced source cards and non-team placeholders are discarded before field-size validation.
4. Preserve already verified player ratings. Generate an explicit `fallback` row for every remaining player-org-season.
5. Require 24 revision-pinned Majors and exactly 511 played roster appearances before writing.
6. Run `npm run validate-data`, `npm run calibrate`, and the full test suite.

HLTV remains manual-only for individual stat transcription and dispute resolution; it is never scraped by this script or accessed by the app.

## Role taxonomy

Roles are curated. HLTV does not publish a stable role field, and 1.6 AWP-share data does not exist.

| Role | Meaning in this game |
| --- | --- |
| `awp` | Primary or frequent sniper |
| `igl` | Called the game that season |
| `entry` | First contact, openings |
| `support` | Utility, trades, space |
| `lurker` | Late-round picks, opposite site |

`primaryRole` is the slot this player is remembered for. `roles` is every slot they can fill without going fully off-role (fit 1.0 / 0.9). Off-role (0.75) is always legal in the draft.

Verified rows keep curated roles. Fallback rows use TeamCard order as a transparent provisional role assignment so every imported roster is immediately playable. Off-role drafting remains legal, so correcting roles later is a data improvement rather than a schema migration.

## Legacy wildcards

SK Gaming 2003 and fnatic 2009 remain rare pre-Valve-Major cards with `kind: legacy`. At most one can replace a Major card in a draft. They retain curated `none`-regime ratings and are never attached to a synthetic Valve Major.

## Ratings (OVR)

The engine does not z-score a player against their four teammates. It z-scores HLTV rating against a documented elite LAN-pool mean/sd per rating version, then adds a trophy bonus capped at +5. Regime `none` uses `curated.ovr` only.

Constants and the mapping live in `src/engine/ratings/reference.ts`. After changing stats or the formula, run `npm run calibrate`. Retune the reference mean/sd if one era eats the leaderboard; do not special-case a player.

## Validation

`npm run validate-data` (also in CI) checks:

- Zod schema, including regime-consistency
- Unique ids; player-season id equals `{playerId}-{year}-{orgId}`
- 24 revision-pinned Majors and the declared played field size for each
- Every roster has exactly five unique existing player-seasons whose org, year, and game match
- No orphan player-seasons; coach `orgId`s resolve
