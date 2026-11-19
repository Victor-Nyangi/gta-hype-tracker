# GTA VI Hype Tracker

A fan-made, single-page "hype tracker" for the Grand Theft Auto VI launch (19 Nov 2026,
PS5 and Xbox Series X|S). It shows how loudly the internet is watching: Twitch viewers in
the GTA VI category, trailer view counts on YouTube, Wikipedia page views by language, and
what everyone else is still playing on Steam.

Most of those APIs only ever return the *current* value, so history has to be recorded as
it happens. That is why the repo has two halves: a small always-on **collector** that
samples the sources on a schedule and keeps every raw response, and the **web** page that
reads a derived `signals.json`.

## Layout

```
collector/   Python 3.13 service: sample sources -> raw snapshots -> DuckDB + signals.json
deploy/      compose file for the collector + a tiny static server for signals.json
web/         Next.js (App Router) site
design/      the design handoff: README (spec), PROMPT, screenshots, reference prototype
```

## Collector

```sh
cd collector
uv sync
uv run pytest              # parsers, raw writer, derive, runner
uv run ruff check .
set -a; . ../deploy/.env; set +a   # optional: keys; sources without them are skipped
uv run collector run       # long-running scheduler (5 min / hourly / daily jobs)
uv run collector derive    # rebuild DuckDB tables + public/signals.json from raw
uv run collector backfill  # one-off Wikipedia daily pageviews since 2022-02-01
uv run collector schema    # re-export schema/signals.schema.json
```

Data lands in `DATA_DIR` (default `./data`):

```
raw/<source>/date=YYYY-MM-DD/HHMMSS.json   immutable snapshots, never overwritten
signals.duckdb                             derived analysis tables
public/signals.json                        what the page reads
```

Configuration lives in `deploy/.env.example` (copy to `deploy/.env`). See `collector/README.md`
for the sources and `deploy/README.md` for running it on the box.

## Web

```sh
cd web
pnpm install
pnpm dev                   # http://localhost:3000
pnpm build && pnpm start   # production build
pnpm lint && pnpm typecheck
```

The page currently uses typed mock adapters in `web/lib/data/`; the `Signals` type mirrors
`collector/schema/signals.schema.json`.

## Design reference

`design/README.md` is the spec. To look at the prototype: `npx serve design/reference` and
open `GTA VI Hype Tracker.dc.html`. The hero, trailer and cover images are embedded in
`.image-slots.state.json`; only the mesh-headline fill (`../assets/gta-full-wide.png`) is
missing when served that way (the asset lives in `web/public/assets/`).

## Not affiliated

Fan-made. Not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two
Interactive. Grand Theft Auto and all related marks and key art belong to their owners. The
site does not use the Rockstar logo.

## License

Code is MIT (see `LICENSE`). The key art and screenshots in `web/public/assets` and
`design/` are not covered by that licence.
