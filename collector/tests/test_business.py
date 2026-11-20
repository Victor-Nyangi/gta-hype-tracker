"""The business block: Steam review counts (parse, fetch, derive maths) and the curated
Take-Two figures. Recorded fixtures only, no live calls."""

from __future__ import annotations

import copy
import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from conftest import load

from collector import rawstore
from collector.config import DEFAULT_OFFICIAL_FIGURES, Config
from collector.derive import derive
from collector.http import make_client
from collector.runner import HOUR, Runner
from collector.signals import OfficialFigures, Signals, json_schema
from collector.sources import steam_reviews
from collector.sources.steam_reviews import SteamReviewsSource, estimate_range

NOW = datetime(2026, 11, 20, 12, 2, tzinfo=UTC)
BG3, ENHANCED, CS2 = 1086940, 3240220, 730
APPS = (271590, 1174180, 730, 1091500, 1245620, 1086940, 3240220)

# Sums over the recorded fixtures (2026-11-20): all-time up/down, and the 7 complete days
# 2026-11-13..19 of Steam's daily `recent` block.
BG3_POS, BG3_NEG, BG3_NEW7 = 753_044, 35_513, 702
ENH_POS, ENH_NEG, ENH_NEW7 = 195_389, 40_940, 2_736


def _body(app: int) -> dict:
    return load(f"steam_reviews_{app}.json")


# --- parse -----------------------------------------------------------------------------


def test_parse_sums_rollups_and_the_last_seven_complete_days():
    r = steam_reviews.parse_one(BG3, _body(BG3), date(2026, 11, 20))
    assert (r.key, r.name) == ("bg3", "Baldur's Gate 3")
    assert (r.positive, r.negative, r.total) == (BG3_POS, BG3_NEG, BG3_POS + BG3_NEG)
    # 11-20 (the fetch day, still partial) is left out; 11-13..11-19 count
    assert r.new_last_7d == BG3_NEW7


def test_parse_weekly_rollups_too():
    # a young app (Enhanced, March 2025) comes back with weekly rollups; same sums
    body = _body(ENHANCED)
    assert body["results"]["rollup_type"] == "week"
    r = steam_reviews.parse_one(ENHANCED, body, date(2026, 11, 20))
    assert (r.key, r.positive, r.negative, r.new_last_7d) == (
        "gtav_enhanced",
        ENH_POS,
        ENH_NEG,
        ENH_NEW7,
    )


def test_parse_skips_failures_and_empty_answers():
    no_recent = copy.deepcopy(_body(BG3))
    del no_recent["results"]["recent"]
    payload = {
        "apps": {
            str(BG3): {"status": 200, "body": no_recent},
            "730": {"status": 200, "body": {"success": 2, "results": {"rollups": []}}},
            "271590": {"status": 0, "body": None, "error": "ValueError: not JSON"},
            "1174180": {"status": 302, "body": None},
            "1091500": {"status": 200, "body": None},
        }
    }
    readings = steam_reviews.parse(payload, date(2026, 11, 20))
    assert [r.app_id for r in readings] == [BG3]
    assert readings[0].new_last_7d is None  # no daily block: unknown, not zero


def test_parse_rejects_a_malformed_body():
    with pytest.raises(ValueError):
        steam_reviews.parse_one(BG3, {"success": 1, "results": {"rollups": [{"x": 1}]}}, NOW.date())


def test_estimate_range():
    assert estimate_range(1_000, BG3) == (30_000, 55_000)
    assert (steam_reviews.ESTIMATE_LOW, steam_reviews.ESTIMATE_HIGH) == (30, 55)
    assert estimate_range(1_000, CS2) is None  # free to play
    assert estimate_range(1_000, ENHANCED) is None  # free upgrade for existing owners
    assert estimate_range(0, BG3) is None


# --- fetch -----------------------------------------------------------------------------


def test_fetch_records_every_app_and_survives_bad_answers(cfg: Config):
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        app = int(req.url.path.rsplit("/", 1)[-1]) if "appreviewhistogram" in req.url.path else 0
        if app == 0:  # the store front page a redirect lands on
            return httpx.Response(200, text="<!DOCTYPE html><title>Welcome to Steam</title>")
        if app == 271590:  # what /appreviews did on 2026-11-20: 302 to the front page
            return httpx.Response(302, headers={"Location": "https://store.steampowered.com/"})
        if app == 730:
            return httpx.Response(500)
        if app == 1174180:
            return httpx.Response(200, text="")  # empty 200
        return httpx.Response(200, json=_body(ENHANCED if app == ENHANCED else BG3))

    with make_client(cfg, httpx.MockTransport(handler)) as client:
        f = SteamReviewsSource(cfg).fetch(client, NOW)
    apps = f.payload["apps"]
    assert set(apps) == {str(a) for a in APPS}
    assert apps["271590"]["status"] == 0 and "JSONDecodeError" in apps["271590"]["error"]
    assert apps["730"] == {"status": 500, "body": None}
    assert apps["1174180"]["status"] == 0
    assert "?" not in json.dumps(f.payload)  # errors are logged without query strings
    assert "4/7 apps" in f.summary
    hist = [r for r in seen if "appreviewhistogram" in r.url.path]
    assert all(r.url.params["review_score_preference"] == "0" for r in hist)


def test_fetch_raises_when_nothing_came_back(cfg: Config):
    transport = httpx.MockTransport(lambda req: httpx.Response(503))
    with make_client(cfg, transport) as client, pytest.raises(RuntimeError):
        SteamReviewsSource(cfg).fetch(client, NOW)


# --- derive ----------------------------------------------------------------------------


def _payload(bump: int = 0) -> dict:
    apps = {}
    for app in APPS:
        body = copy.deepcopy(_body(ENHANCED if app == ENHANCED else BG3))
        body["results"]["rollups"][-1]["recommendations_up"] += bump
        apps[str(app)] = {"status": 200, "body": body}
    return {"apps": apps}


def test_derive_reviews_change_7d_and_estimates(cfg: Config):
    raw = cfg.raw_dir
    rawstore.write_raw(raw, "steam_reviews", NOW - timedelta(days=9), {}, _payload(0))
    rawstore.write_raw(raw, "steam_reviews", NOW - timedelta(days=7, hours=1), {}, _payload(100))
    rawstore.write_raw(raw, "steam_reviews", NOW - timedelta(days=3), {}, _payload(900))
    rawstore.write_raw(raw, "steam_reviews", NOW, {}, _payload(1_250))
    res = derive(cfg, now=NOW)
    assert res.ingested == {"steam_reviews": 4}
    rv = res.signals.business.steam_reviews
    assert rv.tracking_since == NOW - timedelta(days=9) and rv.updated_at == NOW
    assert (rv.method.multiplier_low, rv.method.multiplier_high) == (30, 55)
    assert len(rv.method.sources) == 2
    assert [g.key for g in rv.games][:3] == ["gtav", "rdr2", "cs2"]  # the steam source's order

    bg3 = next(g for g in rv.games if g.app_id == BG3)
    total = BG3_POS + BG3_NEG + 1_250
    assert (bg3.total_reviews, bg3.positive, bg3.negative) == (total, BG3_POS + 1_250, BG3_NEG)
    assert bg3.fetched_at == NOW
    # vs the newest reading at least 7 days older (7d 1h ago, +100), not the oldest (+0)
    assert bg3.change_7d == 1_150
    assert bg3.change_7d_since == NOW - timedelta(days=7, hours=1)
    assert bg3.new_reviews_7d == BG3_NEW7
    assert (bg3.estimated_sales_low, bg3.estimated_sales_high) == (total * 30, total * 55)
    assert bg3.no_estimate_reason is None

    cs2 = next(g for g in rv.games if g.key == "cs2")
    assert cs2.estimated_sales_low is None and cs2.estimated_sales_high is None
    assert "Free to play" in cs2.no_estimate_reason
    enh = next(g for g in rv.games if g.key == "gtav_enhanced")
    assert enh.total_reviews == ENH_POS + ENH_NEG + 1_250 and enh.estimated_sales_low is None


def test_derive_change_7d_is_null_without_a_week_of_history(cfg: Config):
    rawstore.write_raw(cfg.raw_dir, "steam_reviews", NOW - timedelta(days=6), {}, _payload(0))
    rawstore.write_raw(cfg.raw_dir, "steam_reviews", NOW, {}, _payload(10))
    g = derive(cfg, now=NOW).signals.business.steam_reviews.games[0]
    assert g.change_7d is None and g.change_7d_since is None
    assert g.new_reviews_7d is not None  # Steam's own daily counts need no history


def test_official_figures_ship_and_validate():
    figs = OfficialFigures.model_validate_json(DEFAULT_OFFICIAL_FIGURES.read_bytes()).figures
    assert {f.key for f in figs} >= {"gtav_units", "rdr2_units"}
    for f in figs:
        assert f.source_url.startswith("https://") and f.quote
        assert f.value_max is None or f.value_max > f.value


def test_derive_business_without_reviews_still_has_official_figures(cfg: Config):
    b = derive(cfg, now=NOW).signals.business
    assert b.steam_reviews is None
    assert b.official is not None and b.official.figures


def test_bad_official_file_is_left_out_not_fatal(tmp_path: Path, caplog):
    bad = tmp_path / "figures.json"
    bad.write_text('{"updated_at": "2026-11-20T00:00:00Z", "figures": [{"key": 1}]}')
    cfg = Config.from_env({"DATA_DIR": str(tmp_path / "d"), "OFFICIAL_FIGURES_PATH": str(bad)})
    assert derive(cfg, now=NOW).signals.business is None  # nothing else in it either
    assert "official figures unavailable" in caplog.text

    rawstore.write_raw(cfg.raw_dir, "steam_reviews", NOW, {}, _payload())
    b = derive(cfg, now=NOW).signals.business
    assert b.official is None and b.steam_reviews is not None


def test_business_is_optional_in_the_schema_and_payloads_validate_with_and_without(cfg: Config):
    schema = json_schema()
    assert "business" in schema["properties"]
    assert "business" not in schema["required"]
    rawstore.write_raw(cfg.raw_dir, "steam_reviews", NOW, {}, _payload())
    body = json.loads(derive(cfg, now=NOW).signals_path.read_text())
    assert body["business"]["steam_reviews"]["games"]
    assert body["business"]["official"]["figures"]
    Signals.model_validate(body)
    del body["business"]  # an older collector's v1 payload
    assert Signals.model_validate(body).business is None
    body["business"] = None
    Signals.model_validate(body)


# --- runner ----------------------------------------------------------------------------


def test_steam_reviews_job_cadence_defaults_and_env(cfg: Config, tmp_path: Path):
    job = next(j for j in Runner(cfg, client=httpx.Client()).jobs if j.name == "steam_reviews")
    assert (job.period_s, job.offset_s, job.triggers_derive) == (6 * HOUR, 3 * HOUR, True)
    assert job.next_slot_after(NOW) == datetime(2026, 11, 20, 15, 0, tzinfo=UTC)

    c2 = Config.from_env(
        {
            "DATA_DIR": str(tmp_path / "d"),
            "STEAM_REVIEWS_EVERY_HOURS": "12",
            "STEAM_REVIEWS_AT_HOUR_UTC": "22",
        }
    )
    job = next(j for j in Runner(c2, client=httpx.Client()).jobs if j.name == "steam_reviews")
    assert (job.period_s, job.offset_s) == (12 * HOUR, 10 * HOUR)
    with pytest.raises(ValueError, match="STEAM_REVIEWS_EVERY_HOURS"):
        Config.from_env({"STEAM_REVIEWS_EVERY_HOURS": "5"})
