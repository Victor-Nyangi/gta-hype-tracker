from __future__ import annotations

import copy
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
    assert en.views_since_launch == 0  # fixture ends the day before launch
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
