# collector

Samples the GTA VI launch signals on a schedule, keeps every raw response, and derives
`public/signals.json` for the site.

| Source | Every | Endpoint | Credentials |
|---|---|---|---|
| `twitch` | 5 min | Helix `/streams?game_id=`, every page, GTA VI and GTA V | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| `steam` | 5 min | `GetNumberOfCurrentPlayers` for 7 apps | none |
| `youtube` | hourly | `videos?part=statistics` for the trailers | `YOUTUBE_API_KEY` |
| `wikipedia` | 6 h (00/06/12/18 UTC) | Pageviews per-article, 30 editions, trailing 10 days | none |
| `steam_reviews` | 6 h (03/09/15/21 UTC) | Store `appreviewhistogram/<appid>` for the same 7 apps | none |

Plus one input that is not fetched: `src/collector/curated/official_figures.json`, a short
hand-maintained list of Take-Two-reported figures (see "Business" below).

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
  signals.duckdb       twitch_snapshots, twitch_by_language, steam_players, youtube_stats, wiki_daily,
                       steam_reviews
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
- **Wikipedia pageviews are published late**: a day's numbers appear some hours after it
  ends in UTC. Every run (`WIKI_EVERY_HOURS`, default 6, anchored on `WIKI_AT_HOUR_UTC`)
  re-fetches the last 10 days into a new raw file; derive keeps the latest fetch per
  (edition, day). Until the launch day is published, `since_launch_pending` is true (per
  edition and overall) and the since-launch ints are 0 meaning "not published yet".
- **Wikipedia titles** come from the Wikidata item's sitelinks (item id from the English
  article's `pageprops`), cached for a week. `WIKI_LANGS=all` takes every edition.
- **Steam 24h peak** is the max of every reading in the 24 h before `generated_at`.
  `peak_24h_since` is the oldest reading in that window and `peak_24h_partial` is true when
  it starts more than 15 minutes late (tracking began, or resumed, inside the window): the
  peak is then of a shorter window, and right after tracking starts it is often simply the
  first reading.
- **Steam** also samples GTA V Enhanced (3240220): since March 2025 GTA V's Steam players
  are split between Legacy (271590) and Enhanced.

## Business

`signals.json` has an optional `business` block (added after schema v1; an older payload
without it is still valid, and the site hides the section when it is missing):

- **`business.steam_reviews`**: per game `total_reviews` (with `positive`/`negative`),
  `new_reviews_7d` (Steam's own daily counts for the 7 complete UTC days before the read),
  `change_7d` (against the newest reading at least 7 days older; null until the tracker has
  one), and an **estimated-sales range** `estimated_sales_low`..`estimated_sales_high` =
  reviews x 30 .. x 55. That is the "Boxleiter method"; the multiples are where two
  published ranges overlap (Jake Birkett 2018, 30x-150x for indie games; Karl Kontus / VG
  Insights 2021, 20x-55x for 2020+ releases), cited in `sources/steam_reviews.py` and in
  `method` in the payload. It is a rough estimate, never one number, and it is skipped for
  CS2 (free to play) and GTA V Enhanced (a free upgrade), with `no_estimate_reason` saying so.
  The histogram returns the full history on every call, so there is nothing to backfill.
- **`business.official`**: the curated file as is, each figure with `value` (and
  `value_max` for a range), the source's own `qualifier` ("nearly"/"over"), `unit`,
  `as_of`, `source_url` and a short `quote`. Every number must come from a Take-Two page
  that was actually read; edit the file, bump its `updated_at`, and the next derive picks it
  up (`OFFICIAL_FIGURES_PATH` points at another copy if you want to edit it on the box
  without a rebuild). A malformed file is logged and left out; it never stops derive.

Tried and not used (2026-11-20):

- **Share prices**: Stooq's keyless CSV (`stooq.com/q/d/l/?s=ttwo.us&i=d`) now answers an
  automated client with a JavaScript proof-of-work bot check instead of CSV, and Nasdaq's
  own quote-history endpoint resets the connection for a non-browser client. Neither is
  worked around, so there is no stock series yet.
- **Steam `appreviews/<appid>?json=1`** (`query_summary.total_reviews`): every request was
  redirected (302) to the store's front page, so the histogram endpoint is used instead.
- **SEC EDGAR**: its fair-access policy requires a contact email in the User-Agent; the
  official figures were read from Take-Two's investor-relations pages instead.

Cadence: `STEAM_REVIEWS_EVERY_HOURS` (default 6, must divide 24) and
`STEAM_REVIEWS_AT_HOUR_UTC` (default 3).

## Develop

```sh
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run collector schema    # after changing signals.py; a test fails if the file is stale
```
