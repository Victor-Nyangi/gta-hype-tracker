# collector

Samples the GTA VI launch signals on a schedule, keeps every raw response, and derives
`public/signals.json` for the site.

| Source | Every | Endpoint | Credentials |
|---|---|---|---|
| `twitch` | 5 min | Helix `/streams?game_id=`, every page, GTA VI and GTA V | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| `steam` | 5 min | `GetNumberOfCurrentPlayers` for 7 apps | none |
| `youtube` | hourly | `videos?part=statistics` for the trailers | `YOUTUBE_API_KEY` |
| `wikipedia` | daily 06:00 UTC | Pageviews per-article, 30 editions, trailing 10 days | none |

Every job also runs once at startup. After each 5-minute cycle, `derive` loads new raw
files into DuckDB and rewrites `signals.json`. A failing source logs one line and the loop
carries on; a source without credentials logs one "skipped" line, once.

## Run locally

```sh
uv sync
set -a; . ../deploy/.env; set +a    # or export only what you need
DATA_DIR=./data COLLECTOR_SOURCES=steam,wikipedia uv run collector run
```

Commands: `run`, `once` (every job once, then derive), `derive [--rebuild]`,
`backfill [--start YYYY-MM-DD] [--end YYYY-MM-DD]` (Wikipedia only), `schema`.

## Data

```
DATA_DIR/
  raw/<source>/date=YYYY-MM-DD/HHMMSS.json[.gz]   {fetched_at, source, request, payload}
  cache/twitch_games.json, cache/wiki_titles.json
  signals.duckdb       twitch_snapshots, twitch_by_language, steam_players, youtube_stats, wiki_daily
  public/signals.json  the contract: src/collector/signals.py -> schema/signals.schema.json
```

Raw files are written to a temp name and hard-linked into place, so they are never
overwritten or seen half-written. Days before today are gzipped by the daily `compact` job.
The database is disposable: `derive --rebuild` recreates it from raw.

## Notes on the sources

- **Twitch game id**: looked up once with `GET /helix/games?name=Grand Theft Auto VI` and
  cached; set `TWITCH_GAME_ID` to skip the lookup. GTA V is the fixed id `32982`.
- **Paging**: a poll follows the cursor to the last page, so every stream is counted. It
  is paced by Helix's `Ratelimit-Remaining` / `Ratelimit-Reset` headers (app token, 800
  points a minute, one per page) and waits for the reset when fewer than 10 points remain;
  a 429 waits and retries the same cursor. A snapshot is marked `truncated` (with
  `truncated_reason` in the raw payload) only if it stops early: the safety cap
  `TWITCH_MAX_PAGES` (default 1000 pages, 100k streams), the poll's time budget
  `TWITCH_TIME_BUDGET_S` (default 210 s, so it ends inside its 5-minute slot), a rate limit
  that would not reset inside that budget, or a page that still fails after one retry.
- **Hours watched** is an estimate: the trapezoid integral of total viewers between
  snapshots, ignoring gaps longer than 15 minutes, since `tracking_since`.
- **YouTube ids** default to Rockstar's uploads `QdBZY2fkU-0` (Trailer 1) and `VQRLujxTm3c`
  (Trailer 2), confirmed via YouTube oEmbed. The key never reaches the raw store or logs.
- **Wikipedia titles** come from the Wikidata item's sitelinks (item id from the English
  article's `pageprops`), cached for a week. `WIKI_LANGS=all` takes every edition.
- **Steam** also samples GTA V Enhanced (3240220): since March 2025 GTA V's Steam players
  are split between Legacy (271590) and Enhanced.

## Develop

```sh
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run collector schema    # after changing signals.py; a test fails if the file is stale
```
