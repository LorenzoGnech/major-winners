# Major Winners

A Counter-Strike legends draft game. Roll five historical Major team cards plus a coach, fill the role slots, then simulate a Major run and try to go 9-0.

## Stack

Astro (static) + React islands + Tailwind CSS v4 + TypeScript strict. Tests are Vitest. Lint/format is Biome. Deploy is Vercel static via `@astrojs/vercel` with `output: "static"`.

No live HLTV (or other) network dependency. Player data is committed JSON under `src/data/`. A backend (Supabase) is deferred until community features.

## Layout

| Path | Role |
| --- | --- |
| `src/engine/` | Pure game logic: rng, ratings, draft, team, sim, tournament |
| `src/data/` | Committed JSON datasets and Zod schemas |
| `src/components/` | React islands only |
| `src/pages/` | Astro routes |
| `src/layouts/` | Shared Astro chrome |
| `scripts/` | Dataset validation, calibration, sim harness |
| `docs/` | Data provenance (`DATA.md` from Phase 1) |

Path alias: `@/` maps to `src/`.

## Engine invariants

- Engine modules import neither React, React DOM, Astro, nor DOM APIs. UI is a thin renderer of engine output.
- All randomness flows through `src/engine/rng` (Mulberry32). `createRng` takes a uint32 or string (FNV-1a). `seedFromUtcDate` hashes the UTC `YYYY-MM-DD` day. A given seed must produce the same draft, matches, and tournament.
- Prefer reducers and pure functions. Side effects (localStorage, fetch) live outside `src/engine/`.
- Invalid draft actions return `{ ok: false, error: DraftError }` and leave state unchanged. `startDraft` throws `DraftError` when the pool cannot supply five Major cards or a coach.

## Draft

Six rounds. Each of the first five rolls a distinct completed Valve Major, then samples one of its participating five-player rosters with integer tier weights: `legendary` 5, `strong` 3, `cult` 1 (`TIER_WEIGHTS`). A 5% roll may replace one Major with a pre-2013 Legacy wildcard. The sixth round picks one coach from the full coach pool.

- A draft has one Major reroll and one team reroll. The Major reroll replaces the current event and team; the team reroll keeps the current event. Both are legal only before the current player pick, exclude already shown cards, and derive from the root seed, round, and action type.
- `RolledOrgYearCard` snapshots its Major/Legacy identity and five players. `applyAction` needs the committed dataset only for reroll actions.
- Completed state is five picks covering every role plus a coach.

## Roles

Starters: `awp`, `igl`, `entry`, `support`, `lurker`. Off-role placement is always allowed (fit `1.0` / `0.9` / `0.75`). A sixth draft round is the coach.

## Player strength

Each `PlayerSeason` carries `dataRegime`: `full` (CS:GO 2016+ / CS2 stats), `partial` (CS:GO 2013–2015 Rating 1.0), `none` (1.6 / Source accolade rubric), or `fallback` (Major participant without verified individual stats). OVR is relative to contemporaries, not raw HLTV rating.

Contemporaries means a **documented elite LAN-pool distribution per rating version** (`src/engine/ratings/reference.ts`), not the other four people on the same org-year card. Z-scoring inside a roster would punish IGLs.

- `full` / `partial`: z-score season rating against that reference, map to OVR, then add a **modest accolade bonus capped at +5**.
- `none`: use `curated.ovr` as-is. Do not add the accolade bonus again; the rubric already priced trophies.
- `fallback`: use a conservative placement-based curated OVR and provisional TeamCard-order role. `ratingProvenance.kind` makes estimates explicit; fallback OVR is capped below verified all-time peaks.
- Attributes (aim, entry, clutch, utility, consistency, igl) are what the sim consumes. Derived from stats when present; `curated.attributes` overlays. `igl` is role-driven unless curated.

`npm run calibrate` prints the top leaderboard and fails if s1mple-2018-navi, olofmeister-2015-fnatic, and heaton-2003-sk leave the top 15, if the top 10 is only CS:GO/CS2, or if fallback ratings crowd out verified legends.

## Team profile

`buildTeamProfile` is the pure boundary from a `CompletedDraft`, player-season metadata, rated players, and the selected coach into the profile consumed by simulation. It exposes the five component scores, aggregate fit-adjusted attributes, tactical coach scores, strengths/weaknesses, and overall team OVR.

- Base strength is the five-player average of `player OVR × assigned-role fit`.
- Chemistry counts exact org-year teammate pairs. Each pair adds 4 to a neutral 50 score, capped at +32; its centered contribution to overall OVR is weighted at 0.08, so an intact five helps without eclipsing individual quality.
- Communication uses a conservative static nationality-to-language-family heuristic. Same-nationality pairs score 1.0, a documented family/English bridge scores 0.92, and unknown pairs retain a 0.68 international baseline. The coach contributes only 10% of this component.
- Structure rewards primary and secondary role coverage, applies a strong penalty when the IGL-slot player has neither primary nor secondary IGL experience, and subtracts 6 points per redundant primary AWPer.
- Overall OVR starts at base strength and adds centered chemistry (`0.08`), communication (`0.05`), and structure (`0.12`) contributions. Coach modifiers add only `0.25` OVR each while also shaping comeback resilience, economy discipline, and anti-strat scores.

## Match simulation

`simulateSeries` is the pure deterministic boundary under `src/engine/sim`. It takes two `TeamProfile`s, a stable seed, `BO1`/`BO3`, and optional opaque `mapContext`; it returns every round, economy snapshot, scoreboard row, highlight, and map/series result. Map metadata has no competitive effect yet, so the maps phase can extend the context without changing this contract.

- Regulation is MR12: sides switch after 12 rounds, first to 13 wins, and 12-12 enters overtime. Overtime runs MR3 six-round blocks, swaps after three, and ends when a team wins four rounds in a block. Twelve tied blocks trigger one deterministic full-buy safety round.
- Team A round probability is `0.5 + overall delta × 0.006 + tactical side matchup × 0.001 + CT edge ±0.018 + equipment delta × 0.15`, plus small pistol and trailing-team comeback terms, clamped to `0.16–0.84`.
- Economy starts at `$800` each regulation half. Full/force/eco costs are rough abstractions; losses advance the `$1400–$3400` loss bonus, wins reset it, and coach economy discipline shifts buy thresholds. Overtime halves reset to `$10,000`.
- Kills are generated from actual rounds and weighted by fit-adjusted player aim, entry, clutch, and role. Every kill has an opposing death; scoreboard ADR, KAST-like participation, and rating are rounded display estimates rather than extra simulation inputs.
- Highlights are seeded facts tied to generated rounds and known player/coach IDs. BO3 stops immediately at two map wins. All randomness shares the supplied Mulberry32 stream.

## Match UI

`src/components/MatchPlayback.tsx` is the reusable React renderer for a completed `SeriesResult`. It owns replay progress, skip controls, and accessibility announcements but performs no simulation; callers supply the result and two display labels. `TournamentRun` orchestrates one completed match at a time and keeps simulation outside playback. The completed-draft exhibition adapter remains a secondary standalone helper.

## Major tournament

`createTournament` and `runNextMatch` under `src/engine/tournament` form the pure tournament state machine. State is serialization-safe and carries the root seed, both Swiss records, playoff round, next-match metadata, and complete `SeriesResult` history. Invalid transitions return `TournamentError` results; all match and opponent seeds derive from the root seed.

- The deliberate fantasy format is Challengers Swiss, Legends Swiss, then Champions quarterfinal/semifinal/final. Three Swiss wins advance, three losses eliminate, and the perfect title path is exactly 9–0.
- Swiss matches are BO1 unless either team-facing record is on two wins or two losses; advancement and elimination matches are BO3. Every playoff match is BO3 and a playoff loss eliminates.
- `buildHistoricalOpponents` turns every Major/Legacy roster into a natural best-fit role assignment, labels it with its event, and returns a stable strength-sorted index. It uses that roster's coach when available and deterministically selects a compatible fallback otherwise.
- Opponent choice is deterministic, generally rises with stage and record, excludes an identical player roster when alternatives exist, and avoids immediate repeats whenever the pool permits.
- Free Play persists completed drafts and tournaments under `major-winners:tournament:v2`.

## Daily challenge

Today's Challenge uses the UTC day and `seedFromUtcDate`, making the draft, coach order, opponents, and results deterministic for identical choices. Restarting uses the same daily seed; Free Play remains random.

- Pure identity, stats, streak, result, and spoiler-free share calculations live in `src/engine/daily/`.
- Daily attempts use `major-winners:daily-attempt:v2`; local stats use `major-winners:daily-stats:v1`. Rerolled cards and remaining budgets survive reloads. Both are separate from Free Play.
- One terminal result is counted per UTC day. Streaks use consecutive UTC completion days across calendar boundaries.
- Storage, clipboard, and native-share side effects stay in components. Defensive parsing and unavailable storage never block play.
- Static social metadata uses the generic `/social-card.svg`; no dynamic daily Open Graph image is claimed.

## Data conventions

- The draftable atom is a player-org-season (`s1mple-2018-navi`), not a career. This permits same-year transfers.
- `majors.json` contains 24 completed Valve Majors through Cologne 2026. `org-years.json` contains 511 teams that actually played plus two Legacy wildcards; replaced source cards are not game entities.
- Every roster appearance has exactly five starters, optional registered substitutes, placement, Major/Legacy identity, and source metadata. Roles may be provisional; off-role placement is always available.
- `npm run import:majors -- --write` performs the one-time, rate-limited Liquipedia MediaWiki import and caches source revisions under ignored `.cache/`. The shipped app has no runtime network dependency.
- No org logos or player photos. Text crests and abstract art only.
- JSON lives in `src/data/json/`. Contracts live in `src/data/schema.ts`. Provenance and the transcription workflow live in `docs/DATA.md`.
- `npm run validate-data` must stay green. It enforces regime consistency, 24 revision-pinned Majors, each played field size, five unique starters, and relational integrity.

## Commands

```
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
npm run check
npm run validate-data
npm run import:majors -- --offline
npm run calibrate
npm run sim:harness
```
