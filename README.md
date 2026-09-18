# Major Winners

A deterministic Counter-Strike legends draft game. Roll five historical Major team cards,
fill the AWP, IGL, entry, support, and lurker slots, choose a coach, then attempt a perfect
9–0 fantasy Major run.

The static dataset covers all 24 completed Valve Majors from DreamHack Winter 2013 through
IEM Cologne 2026: 511 teams that played, plus two rare pre-Major Legacy cards. Each draft
includes two Major rerolls and two same-event team rerolls.

## Development

```sh
npm install
npm run dev
```

Useful checks:

```sh
npm run check
npm test
npm run lint
npm run validate-data
npm run roles:infer
npm run calibrate
npm run sim:harness
```

Rebuild the committed Major dataset from the local source cache:

```sh
npm run import:majors -- --offline --write
```

See [`AGENTS.md`](AGENTS.md) for architecture and game invariants and
[`docs/DATA.md`](docs/DATA.md) for provenance and import details.

Production is [major.lorenzognech.workers.dev](https://major.lorenzognech.workers.dev/). The site is static Cloudflare Workers assets (`wrangler.jsonc`, output `dist/`). Build with `npm run build`; Cloudflare should use Node 22, build command `npm run build`, and deploy from `dist`.

## Licensing

Source code is marked MIT in `package.json`. The committed Liquipedia-derived data under
`src/data/json/` is separately covered by [`DATA-LICENSE.md`](DATA-LICENSE.md).

