# Major Winners

A Counter-Strike legends draft game. Roll six org-year cards, fill five role slots plus a coach, then simulate a Major run and try to go 9-0.

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
- Invalid draft actions return `{ ok: false, error: DraftError }` and leave state unchanged. `startDraft` throws `DraftError` when the pool cannot supply five org-year cards or a coach.

## Draft

Six rounds. The first five reveal **distinct** org-year cards sampled without replacement with integer tier weights: `legendary` 5, `strong` 3, `cult` 1 (`TIER_WEIGHTS`). Each player pick takes one of that card's five player-seasons and assigns it to an empty role slot. The sixth round picks one coach from the **full** coach pool (order shuffled on the same RNG stream after the five cards). Completed state is five picks covering every role plus a coach.

## Roles

Starters: `awp`, `igl`, `entry`, `support`, `lurker`. Off-role placement is always allowed (fit `1.0` / `0.9` / `0.75`). A sixth draft round is the coach.

## Player strength

Each `PlayerSeason` carries `dataRegime`: `full` (CS:GO 2016+ / CS2 stats), `partial` (CS:GO 2013–2015 Rating 1.0), or `none` (1.6 / Source, accolade rubric). OVR is relative to contemporaries, not raw HLTV rating.

Contemporaries means a **documented elite LAN-pool distribution per rating version** (`src/engine/ratings/reference.ts`), not the other four people on the same org-year card. Z-scoring inside a roster would punish IGLs.

- `full` / `partial`: z-score season rating against that reference, map to OVR, then add a **modest accolade bonus capped at +5**.
- `none`: use `curated.ovr` as-is. Do not add the accolade bonus again; the rubric already priced trophies.
- Attributes (aim, entry, clutch, utility, consistency, igl) are what the sim consumes. Derived from stats when present; `curated.attributes` overlays. `igl` is role-driven unless curated.

`npm run calibrate` prints the leaderboard and fails if s1mple-2018, olofmeister-2015, and heaton-2003 leave the top 15, or if the top 10 is only CS:GO.

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

## Data conventions

- The draftable atom is a player-season (`s1mple-2018`), not a career.
- An org-year has exactly five players.
- Roles are curated. Stats are transcribed once from HLTV in a browser session; never scraped at runtime.
- No org logos or player photos. Text crests and abstract art only.
- JSON lives in `src/data/json/`. Contracts live in `src/data/schema.ts`. Provenance and the transcription workflow live in `docs/DATA.md`.
- `npm run validate-data` must stay green. It enforces regime-consistency, five-man org-years, and fillable roles.

## Commands

```
npm run dev
npm run build
npm test
npm run lint
npm run typecheck
npm run check
npm run validate-data
npm run calibrate
npm run sim:harness
```
