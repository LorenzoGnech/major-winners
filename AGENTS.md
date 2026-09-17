# Major Winners

A Counter-Strike legends draft game. Roll five historical Major team cards plus a coach, fill the role slots, then simulate a Major run and try to go 9-0.

## Stack

Astro (static) + React islands + Tailwind CSS v4 + TypeScript strict. The UI typeface is Stratum 2 when installed locally, with self-hosted Chakra Petch as the webfont. Tests are Vitest. Lint/format is Biome. Deploy is Cloudflare Workers static assets (`wrangler.jsonc`, `output: "static"`, no adapter) at `https://major.lorenzognech.workers.dev`.

No live HLTV (or other) network dependency. Player data is committed JSON under `src/data/`. A backend (Supabase) is deferred until community features.

## Layout

| Path | Role |
| --- | --- |
| `src/engine/` | Pure game logic: rng, ratings, draft, team, sim, tournament |
| `src/data/` | Committed JSON datasets, Zod schemas, and role inference |
| `src/components/` | React islands only |
| `src/pages/` | Astro routes |
| `src/layouts/` | Shared Astro chrome |
| `scripts/` | Dataset validation, calibration, sim harness |
| `docs/` | Data provenance (`DATA.md` from Phase 1) |

Path alias: `@/` maps to `src/`.

## Engine invariants

- Engine modules import neither React, React DOM, Astro, nor DOM APIs. UI is a thin renderer of engine output.
- All randomness flows through `src/engine/rng` (Mulberry32). `createRng` takes a uint32 or string (FNV-1a). `seedFromUtcDate` hashes the UTC `YYYY-MM-DD` day. A given seed must produce the same draft, coach order, and opponents. Match results match for the same seed, map pick, per-map game plans, and timeout timings.
- Prefer reducers and pure functions. Side effects (localStorage, fetch) live outside `src/engine/`.
- Invalid draft actions return `{ ok: false, error: DraftError }` and leave state unchanged. `startDraft` throws `DraftError` when the pool cannot supply five Major cards or a coach.

## Draft

Six rounds. Each of the first five rolls a distinct completed Valve Major, then samples one of its participating five-player rosters with integer tier weights: `legendary` 5, `strong` 3, `cult` 1 (`TIER_WEIGHTS`). A 5% roll may replace one Major with a pre-2013 Legacy wildcard. The sixth round picks one coach from five sampled from the full pool (`COACH_CANDIDATE_COUNT`).

- A draft has two Major rerolls and two team rerolls. The Major reroll keeps the current org and samples a different Major appearance of that org; the team reroll keeps the current event. A Major reroll is illegal (and the UI disables it) when that org has no other unused Major appearance. Both are legal only before the current player pick, exclude already shown cards, and derive from the root seed, round, action type, and which of the two uses.
- `RolledOrgYearCard` snapshots its Major/Legacy identity and five players. `applyAction` needs the committed dataset only for reroll actions.
- Completed state is five picks covering every role plus a coach.
- Player-round UI reveals each committed card with a majors reel, then a teams reel (`DraftRoll`). Both reels show imported Liquipedia logos (Major infobox image, org crest). The engine already chose the card; the animation is presentation-only. The live roster is hidden during the reel. After both reels lock, the result holds, then the pick board shows large team and Major crests beside the player cards and live roster. The team reroll sits under the org crest; the Major reroll sits under the event crest. Player cards are stacked rows: a year portrait (or initials) rail, nick, flag, primary/secondary role pills, year-LAN stats, and OVR. Statted cards show Rating, KPR, and DPR separately, plus ADR, KAST, and Impact when the season has them. Seasons without HLTV stats show Aim and Clutch instead. Each stat and OVR is colored independently on a red→green scale against the p10–p90 of committed Major-participant LAN seasons (Rating 1.0 and 2.0 use separate bands; DPR is inverted). That pool is the presentation reference, not teammates and not the elite OVR formula. Players are dragged onto the live roster slots; the pick is applied on drop with no confirm step. Keyboard users focus a card and press 1–5 for AWP through lurker. Restored Daily attempts skip the current card, `prefers-reduced-motion` skips it, a team reroll spins only the team reel, and a Major reroll spins only the majors reel. A Major reroll keeps the org crest on the team reel and withholds the new year and placement until that Major locks, so the event is not spoiled. Skip/continue is offered on the reveal.

## Roles

Starters: `awp`, `igl`, `entry`, `support`, `lurker`. Off-role placement is always allowed (fit `1.0` / `0.9` / `0.75`). A sixth draft round is the coach.

`primaryRole` is inferred per roster, not copied from Liquipedia TeamCard `p1`–`p5` listing order. That order is only a weak prior. HLTV does not publish a stable role field.

- `roleProvenance.kind` is `teamcard-slot` (no signal), `inferred` (career tags, optional Liquipedia infobox Role, opening/impact/ADR, uniqueness), or `curated`.
- Typical fives get one IGL and one primary AWP. Hand-locked rows live in `src/data/json/role-overrides.json` and always win.
- `npm run roles:infer` fills `openingKpr` from the HLTV cache when present, assigns inferred roles, then applies overrides. `npm run roles:apply` reapplies overrides only. Majors import and `hltv --apply` must not change curated roles or imported photos.

## Player strength

Each `PlayerSeason` carries `dataRegime`: `full` (CS:GO 2016+ / CS2 stats), `partial` (CS:GO 2013–2015 Rating 1.0), `none` (1.6 / Source accolade rubric), or `fallback` (Major participant without verified individual stats). OVR is relative to contemporaries, not raw HLTV rating.

Contemporaries means a **documented elite LAN-pool distribution per rating version** (`src/engine/ratings/reference.ts`), not the other four people on the same org-year card. Z-scoring inside a roster would punish IGLs.

- `full` / `partial`: z-score season rating against that reference, map to OVR, then add a **modest accolade bonus capped at +5**.
- `none`: use `curated.ovr` as-is. Do not add the accolade bonus again; the rubric already priced trophies.
- `fallback`: use a conservative placement-based curated OVR. `ratingProvenance.kind` makes estimates explicit; fallback OVR is capped below verified all-time peaks. Role may still be inferred or TeamCard-provisional independently of the rating path.
- Attributes (aim, entry, clutch, utility, consistency, igl) are what the sim consumes. Derived from stats when present; `curated.attributes` overlays. `igl` is role-driven unless curated.

`npm run calibrate` prints the top leaderboard and fails if s1mple-2018-navi, olofmeister-2015-fnatic, and heaton-2003-sk leave the top 15, if the top 10 is only CS:GO/CS2, or if fallback ratings crowd out verified legends.

## Team profile

`buildTeamProfile` is the pure boundary from a `CompletedDraft`, player-season metadata, rated players, and the selected coach into the profile consumed by simulation. It exposes the five component scores, aggregate fit-adjusted attributes, tactical coach scores, strengths/weaknesses, and overall team OVR.

- Base strength is the five-player average of `player OVR × assigned-role fit`.
- Chemistry starts at a neutral 50 and adds pair bonuses, capped at +32. Exact org-year teammate pairs add 4, any other pair that appeared together on a committed org-year roster adds 2.5, and same-nationality pairs add 2 (stacking with teammate bonuses). Centered contribution to overall OVR is weighted at 0.08, so an intact five helps without eclipsing individual quality.
- Communication blends a conservative nationality-to-language-family heuristic with the IGL-slot player's `igl` attribute (72% language / 28% IGL). Same-nationality pairs score 1.0, a documented family/English bridge scores 0.92, and unknown pairs retain a 0.68 international baseline. The coach contributes 10% of the language portion.
- Structure rewards primary and secondary role coverage, applies a strong penalty when the IGL-slot player has neither primary nor secondary IGL experience, and subtracts 6 points per redundant primary AWPer.
- Overall OVR starts at base strength and adds centered chemistry (`0.08`), communication (`0.05`), and structure (`0.12`) contributions. Coach modifiers add `0.25` OVR each while also shaping comeback resilience, economy discipline, and anti-strat scores.
- Coach cards store integer modifiers (−2 to +2) on comeback, economy, and antistrat. Import derives them from that coach's best roster placement: champion 4 points, finalist 3, top four 2, everyone else 1, distributed across the three axes (max 2 each) from a stable hash of the coach id so a last-place card still grants one bonus. Hand-tuned rows that do not match that formula are preserved. Coaching score is `50 + modifier-sum × 5`.

## Match simulation

`simulateSeries` is the batch helper under `src/engine/sim`. Live play uses `startLiveSeries` / `playRound` / `queueTimeout` / `startNextMap` / `skipRemaining`. A given seed plus the same map pick, per-map game plans, and timeout timings produce the same series. Map identity is competitive: the player picks one map (home bonus on that map only); remaining BO3 maps are a seed shuffle from the leftover pool. Aim maps weight rifling; tactical maps weight IGL and coach anti-strat.

- Before each map the player picks a game plan (`standard`, `rush`, `late-execute`, `pick-heavy`, `executes`, `anti-strat`, `contact`). Standard defaults is the no-op baseline and the default if the player confirms without changing it. Other plans shift fit-adjusted attributes plus anti-strat, economy discipline, pistol/early-round bias, and (for contact) starting morale. The opponent is not planned. A BO3 pauses after each map until `startNextMap`; skip plays leftover maps on Standard.

- Regulation is MR12: sides switch after 12 rounds, first to 13 wins, and 12-12 enters overtime. Overtime runs MR3 six-round blocks, swaps after three, and ends when a team wins four rounds in a block. Twelve tied blocks trigger one deterministic full-buy safety round.
- Team A round probability is `0.5 + overall delta × 0.006 + tactical side matchup × 0.001 + CT edge ±0.018 + equipment delta × 0.48`, plus pistol, trailing-team comeback, home-pick (`+0.03`), morale (`delta × 0.0012`), and a one-round timeout spike (`+0.04`), clamped to `0.12–0.88`. Equipment strength is full buy `1.0`, force `0.7`, pistol `0.48`, eco `0.28`, so an eco against rifles is about a 15–20% chance when the teams are even.
- Economy starts at `$800` each regulation half. Full/force/eco costs are rough abstractions; losses advance the `$1400–$3400` loss bonus, wins reset it, and coach economy discipline shifts buy thresholds. Overtime halves reset to `$10,000`. Playback shows two bars: this-round five-player equipment (pistol `$4000`, eco `$2500`, force `$11,000`, full buy `$22,500`) and leftover bank cash (the sim bank × 5). During a live round the bank is post-buy leftover; after the round settles it is `bankAfter`.
- Round winner is decided first. Kills are then an elimination sequence: losers always wipe, winners keep 1–5 alive, only living players can kill or assist, and kill order is the clock. Each player is assigned a weapon from that round's buy, side, and slot: full buys are AK/M4 (AUG/SG 553 uncommon), the AWP slot takes an AWP on most rifle rounds, and pistol/eco/force rounds use the matching pistol, SMG, and cheap-rifle pools. Negev and auto-snipers are vanishingly rare. Every round also stores a structured `summary` (eco steal, force convert, ace, clutch, 3k/4k, timeout payoff, pistol, overtime, clean sweep, or a site execute/hold). Site names are sampled from that map's named areas and are flavor, not a bombsite sim. Scoreboard ADR, KAST, and rating are rounded display estimates rather than extra simulation inputs. Rating is HLTV-style and centered on **1.00** for an average map (about 0.67 KPR/DPR, 75 ADR, 70% KAST); a typical board mixes sub-1.00 and 1.2+ rows instead of stacking everyone above 1.
- Morale starts from chemistry and coach comeback resilience, decays toward 50 each round, and moves on clutches (`+8` / `−6`) and a player timeout (`+10` next round). Timeouts are player-called, four per map, never automatic, and apply to the immediate next round.
- Highlights are seeded facts tied to generated rounds. A map stages at most three featured `clutch-sequence` 1vX windows, one in each early/mid/late stretch (rounds 1–8, 9–16, and 17+), and only for the player's side. Under that cap the sim offers a 1v5 / 1v4 / 1v3 / 1v2 at about 5% / 20% / 40% / 60% (rarest first; first hit wins), then generates that window so a player-round win is a converted clutch and a player-round loss is a denied one. Ordinary leftover 1vX endings and opponent clutches are not staged. BO3 stops immediately at two map wins. All randomness shares the supplied Mulberry32 stream; `rng.state` is serialized so a mid-match reload does not reroll played rounds.

## Match UI

`src/components/MatchPlayback.tsx` is the reusable React renderer for a live or completed series. It owns replay progress, the timeout button, a Settings menu (skip, restart, 1×/2×/4×), and accessibility announcements. Callers supply either a finished `SeriesResult` or a `LiveSeriesState` plus `onLiveChange`. During a Major run the draft live-roster sidebar is hidden. Playback is a three-column board: the drafted lineup on the left, score and play-by-play in the center over the map art, and the historical opponent on the right with its org logo. Two economy bars compare this-round equipment value and leftover bank. Play, Next, and Timeout stay on the board; skip, restart, and speed sit under Settings. Kill feed names stay team-colored (emerald for the player's side, amber for the opponent); the weapon icon is the committed silhouette under `public/weapons/` and inherits the killer's color (Glock and USP-S fall back to a generic pistol mark). A Cast box to the right of the killfeed speaks only notable beats: a pistol/eco/force buy, the opener, doubles through aces, and featured clutch lines. Ordinary trades stay in the killfeed. Replay advances one kill at a time at 1× (0.75s per event). A featured player 1vX takes over the board with a clutch-moment overlay (at most three times per map, spaced across the map): the clutching player's portrait, the remaining opponents (grey as they fall), and a center cast of the beats. Featured 1vX sequences slow the tick (`prefers-reduced-motion` skips the extra pause and the overlay motion). Lineup cards grey out for deaths revealed so far, but freeze at the clutch setup kill so later clutch deaths do not spoil the 1vX. A round-settle beat then updates the score and timeline, and the winning round count gives a soft expanding pulse (emerald for the player, amber for the opponent; `prefers-reduced-motion` keeps a static glow on that digit). The play-by-play feed shows only the current round, replacing it when the next round starts. Play/Next step one event, simulating the next round only when the cursor catches up; skip plays out remaining rounds with no further timeouts. The completed series shows one aggregate scoreboard (summed K/D/A, round-weighted ADR/KAST, rating from series totals), even in a BO3; map scores stay as a compact line. `TournamentRun` starts a live series after the map picker and a per-map game-plan card (`GamePlanPicker`, Standard selected). A BO3 asks again before map 2 and map 3. History is not appended until the player continues from the finished playback. While a match is in progress, it is not yet in history, so the Swiss/playoff board cannot spoil it. The completed-draft exhibition adapter remains a secondary standalone helper. The player-facing team name is chosen after a home-screen mode is selected, stored with Daily and Free Play persistence, and passed into playback as the first team label.

## Major tournament

`createTournament`, `beginNextMatch`, `commitLiveMatch`, and `runNextMatch` under `src/engine/tournament` form the pure tournament state machine. State is serialization-safe and carries the root seed, both Swiss records, playoff round, next-match metadata, optional in-progress `liveSeries`, and complete `SeriesResult` history. Invalid transitions return `TournamentError` results; all match and opponent seeds derive from the root seed.

- The deliberate fantasy format is Challengers Swiss, Legends Swiss, then Champions quarterfinal/semifinal/final. Three Swiss wins advance, three losses eliminate, and the perfect title path is exactly 9–0.
- Swiss matches are BO1 unless either team-facing record is on two wins or two losses; advancement and elimination matches are BO3. Every playoff match is BO3 and a playoff loss eliminates.
- `buildHistoricalOpponents` turns every Major/Legacy roster into a natural best-fit role assignment, labels it with its event, snapshots the org (including logo path when imported), and returns a stable strength-sorted index. It uses that roster's coach when available and deterministically selects a compatible fallback otherwise.
- Opponent choice is deterministic and uses each historical roster's `profile.overall` (the same team-strength score as the player's squad). Selection walks a rising percentile of that strength-sorted index: Challengers `0.14/0.28/0.42` by Swiss wins, Legends `0.55/0.65/0.75`, then Champions `0.84/0.92/0.98` by quarterfinal/semifinal/final. The next opponent is never weaker than the previous one when the unused pool allows; jitter only samples a small band above the target. Identical player rosters are excluded when alternatives exist, and immediate repeats are avoided whenever the pool permits.
- Free Play persists completed drafts, tournaments (including an in-progress live series), and the chosen team name under `major-winners:tournament:v2`. Custom Game is a Free Play start with a player-supplied seed: uint32 digits stay numeric, any other string is FNV-1a hashed, and the run then persists as Free Play.

## Daily challenge

The home screen is a centered brand mark (`public/logo.png`, also the favicon) with four actions: Today's Challenge, Free Play, Custom Game, and Stats. The team name is requested after a mode is chosen. Saved Daily and Free Play attempts resume immediately and keep their team name.

Today's Challenge uses the UTC day and `seedFromUtcDate`, making the draft, coach order, and opponents deterministic for identical choices. Match results are deterministic for the same map pick, per-map game plans, and timeout timings. Restarting uses the same daily seed; Free Play remains random unless started as a Custom Game.

- Pure identity, stats, streak, result, and spoiler-free share calculations live in `src/engine/daily/`.
- Daily attempts use `major-winners:daily-attempt:v2` (including the chosen team name); local stats use `major-winners:daily-stats:v1`. Rerolled cards and remaining budgets survive reloads. Both are separate from Free Play.
- One terminal result is counted per UTC day. Streaks use consecutive UTC completion days across calendar boundaries.
- Storage, clipboard, and native-share side effects stay in components. Defensive parsing and unavailable storage never block play.
- Static social metadata uses the generic `/social-card.svg`; no dynamic daily Open Graph image is claimed.

## Data conventions

- The draftable atom is a player-org-season (`s1mple-2018-navi`), not a career. This permits same-year transfers.
- `majors.json` contains 24 completed Valve Majors through Cologne 2026. `org-years.json` contains 511 teams that actually played plus two Legacy wildcards; replaced source cards are not game entities.
- Every roster appearance has exactly five starters, optional registered substitutes, placement, Major/Legacy identity, and source metadata. Placement is the start of the Liquipedia prize-pool range (3 for 3rd–4th, 5 for 5th–8th). Roles are inferred or curated; TeamCard order is not a role. Off-role placement is always available.
- `npm run import:majors -- --write` performs the one-time, rate-limited Liquipedia MediaWiki import and caches source revisions under ignored `.cache/`. The shipped app has no runtime network dependency.
- `npm run import:hltv` resolves player ids from HLTV search JSON, then scrapes year-filtered `/stats/players` pages in headed Chrome. Calls are serialized at a 20s default gap into ignored `.cache/hltv-import/`. Cache hits are skipped, so a stopped run can be rerun. `--apply` promotes complete fallback rows into committed `player-seasons.json`; verified rows are never overwritten, and curated roles and imported photos are never changed.
- Org logos are committed files under `public/logos/{orgId}.png`, referenced by the `org.logo` path. Major logos are committed under `public/logos/majors/{majorId}.{ext}`, referenced by `major.logo`. `npm run import:logos -- --write` reparses the cached rendered Major pages, prefers each team's dark-mode team-template icon and each event's dark-mode infobox image, downloads them rate-limited, and rewrites `orgs.json` and `majors.json`. Logos are third-party marks, not part of the CC BY-SA roster data. An org or Major without a logo falls back to a generated initials crest.
- Optional map art lives under `public/maps/{mapId}.{jpg|png}`. The pool is Mirage, Dust II, Inferno, Nuke, Ancient, Anubis, Overpass, Cache, and Cobblestone. The picker and match board both use each map's committed `background` path. Missing files fall back to the tinted match board.
- Killfeed weapon silhouettes live under `public/weapons/`. Filenames follow the weapon id except M4A1-S (`m4a1.png`), SSG 08 (`ssg.png`), SG 553 (`sg_553.png`), sawed-off (`saw.png`), and auto-sniper (`auto.png`). Glock and USP-S have no file and use a generic pistol mark.
- Player-year portraits are committed under `public/photos/players/{playerId}/{year}.{ext}`, referenced by optional `playerSeason.photo`. `npm run import:photos` reuses cached HLTV identities and headed Chrome, then opens the same year-filtered `/stats/players` URL as the stats importer and reads `img.player-summary-stat-box-left-bodyshot` (`img-cdn.hltv.org/playerbodyshot/…`). That asset is year-specific. Resolved URLs are cached under `.cache/hltv-import/photos/`. `--write` downloads the file and rewrites `player-seasons.json`. Two org appearances in the same year share one file. A season without a portrait keeps the initials crest. Majors import and `hltv --apply` must not strip photos.
- JSON lives in `src/data/json/` under the separate `DATA-LICENSE.md` terms. Contracts live in `src/data/schema.ts`. Provenance and the transcription workflow live in `docs/DATA.md`.
- `npm run validate-data` must stay green. It enforces regime consistency, 24 revision-pinned Majors, each played field size, five unique starters, relational integrity, and that every referenced logo or player photo file exists.

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
npm run import:logos
npm run import:hltv -- --dry-run
npm run import:hltv -- --delay-ms 45000 --apply
npm run import:photos -- --dry-run
npm run import:photos -- --write
npm run roles:infer
npm run roles:apply
npm run calibrate
npm run sim:harness
```
