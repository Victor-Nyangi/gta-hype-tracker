from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import duckdb
import pytest
from conftest import load

from collector import rawstore
from collector.config import Config
from collector.derive import derive
from collector.signals import Signals, json_schema
from collector.sources import twitch

NOW = datetime(2026, 11, 20, 12, 2, tzinfo=UTC)
SCHEMA_FILE = Path(__file__).resolve().parents[1] / "schema" / "signals.schema.json"


def _twitch_payload(scale: float) -> dict:
    pages = [load("twitch_streams_gta6_page1.json"), load("twitch_streams_gta6_page2.json")]
    for p in pages:
        for s in p["data"]:
            s["viewer_count"] = round(s["viewer_count"] * scale)
    return {
        "games": {
            "gta6": {
                "game_id": "123456789",
                "game_name": "Grand Theft Auto VI",
                "pages": pages,
                "truncated": False,
            },
            "gtav": {
                "game_id": "32982",
                "game_name": "Grand Theft Auto V",
                "pages": [load("twitch_streams_gtav.json")],
                "truncated": False,
            },
        }
    }


def _steam_payload(i: int) -> dict:
    apps = {}
    for app in (271590, 1174180, 730, 1091500, 1245620, 1086940, 3240220):
        body = copy.deepcopy(load("steam_1086940.json"))
        body["response"]["player_count"] = 1000 + app % 997 + i
        apps[str(app)] = {"status": 200, "body": body}
    return {"apps": apps}


def _wiki_payload(en_override: int | None = None) -> dict:
    en = load("wiki_pageviews_en.json")
    if en_override is not None:
        en["items"][-1]["views"] = en_override
    return {
        "item_id": "Q23648408",
        "editions": {
            "en": {"title": "Grand Theft Auto VI", "status": 200, "body": en},
            "ja": {
                "title": "グランド・セフト・オートVI",
                "status": 200,
                "body": load("wiki_pageviews_ja.json"),
            },
            "sah": {
                "title": "Grand Theft Auto VI",
                "status": 404,
                "body": load("wiki_pageviews_404.json"),
            },
        },
    }


@pytest.fixture
def populated(cfg: Config, monkeypatch: pytest.MonkeyPatch) -> Config:
    monkeypatch.setattr(rawstore.os, "fsync", lambda fd: None)  # 420 files; speed only
    raw = cfg.raw_dir
    # Twitch: every 5 min from 06:00 to 08:00, then a 40 min outage, then 08:40 to 09:00.
    t = datetime(2026, 11, 20, 6, 0, tzinfo=UTC)
    times = [t + timedelta(minutes=5 * i) for i in range(25)]
    times += [
        datetime(2026, 11, 20, 8, 40, tzinfo=UTC) + timedelta(minutes=5 * i) for i in range(5)
    ]
    for i, ts in enumerate(times):
        rawstore.write_raw(raw, "twitch", ts, {}, _twitch_payload(1 + i / 10))
    # Steam: every 5 min for the last 30 hours.
    for i in range(30 * 12):
        rawstore.write_raw(raw, "steam", NOW - timedelta(minutes=5 * i), {}, _steam_payload(i))
    # YouTube: two hourly reads.
    yt = {
        "labels": {"QdBZY2fkU-0": "Trailer 1", "VQRLujxTm3c": "Trailer 2"},
        "body": load("youtube_videos.json"),
    }
    rawstore.write_raw(raw, "youtube", NOW - timedelta(hours=2), {}, yt)
    yt2 = copy.deepcopy(yt)
    yt2["body"]["items"][0]["statistics"]["viewCount"] = "271500000"
    rawstore.write_raw(raw, "youtube", NOW - timedelta(hours=1), {}, yt2)
    # Wikipedia: a daily read, then a later one with a settled number for the last day.
    rawstore.write_raw(raw, "wikipedia", NOW - timedelta(days=1), {}, _wiki_payload())
    rawstore.write_raw(raw, "wikipedia", NOW - timedelta(hours=6), {}, _wiki_payload(600000))
    return cfg


def test_derive_writes_schema_valid_signals(populated: Config):
    res = derive(populated, now=NOW)
    assert res.ingested == {"twitch": 30, "steam": 360, "youtube": 2, "wikipedia": 2}
    text = res.signals_path.read_text()
    s = Signals.model_validate_json(text)  # round-trips through the contract
    body = json.loads(text)
    assert set(body) == {
        "schema_version",
        "generated_at",
        "launch_at",
        "twitch",
        "steam",
        "youtube",
        "wikipedia",
    }
    assert body["launch_at"] == "2026-11-19T05:00:00Z"

    tw = s.twitch
    assert tw is not None
    assert tw.tracking_since == datetime(2026, 11, 20, 6, 0, tzinfo=UTC)
    assert tw.updated_at == datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
    assert tw.peak_viewers == tw.current_viewers  # scale rises monotonically
    assert [h.hours_from_launch for h in tw.hourly] == [25, 26, 27, 28]
    assert sum(h.samples for h in tw.hourly) == 30
    assert tw.by_language[0].language == "en"
    assert abs(sum(lang.share for lang in tw.by_language) - 1) < 0.01
    assert len(tw.top_streams) == 10
    assert tw.comparison[0].key == "gtav" and tw.comparison[0].current_viewers == 25100
    # hours watched skips the 40-minute outage: only 24 + 4 five-minute intervals count
    totals = [twitch.parse(_twitch_payload(1 + i / 10))[0].total_viewers for i in range(30)]
    expected = sum(
        (totals[i] + totals[i + 1]) / 2 * (5 / 60) for i in list(range(24)) + list(range(25, 29))
    )
    assert tw.hours_watched == pytest.approx(expected, rel=0.001)

    st = s.steam
    assert st is not None and len(st.games) == 7
    for g in st.games:
        assert len(g.series_24h) == 25
        assert g.series_24h[-1].hour == datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
        assert g.series_24h[0].hour == datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
        assert all(p.players is not None for p in g.series_24h)
        assert g.current_at == NOW
        assert g.observed_peak >= g.peak_24h >= g.current_players
        assert g.peak_24h_partial is False  # 30 h of readings cover the whole window
        assert g.peak_24h_since == NOW - timedelta(hours=23, minutes=55)
    assert st.games[0].key == "gtav"

    yt = s.youtube
    assert yt is not None
    assert [v.label for v in yt.videos] == ["Trailer 1", "Trailer 2"]
    assert yt.videos[0].views == 271500000  # latest read wins
    assert yt.total_views == 271500000 + 164882095

    wk = s.wikipedia
    assert wk is not None
    assert [e.lang for e in wk.editions] == ["en", "ja"]
    en = wk.editions[0]
    en_items = load("wiki_pageviews_en.json")["items"]
    last7 = [i["views"] for i in en_items][-7:]
    last7[-1] = 600000  # the later, settled read replaced the last day
    assert en.views_last_7d == sum(last7)
    assert str(wk.window_end) == "2026-11-18"
    # The fixture ends the day before launch: since-launch is pending, not a real zero.
    assert str(wk.launch_day) == "2026-11-19"
    assert wk.since_launch_pending is True
    assert all(e.since_launch_pending for e in wk.editions)
    assert en.views_since_launch == 0 and wk.total_since_launch == 0  # legacy ints stay ints
    assert wk.total_last_7d == sum(e.views_last_7d for e in wk.editions)


def test_derive_is_incremental_and_rebuild_matches(populated: Config):
    first = derive(populated, now=NOW)
    second = derive(populated, now=NOW)
    assert second.ingested == {}
    assert second.signals == first.signals
    rebuilt = derive(populated, now=NOW, rebuild=True)
    assert rebuilt.ingested == first.ingested
    assert rebuilt.signals == first.signals


def test_derive_survives_compaction(populated: Config):
    first = derive(populated, now=NOW)
    assert rawstore.compact_before(populated.raw_dir, NOW.date()) > 0
    assert derive(populated, now=NOW).ingested == {}
    assert derive(populated, now=NOW, rebuild=True).signals == first.signals


def test_derive_with_no_data(cfg: Config):
    s = derive(cfg, now=NOW).signals
    assert s.twitch is None and s.steam is None and s.youtube is None and s.wikipedia is None


def test_steam_series_has_nulls_for_hours_without_data(cfg: Config):
    rawstore.write_raw(cfg.raw_dir, "steam", NOW - timedelta(minutes=1), {}, _steam_payload(0))
    g = derive(cfg, now=NOW).signals.steam.games[0]
    assert len(g.series_24h) == 25
    assert [p.players is None for p in g.series_24h] == [True] * 24 + [False]


def test_exported_schema_is_current():
    assert json.loads(SCHEMA_FILE.read_text()) == json_schema(), (
        "schema/signals.schema.json is stale: run `uv run collector schema`"
    )


def _steam_counts(counts: dict[int, int | None]) -> dict:
    apps = {}
    for app, n in counts.items():
        body = copy.deepcopy(load("steam_1086940.json"))
        if n is None:
            body["response"] = {"result": 42}
        else:
            body["response"]["player_count"] = n
        apps[str(app)] = {"status": 200, "body": body}
    return {"apps": apps}


def test_steam_peak_24h_is_the_max_over_the_window_not_the_first_reading(cfg: Config):
    cs2, gtav = 730, 271590
    # Readings over the last 30 h. cs2 peaks mid-window; gtav's biggest reading is 26 h old
    # (outside the window), and its in-window peak is a tie, so the earliest one counts.
    readings = [
        (NOW - timedelta(hours=26), {cs2: 2_000_000, gtav: 99_000}),
        (NOW - timedelta(hours=23, minutes=55), {cs2: 900_000, gtav: 40_000}),
        (NOW - timedelta(hours=14), {cs2: 1_400_000, gtav: 70_000}),
        (NOW - timedelta(hours=9), {cs2: 1_550_000, gtav: 70_000}),
        (NOW - timedelta(hours=8), {cs2: None, gtav: 50_000}),
        (NOW - timedelta(minutes=3), {cs2: 600_000, gtav: 45_000}),
    ]
    for ts, counts in readings:
        rawstore.write_raw(cfg.raw_dir, "steam", ts, {}, _steam_counts(counts))
    games = {g.key: g for g in derive(cfg, now=NOW).signals.steam.games}

    c = games["cs2"]
    assert c.peak_24h == 1_550_000  # neither the first reading nor the latest
    assert c.peak_24h_at == NOW - timedelta(hours=9)
    assert c.current_players == 600_000
    assert c.observed_peak == 2_000_000  # all-time still sees the 26 h old reading
    assert c.peak_24h_since == NOW - timedelta(hours=23, minutes=55)
    assert c.peak_24h_partial is False  # oldest in-window reading is 5 min after the start

    g = games["gtav"]
    assert g.peak_24h == 70_000
    assert g.peak_24h_at == NOW - timedelta(hours=14)


def test_steam_peak_24h_is_marked_partial_when_tracking_is_younger_than_24h(cfg: Config):
    # Tracking began 13.5 h ago at the evening high, then the count fell and recovered.
    start = NOW - timedelta(hours=13, minutes=30)
    counts = [963_728, 955_000, 650_000, 430_000, 500_000, 990_000, 536_000]
    for i, n in enumerate(counts):
        ts = start + timedelta(hours=2 * i)
        rawstore.write_raw(cfg.raw_dir, "steam", ts, {}, _steam_counts({730: n}))
    s = derive(cfg, now=NOW).signals.steam
    c = next(g for g in s.games if g.key == "cs2")
    assert c.peak_24h == 990_000
    assert c.peak_24h_at == start + timedelta(hours=10)
    assert c.peak_24h_since == start == s.tracking_since
    assert c.peak_24h_partial is True
    body = json.loads((cfg.public_dir / "signals.json").read_text())
    cs2 = next(g for g in body["steam"]["games"] if g["key"] == "cs2")
    assert cs2["peak_24h_since"] == start.isoformat().replace("+00:00", "Z")
    assert cs2["peak_24h_partial"] is True


def _wiki_with_days(days: dict[str, dict[str, int]]) -> dict:
    """A wikipedia payload whose en/ja bodies are the fixtures plus extra days."""
    payload = _wiki_payload()
    for lang, extra in days.items():
        body = payload["editions"][lang]["body"]
        proto = body["items"][-1]
        body["items"] += [{**proto, "timestamp": f"{d}00", "views": v} for d, v in extra.items()]
    return payload


def test_wikipedia_since_launch_appears_when_a_later_run_finds_the_launch_day(cfg: Config):
    raw = cfg.raw_dir
    # Morning after launch: the launch day is not published yet.
    rawstore.write_raw(raw, "wikipedia", NOW - timedelta(hours=12), {}, _wiki_payload())
    first = derive(cfg, now=NOW - timedelta(hours=12)).signals.wikipedia
    assert first.since_launch_pending is True and first.total_since_launch == 0

    # Six hours later Wikimedia has published 2026-11-19 for en only.
    rawstore.write_raw(
        raw,
        "wikipedia",
        NOW - timedelta(hours=6),
        {},
        _wiki_with_days({"en": {"20261119": 750_227}}),
    )
    wk = derive(cfg, now=NOW).signals.wikipedia
    en, ja = (next(e for e in wk.editions if e.lang == k) for k in ("en", "ja"))
    assert wk.since_launch_pending is False
    assert str(wk.window_end) == "2026-11-19"
    assert en.views_since_launch == 750_227 and en.since_launch_pending is False
    assert ja.views_since_launch == 0 and ja.since_launch_pending is True  # not fetched yet
    assert wk.total_since_launch == 750_227


def test_wikipedia_refetches_dedupe_per_edition_and_day_latest_wins(cfg: Config):
    raw = cfg.raw_dir
    day = {"20261119": 700_000}
    later = {"20261119": 750_227, "20261120": 400_000}
    rawstore.write_raw(
        raw, "wikipedia", NOW - timedelta(hours=12), {}, _wiki_with_days({"en": day})
    )
    rawstore.write_raw(
        raw, "wikipedia", NOW - timedelta(hours=6), {}, _wiki_with_days({"en": later})
    )
    en = derive(cfg, now=NOW).signals.wikipedia.editions[0]
    assert en.views_since_launch == 750_227 + 400_000  # each day once, the later read

    # An older file that lands after the newer ones were ingested (e.g. copied in, or a
    # backfill from elsewhere) never overwrites the newer number.
    rawstore.write_raw(
        raw, "wikipedia", NOW - timedelta(days=2), {}, _wiki_with_days({"en": {"20261119": 1}})
    )
    res = derive(cfg, now=NOW)
    assert res.ingested == {"wikipedia": 1}
    assert res.signals.wikipedia.editions[0].views_since_launch == 750_227 + 400_000
    # and a rebuild over every raw file agrees
    rebuilt = derive(cfg, now=NOW, rebuild=True).signals.wikipedia
    assert rebuilt.editions[0].views_since_launch == 750_227 + 400_000
    rows = duckdb_rows(cfg, "SELECT count(*) FROM wiki_daily WHERE project = 'en.wikipedia'")
    assert rows == [(13,)]  # 11 fixture days + 19th + 20th, one row each


def duckdb_rows(cfg: Config, sql: str) -> list[tuple]:
    con = duckdb.connect(str(cfg.db_path), read_only=True)
    try:
        return con.execute(sql).fetchall()
    finally:
        con.close()


ADDED_AFTER_V1 = {
    "SteamGame": {"peak_24h_at", "peak_24h_since", "peak_24h_partial"},
    "WikiEdition": {"since_launch_pending"},
    "WikipediaSignals": {"launch_day", "since_launch_pending"},
}


def test_schema_additions_are_optional_and_old_payloads_still_validate(populated: Config):
    defs = json_schema()["$defs"]
    for model, fields in ADDED_AFTER_V1.items():
        assert fields <= set(defs[model]["properties"])
        assert not fields & set(defs[model].get("required", [])), model
    # A payload as an older collector wrote it (none of the new keys) is still a valid v1.
    body = json.loads(derive(populated, now=NOW).signals_path.read_text())
    for g in body["steam"]["games"]:
        for k in ADDED_AFTER_V1["SteamGame"]:
            del g[k]
    for e in body["wikipedia"]["editions"]:
        del e["since_launch_pending"]
    for k in ADDED_AFTER_V1["WikipediaSignals"]:
        del body["wikipedia"][k]
    assert body["schema_version"] == 1
    Signals.model_validate(body)
