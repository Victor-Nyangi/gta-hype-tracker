"""Derive: raw snapshots -> DuckDB analysis tables -> ``public/signals.json``.

Ingest is incremental: ``raw_files`` remembers every snapshot already loaded (keyed by its
path without a ``.gz`` suffix, so compaction does not cause a reload). ``rebuild=True``
drops everything and reloads the whole raw history, which is how a parsing change is
applied retroactively. Raw is the source of truth; the database is disposable.

All timestamps in DuckDB are naive UTC.
"""

from __future__ import annotations

import itertools
import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import duckdb

from collector import rawstore
from collector.config import LAUNCH_AT, Config
from collector.signals import (
    BusinessSignals,
    OfficialFigures,
    SalesEstimateMethod,
    Signals,
    SteamGame,
    SteamPoint,
    SteamReviewGame,
    SteamReviewSignals,
    SteamSignals,
    TwitchGameSummary,
    TwitchHourPoint,
    TwitchLanguage,
    TwitchSignals,
    TwitchStream,
    WikiEdition,
    WikipediaSignals,
    YouTubeSignals,
    YouTubeVideo,
)
from collector.sources import steam, steam_reviews, twitch, wikipedia, youtube

log = logging.getLogger(__name__)

TABLES = (
    "raw_files",
    "twitch_snapshots",
    "twitch_by_language",
    "steam_players",
    "youtube_stats",
    "wiki_daily",
    "steam_reviews",
)

SOURCES = ("twitch", "steam", "youtube", "wikipedia", "steam_reviews")

DDL = """
CREATE TABLE IF NOT EXISTS raw_files (
    key VARCHAR PRIMARY KEY, source VARCHAR, fetched_at TIMESTAMP, ingested_at TIMESTAMP);
CREATE TABLE IF NOT EXISTS twitch_snapshots (
    fetched_at TIMESTAMP, game_key VARCHAR, game_id VARCHAR, game_name VARCHAR,
    total_viewers BIGINT, stream_count INTEGER, pages INTEGER, truncated BOOLEAN,
    top_streams JSON, PRIMARY KEY (fetched_at, game_key));
CREATE TABLE IF NOT EXISTS twitch_by_language (
    fetched_at TIMESTAMP, game_key VARCHAR, language VARCHAR, viewers BIGINT, streams INTEGER,
    PRIMARY KEY (fetched_at, game_key, language));
CREATE TABLE IF NOT EXISTS steam_players (
    fetched_at TIMESTAMP, app_id INTEGER, game_key VARCHAR, name VARCHAR, player_count INTEGER,
    PRIMARY KEY (fetched_at, app_id));
CREATE TABLE IF NOT EXISTS youtube_stats (
    fetched_at TIMESTAMP, video_id VARCHAR, label VARCHAR, views BIGINT, likes BIGINT,
    comments BIGINT, PRIMARY KEY (fetched_at, video_id));
CREATE TABLE IF NOT EXISTS wiki_daily (
    project VARCHAR, lang VARCHAR, title VARCHAR, day DATE, views BIGINT, fetched_at TIMESTAMP,
    PRIMARY KEY (project, day));
CREATE TABLE IF NOT EXISTS steam_reviews (
    fetched_at TIMESTAMP, app_id INTEGER, game_key VARCHAR, name VARCHAR, positive BIGINT,
    negative BIGINT, new_last_7d BIGINT, PRIMARY KEY (fetched_at, app_id));
"""

HOURS_WATCHED_MAX_GAP = timedelta(minutes=15)
# A Steam 24h window whose oldest reading is later than this after its start is partial.
STEAM_WINDOW_TOLERANCE = timedelta(minutes=15)


@dataclass
class DeriveResult:
    ingested: dict[str, int]
    signals_path: Path
    signals: Signals


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(tzinfo=None)


def _aware(dt: datetime | None) -> datetime | None:
    return None if dt is None else dt.replace(tzinfo=UTC)


def _hour(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


# --- ingest ----------------------------------------------------------------------------


# (table, column types, primary-key width). Rows are buffered per table and inserted with
# one columnar ``unnest`` per table: DuckDB's executemany costs milliseconds per row.
COLUMNS: dict[str, tuple[tuple[str, ...], int]] = {
    "raw_files": (("VARCHAR", "VARCHAR", "TIMESTAMP", "TIMESTAMP"), 1),
    "twitch_snapshots": (
        (
            "TIMESTAMP",
            "VARCHAR",
            "VARCHAR",
            "VARCHAR",
            "BIGINT",
            "INTEGER",
            "INTEGER",
            "BOOLEAN",
            "JSON",
        ),
        2,
    ),
    "twitch_by_language": (("TIMESTAMP", "VARCHAR", "VARCHAR", "BIGINT", "INTEGER"), 3),
    "steam_players": (("TIMESTAMP", "INTEGER", "VARCHAR", "VARCHAR", "INTEGER"), 2),
    "youtube_stats": (("TIMESTAMP", "VARCHAR", "VARCHAR", "BIGINT", "BIGINT", "BIGINT"), 2),
    # wiki_daily is keyed (project, day), which sit at positions 0 and 3.
    "wiki_daily": (("VARCHAR", "VARCHAR", "VARCHAR", "DATE", "BIGINT", "TIMESTAMP"), 0),
    "steam_reviews": (
        ("TIMESTAMP", "INTEGER", "VARCHAR", "VARCHAR", "BIGINT", "BIGINT", "BIGINT"),
        2,
    ),
}


class _Buffer:
    def __init__(self) -> None:
        self.rows: dict[str, dict[tuple, list]] = {t: {} for t in COLUMNS}

    def add(self, table: str, row: list) -> None:
        width = COLUMNS[table][1]
        if table == "wiki_daily":
            # One row per (edition, day): the most recent fetch wins, it has the settled number.
            key = (row[0], row[3])
            prev = self.rows[table].get(key)
            if prev is not None and prev[5] > row[5]:
                return
        else:
            key = tuple(row[:width])
        self.rows[table][key] = row  # later rows (later files) win

    def flush(self, con: duckdb.DuckDBPyConnection) -> None:
        for table, rows in self.rows.items():
            if not rows:
                continue
            types = COLUMNS[table][0]
            cols = [list(c) for c in zip(*rows.values(), strict=True)]
            select = ", ".join(f"unnest(${i + 1}::{t}[])" for i, t in enumerate(types))
            if table == "wiki_daily":
                # A later fetch of the same day wins (it carries the settled number); an older
                # one, e.g. a backfill file ingested after newer reads, never overwrites it.
                sql = (
                    f"INSERT INTO wiki_daily SELECT {select} ON CONFLICT (project, day) DO UPDATE"
                    " SET lang = excluded.lang, title = excluded.title, views = excluded.views,"
                    " fetched_at = excluded.fetched_at"
                    " WHERE excluded.fetched_at >= wiki_daily.fetched_at"
                )
            else:
                sql = f"INSERT OR REPLACE INTO {table} SELECT {select}"
            con.execute(sql, cols)


def _rows_for(doc: rawstore.RawDoc) -> list[tuple[str, list]]:
    t = _naive(doc.fetched_at)
    out: list[tuple[str, list]] = []
    if doc.source == "twitch":
        for s in twitch.parse(doc.payload):
            top = json.dumps([asdict(x) for x in s.top_streams])
            out.append(
                (
                    "twitch_snapshots",
                    [
                        t,
                        s.game_key,
                        s.game_id,
                        s.game_name,
                        s.total_viewers,
                        s.stream_count,
                        s.pages,
                        s.truncated,
                        top,
                    ],
                )
            )
            out.extend(
                ("twitch_by_language", [t, s.game_key, lang, c.viewers, c.streams])
                for lang, c in s.by_language.items()
            )
    elif doc.source == "steam":
        out.extend(
            ("steam_players", [t, r.app_id, r.key, r.name, r.player_count])
            for r in steam.parse(doc.payload)
        )
    elif doc.source == "youtube":
        out.extend(
            ("youtube_stats", [t, v.video_id, v.label, v.views, v.likes, v.comments])
            for v in youtube.parse(doc.payload)
        )
    elif doc.source == "wikipedia":
        out.extend(
            ("wiki_daily", [d.project, d.lang, d.title, d.day, d.views, t])
            for d in wikipedia.parse(doc.payload)
        )
    elif doc.source == "steam_reviews":
        day = doc.fetched_at.astimezone(UTC).date()
        out.extend(
            (
                "steam_reviews",
                [t, r.app_id, r.key, r.name, r.positive, r.negative, r.new_last_7d],
            )
            for r in steam_reviews.parse(doc.payload, day)
        )
    return out


def ingest(con: duckdb.DuckDBPyConnection, raw_dir: Path) -> dict[str, int]:
    """Load every raw snapshot not seen before. A snapshot that fails to parse is logged and
    left out (and retried next time); it never blocks the rest."""
    known = {k for (k,) in con.execute("SELECT key FROM raw_files").fetchall()}
    counts: dict[str, int] = {}
    buf = _Buffer()
    now = _naive(datetime.now(UTC))
    for source in SOURCES:
        for p in rawstore.iter_raw_paths(raw_dir, source):
            key = str(p.relative_to(raw_dir)).removesuffix(".gz")
            if key in known:
                continue
            try:
                doc = rawstore.read_raw(p)
                rows = _rows_for(doc)
            except Exception:
                log.exception("derive: could not parse %s; skipped", key)
                continue
            for table, row in rows:
                buf.add(table, row)
            buf.add("raw_files", [key, source, _naive(doc.fetched_at), now])
            counts[source] = counts.get(source, 0) + 1
    con.execute("BEGIN")
    try:
        buf.flush(con)
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    return counts


# --- build signals ---------------------------------------------------------------------


def _twitch(con: duckdb.DuckDBPyConnection) -> TwitchSignals | None:
    rows = con.execute(
        "SELECT fetched_at, total_viewers, stream_count, truncated, top_streams, game_id, game_name"
        " FROM twitch_snapshots WHERE game_key = 'gta6' ORDER BY fetched_at"
    ).fetchall()
    if not rows:
        return None
    first, last = rows[0], rows[-1]
    peak = max(rows, key=lambda r: (r[1], -r[0].timestamp()))

    watched = 0.0
    for (t1, v1, *_), (t2, v2, *_) in itertools.pairwise(rows):
        dt = t2 - t1
        if dt <= HOURS_WATCHED_MAX_GAP:
            watched += (v1 + v2) / 2 * dt.total_seconds() / 3600

    launch = _naive(LAUNCH_AT)
    hourly = [
        TwitchHourPoint(
            hour=_aware(h),
            hours_from_launch=int((h - launch).total_seconds() // 3600),
            avg_viewers=round(avg),
            max_viewers=mx,
            samples=n,
        )
        for h, avg, mx, n in con.execute(
            "SELECT date_trunc('hour', fetched_at) h, avg(total_viewers), max(total_viewers),"
            " count(*) FROM twitch_snapshots WHERE game_key = 'gta6' GROUP BY h ORDER BY h"
        ).fetchall()
    ]

    total = max(last[1], 1)
    langs = [
        TwitchLanguage(language=lang, viewers=v, streams=s, share=round(v / total, 4))
        for lang, v, s in con.execute(
            "SELECT language, viewers, streams FROM twitch_by_language"
            " WHERE game_key = 'gta6' AND fetched_at = ? ORDER BY viewers DESC, language",
            [last[0]],
        ).fetchall()
    ]

    comparison = []
    for key, gid, name, _t, v, n in con.execute(
        """SELECT game_key, arg_max(game_id, fetched_at), arg_max(game_name, fetched_at),
                  max(fetched_at), arg_max(total_viewers, fetched_at),
                  arg_max(stream_count, fetched_at)
           FROM twitch_snapshots WHERE game_key <> 'gta6' GROUP BY game_key ORDER BY game_key"""
    ).fetchall():
        pk, pk_at = con.execute(
            "SELECT total_viewers, fetched_at FROM twitch_snapshots WHERE game_key = ?"
            " ORDER BY total_viewers DESC, fetched_at LIMIT 1",
            [key],
        ).fetchone()
        comparison.append(
            TwitchGameSummary(
                key=key,
                game_id=gid,
                name=name,
                current_viewers=v,
                current_streams=n,
                peak_viewers=pk,
                peak_at=_aware(pk_at),
            )
        )

    return TwitchSignals(
        game_id=last[5],
        game_name=last[6],
        tracking_since=_aware(first[0]),
        updated_at=_aware(last[0]),
        current_viewers=last[1],
        current_streams=last[2],
        current_truncated=bool(last[3]),
        peak_viewers=peak[1],
        peak_at=_aware(peak[0]),
        hours_watched=round(watched),
        hourly=hourly,
        by_language=langs,
        top_streams=[TwitchStream(**s) for s in json.loads(last[4])],
        comparison=comparison,
    )


def _steam(con: duckdb.DuckDBPyConnection, now: datetime) -> SteamSignals | None:
    span = con.execute("SELECT min(fetched_at), max(fetched_at) FROM steam_players").fetchone()
    if span is None or span[0] is None:
        return None
    now_n = _naive(now)
    end_hour = _hour(now_n)
    hours = [end_hour - timedelta(hours=24 - i) for i in range(25)]
    known = {g.app_id: g for g in steam.GAMES}
    extra = [
        steam.SteamGame(k, a, n)
        for a, k, n in con.execute(
            "SELECT app_id, arg_max(game_key, fetched_at), arg_max(name, fetched_at)"
            " FROM steam_players GROUP BY app_id ORDER BY app_id"
        ).fetchall()
        if a not in known
    ]
    games = []
    for g in [*steam.GAMES, *extra]:
        cur = con.execute(
            "SELECT player_count, fetched_at FROM steam_players WHERE app_id = ?"
            " ORDER BY fetched_at DESC LIMIT 1",
            [g.app_id],
        ).fetchone()
        if cur is None:
            continue
        pk = con.execute(
            "SELECT player_count, fetched_at FROM steam_players"
            " WHERE app_id = ? AND player_count IS NOT NULL"
            " ORDER BY player_count DESC, fetched_at LIMIT 1",
            [g.app_id],
        ).fetchone()
        # The 24h peak is the max over every reading in (now - 24h, now]; the earliest
        # reading in that window says how much of the 24 hours it really covers.
        window_start = now_n - timedelta(hours=24)
        pk24, pk24_at, since = con.execute(
            "SELECT max(player_count), arg_min(fetched_at, (-player_count, fetched_at)),"
            " min(fetched_at) FROM steam_players"
            " WHERE app_id = ? AND player_count IS NOT NULL AND fetched_at > ? AND fetched_at <= ?",
            [g.app_id, window_start, now_n],
        ).fetchone()
        partial = since is None or since - window_start > STEAM_WINDOW_TOLERANCE
        buckets = dict(
            con.execute(
                "SELECT date_trunc('hour', fetched_at) h, avg(player_count) FROM steam_players"
                " WHERE app_id = ? AND fetched_at >= ? AND fetched_at < ? GROUP BY h",
                [g.app_id, hours[0], end_hour + timedelta(hours=1)],
            ).fetchall()
        )
        series = [
            SteamPoint(
                hour=_aware(h), players=None if buckets.get(h) is None else round(buckets[h])
            )
            for h in hours
        ]
        games.append(
            SteamGame(
                key=g.key,
                app_id=g.app_id,
                name=g.name,
                current_players=cur[0],
                current_at=_aware(cur[1]),
                peak_24h=pk24,
                peak_24h_at=_aware(pk24_at),
                peak_24h_since=_aware(since),
                peak_24h_partial=partial,
                observed_peak=pk[0] if pk else None,
                observed_peak_at=_aware(pk[1]) if pk else None,
                series_24h=series,
            )
        )
    return SteamSignals(tracking_since=_aware(span[0]), updated_at=_aware(span[1]), games=games)


def _youtube(con: duckdb.DuckDBPyConnection) -> YouTubeSignals | None:
    rows = con.execute(
        """SELECT video_id, arg_max(label, fetched_at), arg_max(views, fetched_at),
                  arg_max(likes, fetched_at), arg_max(comments, fetched_at), max(fetched_at)
           FROM youtube_stats GROUP BY video_id ORDER BY min(fetched_at), video_id"""
    ).fetchall()
    if not rows:
        return None
    videos = [
        YouTubeVideo(video_id=v, label=lb, views=n, likes=lk, comments=c, fetched_at=_aware(t))
        for v, lb, n, lk, c, t in rows
    ]
    videos.sort(key=lambda v: v.label)
    return YouTubeSignals(
        updated_at=max(v.fetched_at for v in videos),
        total_views=sum(v.views for v in videos),
        videos=videos,
    )


def _wikipedia(con: duckdb.DuckDBPyConnection, item_id: str | None) -> WikipediaSignals | None:
    span = con.execute("SELECT max(day), max(fetched_at) FROM wiki_daily").fetchone()
    if span is None or span[0] is None:
        return None
    window_end: date = span[0]
    window_start = window_end - timedelta(days=6)
    launch_day = LAUNCH_AT.date()
    rows = con.execute(
        """SELECT project, arg_max(lang, fetched_at), arg_max(title, fetched_at),
                  coalesce(sum(views) FILTER (WHERE day BETWEEN ? AND ?), 0),
                  sum(views) FILTER (WHERE day >= ?),
                  max(day)
           FROM wiki_daily GROUP BY project""",
        [window_start, window_end, launch_day],
    ).fetchall()
    # A NULL since-launch sum means no day from launch_day on is in the table for that
    # edition: Wikimedia has not published it yet (or that edition's fetch failed). The
    # contract keeps the field an int, so it is 0 with since_launch_pending set.
    editions = sorted(
        (
            WikiEdition(
                lang=lang,
                project=p,
                title=t,
                views_last_7d=int(w),
                views_since_launch=int(s or 0),
                latest_day=d,
                since_launch_pending=s is None,
            )
            for p, lang, t, w, s, d in rows
        ),
        key=lambda e: (-e.views_last_7d, e.lang),
    )
    return WikipediaSignals(
        updated_at=_aware(span[1]),
        item_id=item_id,
        window_end=window_end,
        total_last_7d=sum(e.views_last_7d for e in editions),
        total_since_launch=sum(e.views_since_launch for e in editions),
        editions=editions,
        launch_day=launch_day,
        since_launch_pending=window_end < launch_day,
    )


def _wiki_item_id(cfg: Config) -> str | None:
    try:
        return json.loads((cfg.cache_dir / "wiki_titles.json").read_text())["item_id"]
    except (OSError, KeyError, ValueError):
        return None


REVIEW_CHANGE_WINDOW = timedelta(days=7)


def _steam_reviews(con: duckdb.DuckDBPyConnection) -> SteamReviewSignals | None:
    span = con.execute("SELECT min(fetched_at), max(fetched_at) FROM steam_reviews").fetchone()
    if span is None or span[0] is None:
        return None
    order = {g.app_id: i for i, g in enumerate(steam.GAMES)}
    latest = con.execute(
        """SELECT app_id, arg_max(game_key, fetched_at), arg_max(name, fetched_at),
                  arg_max(positive, fetched_at), arg_max(negative, fetched_at),
                  arg_max(new_last_7d, fetched_at), max(fetched_at)
           FROM steam_reviews GROUP BY app_id"""
    ).fetchall()
    games = []
    for app_id, key, name, pos, neg, new7, at in sorted(
        latest, key=lambda r: (order.get(r[0], len(order)), r[0])
    ):
        total = pos + neg
        # The latest reading at least 7 days before this one: the 7-day change needs history.
        prior = con.execute(
            "SELECT positive + negative, fetched_at FROM steam_reviews"
            " WHERE app_id = ? AND fetched_at <= ? ORDER BY fetched_at DESC LIMIT 1",
            [app_id, at - REVIEW_CHANGE_WINDOW],
        ).fetchone()
        est = steam_reviews.estimate_range(total, app_id)
        games.append(
            SteamReviewGame(
                key=key,
                app_id=app_id,
                name=name,
                total_reviews=total,
                positive=pos,
                negative=neg,
                fetched_at=_aware(at),
                new_reviews_7d=new7,
                change_7d=None if prior is None else total - prior[0],
                change_7d_since=None if prior is None else _aware(prior[1]),
                estimated_sales_low=est[0] if est else None,
                estimated_sales_high=est[1] if est else None,
                no_estimate_reason=steam_reviews.NO_ESTIMATE.get(app_id),
            )
        )
    return SteamReviewSignals(
        tracking_since=_aware(span[0]),
        updated_at=_aware(span[1]),
        method=SalesEstimateMethod(
            name=steam_reviews.METHOD_NAME,
            multiplier_low=steam_reviews.ESTIMATE_LOW,
            multiplier_high=steam_reviews.ESTIMATE_HIGH,
            sources=list(steam_reviews.METHOD_SOURCES),
        ),
        games=games,
    )


def _official(cfg: Config) -> OfficialFigures | None:
    """The curated Take-Two figures. A missing or malformed file is logged and left out: it
    never stops the rest of signals.json."""
    try:
        return OfficialFigures.model_validate_json(cfg.official_figures_path.read_bytes())
    except Exception as e:
        log.error("derive: official figures unavailable (%s); left out", type(e).__name__)
        return None


def _business(con: duckdb.DuckDBPyConnection, cfg: Config) -> BusinessSignals | None:
    reviews, official = _steam_reviews(con), _official(cfg)
    if reviews is None and official is None:
        return None
    return BusinessSignals(steam_reviews=reviews, official=official)


def build_signals(con: duckdb.DuckDBPyConnection, cfg: Config, now: datetime) -> Signals:
    return Signals(
        generated_at=now.astimezone(UTC),
        launch_at=LAUNCH_AT,
        twitch=_twitch(con),
        steam=_steam(con, now),
        youtube=_youtube(con),
        wikipedia=_wikipedia(con, _wiki_item_id(cfg)),
        business=_business(con, cfg),
    )


def write_signals(path: Path, signals: Signals) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(signals.model_dump_json(indent=None))
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)  # signals.json is derived, replacing it is the point
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def derive(cfg: Config, now: datetime | None = None, rebuild: bool = False) -> DeriveResult:
    now = now or datetime.now(UTC)
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(cfg.db_path))
    try:
        if rebuild:
            for t in TABLES:
                con.execute(f"DROP TABLE IF EXISTS {t}")
        con.execute(DDL)
        counts = ingest(con, cfg.raw_dir)
        signals = build_signals(con, cfg, now)
    finally:
        con.close()
    out = cfg.public_dir / "signals.json"
    write_signals(out, signals)
    return DeriveResult(ingested=counts, signals_path=out, signals=signals)
