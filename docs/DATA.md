# Data

The game never talks to HLTV (or any other live stats API). Everything draftable is committed JSON under `src/data/json/`.

## Files

| File | Contents |
| --- | --- |
| `src/data/json/orgs.json` | Organizations |
| `src/data/json/org-years.json` | Draftable cards: an org in a specific year, exactly five players |
| `src/data/json/player-seasons.json` | The draftable atom (`s1mple-2018`, not a career) |
| `src/data/json/coaches.json` | Coach cards for the sixth draft round |
| `src/data/schema.ts` | Zod contracts |
| `scripts/validate-data.ts` | Relational checks used in CI |

## Provenance

- **Rosters, placements, IGL notes:** [Liquipedia Counter-Strike](https://liquipedia.net/counterstrike) (CC-BY-SA). Attribute Liquipedia when those facts are shown in the UI.
- **Accolades:** HLTV Top 20 Players of the Year lists (2013–2025; 2010–2011 for 1.6; no 2012 list) plus Major MVPs.
- **Season stats:** HLTV player stats filtered to a calendar year, e.g. `https://www.hltv.org/stats/players?startDate=2018-01-01&endDate=2018-12-31`. Prefer the LAN / big-events filter when it exists.

The **seed set** (8 org-years, 40 player-seasons) uses rounded public figures from those Top 20 writeups and year-end recaps, not a full stats-page transcription. Treat the numbers as scaffolding for engines. Phase 10 replaces them with browser-session extracts.

There are no org logos or player photos in the dataset. The UI uses text crests and abstract art.

## Data regimes

| Regime | When | Required fields |
| --- | --- | --- |
| `full` | CS:GO 2016+ and CS2 | `stats.rating` plus ADR, KAST, impact |
| `partial` | CS:GO 2013–2015 (Rating 1.0) | `stats.rating`, kpr, dpr |
| `none` | 1.6 / Source, no usable rating | `curated.ovr`, `curated.attributes`, `curated.rationale` |

`dataRegime` is load-bearing: it picks the ratings path later and keeps the UI from showing fake ADR on a 2003 row.

## Transcription workflow (Phase 10)

Do this in a real browser. Cloudflare will time out or block a headless fetch.

1. Open the HLTV players stats page with `startDate` / `endDate` for one calendar year.
2. For each player-season already in `player-seasons.json` (and each new one), copy rating, rating version, KPR, DPR, ADR, KAST, impact, opening kills per round, clutch rate when shown.
3. Set `dataRegime` from the table above. Do not backfill ADR onto a 2014 row just to make it `full`.
4. Record Top 20 rank from that year's HLTV list. Record Major wins / MVPs for *that year*, not career totals.
5. Run `npm run validate-data`.
6. Leave a one-line `note` on the org-year if the roster rotated (stand-ins, rebrands).

Pause between years. The seed is meant to be resumable.

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

Every seed org-year must list all five roles somewhere in its five `roles` arrays so a pick is never forced off-role. That is a convenience for the seed, not a law of CS history — NiP 2013 had no dedicated AWPer; f0rest carries `awp` as a secondary because he sniped often enough.

## Seed org-years

| Card | Game | Regime |
| --- | --- | --- |
| SK Gaming 2003 | 1.6 | none |
| fnatic 2009 | 1.6 | none |
| Ninjas in Pyjamas 2013 | CS:GO | partial |
| fnatic 2015 | CS:GO | partial |
| SK / Luminosity 2016 | CS:GO | full |
| Astralis 2018 | CS:GO | full |
| Natus Vincere 2018 | CS:GO | full |
| FaZe Clan 2022 | CS:GO | full |

SK 2003 is the prize-money five (HeatoN, Potti, elemeNt, ahl, fisker). SpawN stood in at WCG 2003 and is not a sixth starter.

## Ratings (OVR)

The engine does not z-score a player against their four teammates. It z-scores HLTV rating against a documented elite LAN-pool mean/sd per rating version, then adds a trophy bonus capped at +5. Regime `none` uses `curated.ovr` only.

Constants and the mapping live in `src/engine/ratings/reference.ts`. After changing stats or the formula, run `npm run calibrate`. Retune the reference mean/sd if one era eats the leaderboard; do not special-case a player.

## Validation

`npm run validate-data` (also in CI) checks:

- Zod schema, including regime-consistency
- Unique ids; player-season id equals `{playerId}-{year}`
- Every org-year has exactly five existing player-seasons whose org, year, and game match
- Every org-year can fill all five roles from `roles` arrays
- No orphan player-seasons; coach `orgId`s resolve
