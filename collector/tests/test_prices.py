"""Share prices (Alpha Vantage TIME_SERIES_DAILY): parse, soft failures, fetch, the key kept
out of logs and raw files, the derive maths and history merging, the schema and the runner.

Recorded fixtures (2026-11-21, the public ``demo`` key, which only answers for IBM):
``alphavantage_daily_ibm_compact.json`` (a compact daily series) and
``alphavantage_information_demo.json`` (what any other symbol gets: HTTP 200 with an
``Information`` message and no series, the same shape as a rate-limit answer).
No live calls.
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from conftest import load

from collector import rawstore
from collector.config import Config
from collector.derive import LAUNCH_FROM, LAUNCH_TO, derive
from collector.http import make_client
from collector.runner import DAY, HOUR, Runner
from collector.signals import BusinessSignals, Signals, json_schema
from collector.sources import SourceSoftFailure
from collector.sources import prices as px
from collector.sources.prices import PricesSource

NOW = datetime(2026, 11, 21, 22, 30, tzinfo=UTC)
KEY = "AVKEY-DO-NOT-LOG-5c4b3a"
DAY_TD = timedelta(days=1)
SYMBOLS = ("TTWO", "EA", "SONY", "QQQ")

IBM = load("alphavantage_daily_ibm_compact.json")
INFO = load("alphavantage_information_demo.json")
# Alpha Vantage's older rate-limit shape (a "Note"), hand-written: it cannot be triggered
# with the demo key. Some limit messages quote the caller's key back; this one does.
NOTE_ECHOING_KEY = {
    "Note": f"We have detected your API key as {KEY} and our standard API rate limit is"
    " 25 requests per day."
}


@pytest.fixture
def keyed(tmp_path: Path) -> Config:
    return Config.from_env({"DATA_DIR": str(tmp_path / "data"), "ALPHA_VANTAGE_API_KEY": KEY})


def av_body(symbol: str, closes: dict[str, float]) -> dict:
    """A TIME_SERIES_DAILY body in Alpha Vantage's shape (newest day first, as it sends)."""
    return {
        "Meta Data": {
            "1. Information": "Daily Prices (open, high, low, close) and Volumes",
            "2. Symbol": symbol,
            "3. Last Refreshed": max(closes),
            "4. Output Size": "Compact",
            "5. Time Zone": "US/Eastern",
        },
        "Time Series (Daily)": {
            d: {
                "1. open": f"{c:.4f}",
                "2. high": f"{c:.4f}",
                "3. low": f"{c:.4f}",
                "4. close": f"{c:.4f}",
                "5. volume": "1000",
            }
            for d, c in sorted(closes.items(), reverse=True)
        },
    }


def payload(bodies: dict[str, dict]) -> dict:
    return {"tickers": {s: {"status": 200, "body": b} for s, b in bodies.items()}}


def handler_for(bodies: dict[str, object], seen: list[httpx.Request] | None = None):
    """Mock transport: per symbol a JSON body, an int status, or an exception to raise."""

    def handler(req: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(req)
        what = bodies[req.url.params["symbol"]]
        if isinstance(what, Exception):
            raise type(what)(str(what), request=req)
        if isinstance(what, int):
            return httpx.Response(what, text="upstream error")
        return httpx.Response(200, json=what)

    return handler


# --- parse -----------------------------------------------------------------------------


def test_parse_the_recorded_compact_series():
    closes = px.parse_one("IBM", IBM)
    assert len(closes) == 100  # compact: the latest 100 trading days
    assert [c.day for c in closes] == sorted(c.day for c in closes)  # oldest first
    assert (closes[0].day, closes[-1].day) == (date(2026, 7, 2), date(2026, 11, 20))
    assert closes[-1].close == 224.44 and closes[-1].symbol == "IBM"
    by_day = {c.day: c.close for c in closes}
    assert (by_day[LAUNCH_FROM], by_day[LAUNCH_TO]) == (228.53, 223.88)


def test_soft_failures_have_no_series():
    assert px.parse_one("TTWO", INFO) is None
    assert px.soft_message(INFO).startswith("Information: The **demo** API key")
    assert px.soft_message({"Note": "Thank you for using Alpha Vantage!"}).startswith("Note: ")
    err = {"Error Message": "Invalid API call. Please retry or visit the documentation."}
    assert px.soft_message(err).startswith("Error Message: Invalid API call")
    assert px.soft_message({}) == "no daily series in the response"
    assert px.soft_message(IBM) is None


def test_parse_skips_failed_and_malformed_tickers():
    bad = copy.deepcopy(IBM)
    bad["Time Series (Daily)"]["2026-11-20"]["4. close"] = "n/a"
    p = {
        "tickers": {
            "TTWO": {"status": 200, "body": IBM},
            "EA": {"status": 200, "body": INFO, "soft_failure": "Information: ..."},
            "SONY": {"status": 0, "body": None, "error": "ConnectTimeout: ..."},
            "QQQ": {"status": 200, "body": bad},
            "XYZ": {"status": 503, "body": None},
        }
    }
    assert list(px.parse(p)) == ["TTWO"]


# --- fetch -----------------------------------------------------------------------------


def test_fetch_asks_compact_daily_for_each_ticker_spaced_out(keyed: Config):
    seen: list[httpx.Request] = []
    pauses: list[float] = []
    bodies = {s: av_body(s, {"2026-11-19": 100.0, "2026-11-20": 101.0}) for s in SYMBOLS}
    with make_client(keyed, httpx.MockTransport(handler_for(bodies, seen))) as client:
        f = PricesSource(keyed, sleep=pauses.append).fetch(client, NOW)
    assert [r.url.params["symbol"] for r in seen] == list(SYMBOLS)
    for r in seen:
        assert r.url.params["function"] == "TIME_SERIES_DAILY"
        assert r.url.params["outputsize"] == "compact"
        assert r.url.params["apikey"] == KEY
    assert pauses == [5.0, 5.0, 5.0]  # a gap between requests, none before the first
    assert f.request == {
        "endpoint": "https://www.alphavantage.co/query",
        "function": "TIME_SERIES_DAILY",
        "outputsize": "compact",
        "symbols": list(SYMBOLS),
    }
    assert f.summary == "4/4 tickers; TTWO 101.00 (2026-11-20)"


def test_a_rate_limited_ticker_is_recorded_and_the_rest_kept(keyed: Config):
    bodies = {s: av_body(s, {"2026-11-20": 50.0}) for s in SYMBOLS}
    bodies["QQQ"] = INFO
    with make_client(keyed, httpx.MockTransport(handler_for(bodies))) as client:
        f = PricesSource(keyed, sleep=lambda s: None).fetch(client, NOW)
    qqq = f.payload["tickers"]["QQQ"]
    assert qqq["status"] == 200 and qqq["soft_failure"].startswith("Information:")
    assert list(px.parse(f.payload)) == ["TTWO", "EA", "SONY"]
    assert f.summary.startswith("3/4 tickers") and "missing: QQQ Information:" in f.summary


def test_no_closes_at_all_is_a_soft_failure(keyed: Config):
    bodies = {s: INFO for s in SYMBOLS}
    transport = httpx.MockTransport(handler_for(bodies))
    with make_client(keyed, transport) as client, pytest.raises(SourceSoftFailure) as e:
        PricesSource(keyed, sleep=lambda s: None).fetch(client, NOW)
    assert "no ticker returned closes" in str(e.value) and "TTWO Information:" in str(e.value)


def test_soft_failure_keeps_the_last_good_data(keyed: Config, caplog):
    day1 = NOW - timedelta(days=1)
    good = payload({s: av_body(s, {"2026-11-19": 10.0, "2026-11-20": 11.0}) for s in SYMBOLS})
    rawstore.write_raw(keyed.raw_dir, "prices", day1, {}, good)
    derive(keyed, now=day1)

    runner = Runner(
        keyed,
        [PricesSource(keyed, sleep=lambda s: None)],
        client=make_client(keyed, httpx.MockTransport(handler_for(dict.fromkeys(SYMBOLS, INFO)))),
        clock=lambda: NOW,
        sleep=lambda s: None,
        derive_fn=derive,
    )
    job = next(j for j in runner.jobs if j.name == "prices")
    with caplog.at_level(logging.INFO, logger="collector"):
        assert runner.run_job(job, NOW) is False
    (line,) = [r for r in caplog.records if r.name == "collector" and "prices" in r.getMessage()]
    assert line.levelno == logging.WARNING
    assert (
        "prices no new data" in line.getMessage() and "kept the last good data" in line.getMessage()
    )
    assert len(list(rawstore.iter_raw_paths(keyed.raw_dir, "prices"))) == 1  # nothing written
    p = derive(keyed, now=NOW).signals.business.prices
    ttwo = next(t for t in p.tickers if t.symbol == "TTWO")
    assert (ttwo.latest_date, ttwo.latest_close) == (date(2026, 11, 20), 11.0)
    assert p.updated_at == day1


# --- the key never reaches the logs or the raw store -------------------------------------


def test_failing_requests_keep_the_key_out_of_the_log_and_the_raw_file(keyed: Config, caplog):
    seen: list[httpx.Request] = []
    bodies: dict[str, object] = {
        "TTWO": av_body("TTWO", {"2026-11-20": 150.0}),
        "EA": 503,
        "SONY": httpx.ConnectTimeout("timed out"),
        "QQQ": NOTE_ECHOING_KEY,
    }
    runner = Runner(
        keyed,
        [PricesSource(keyed, sleep=lambda s: None)],
        client=make_client(keyed, httpx.MockTransport(handler_for(bodies, seen))),
        clock=lambda: NOW,
        sleep=lambda s: None,
        derive_fn=lambda c, now: None,
    )
    job = next(j for j in runner.jobs if j.name == "prices")
    with caplog.at_level(logging.DEBUG):
        assert runner.run_job(job, NOW) is True
    assert all(KEY in str(r.url) for r in seen)  # the key really is in every request URL
    (raw,) = list(rawstore.iter_raw_paths(keyed.raw_dir, "prices"))
    text = raw.read_text()
    assert KEY not in text and "apikey" not in text
    stored = json.loads(text)["payload"]["tickers"]
    assert stored["EA"] == {"status": 503, "body": None}
    assert stored["SONY"]["error"] == (
        "ConnectTimeout: GET https://www.alphavantage.co/query: timed out"
    )
    assert "[redacted]" in stored["QQQ"]["body"]["Note"]
    assert "missing: EA HTTP 503; SONY ConnectTimeout" in caplog.text
    # httpx's own request log line (INFO) is captured too, with its query string cut
    assert "GET https://www.alphavantage.co/query?[redacted]" in caplog.text
    assert KEY not in caplog.text

    # every ticker failing: the one log line still carries no key
    caplog.clear()
    bodies.update(TTWO=httpx.ReadTimeout("read timed out"), EA=NOTE_ECHOING_KEY)
    with caplog.at_level(logging.DEBUG):
        assert runner.run_job(job, NOW + timedelta(seconds=1)) is False
    assert "prices no new data" in caplog.text and "[redacted]" in caplog.text
    assert KEY not in caplog.text
    assert len(list(rawstore.iter_raw_paths(keyed.raw_dir, "prices"))) == 1


def test_the_key_stays_out_of_the_config_repr(keyed: Config):
    assert KEY not in repr(keyed)


def test_redact_walks_nested_values():
    v = {"a": [f"x{KEY}y", 1, {KEY: KEY}], "b": None}
    assert px.redact(v, KEY) == {"a": ["x[redacted]y", 1, {"[redacted]": "[redacted]"}], "b": None}
    assert px.redact(v, "") is v


# --- derive ----------------------------------------------------------------------------

# Around launch: Tuesday 17th .. Friday 20th.
CLOSES = {
    "TTWO": {"2026-11-17": 240.0, "2026-11-18": 250.0, "2026-11-19": 230.0, "2026-11-20": 260.0},
    "EA": {"2026-11-17": 150.0, "2026-11-18": 150.0, "2026-11-19": 153.0, "2026-11-20": 147.0},
    "SONY": {"2026-11-18": 25.0, "2026-11-19": 25.5, "2026-11-20": 25.25},
    "QQQ": {"2026-11-17": 590.0, "2026-11-18": 600.0, "2026-11-19": 606.0, "2026-11-20": 612.0},
}


def test_derive_launch_day_since_launch_and_vs_the_baseline(cfg: Config):
    bodies = {s: av_body(s, c) for s, c in CLOSES.items()}
    rawstore.write_raw(cfg.raw_dir, "prices", NOW, {}, payload(bodies))
    res = derive(cfg, now=NOW)
    assert res.ingested == {"prices": 1}
    p = res.signals.business.prices
    assert (p.source, p.source_url) == ("Alpha Vantage", "https://www.alphavantage.co/")
    assert (p.subject, p.baseline, p.launch_from, p.launch_to) == (
        "TTWO",
        "QQQ",
        date(2026, 11, 18),
        date(2026, 11, 19),
    )
    assert p.tracking_since == p.updated_at == NOW
    assert [t.symbol for t in p.tickers] == ["TTWO", "EA", "SONY", "QQQ"]
    assert [t.role for t in p.tickers] == ["subject", "peer", "peer", "baseline"]

    ttwo = p.tickers[0]
    assert [(c.date.isoformat(), c.close) for c in ttwo.closes] == list(CLOSES["TTWO"].items())
    assert (ttwo.first_date, ttwo.latest_date, ttwo.latest_close) == (
        date(2026, 11, 17),
        date(2026, 11, 20),
        260.0,
    )
    assert ttwo.fetched_at == NOW
    # 250 -> 230 on launch day, 250 -> 260 since
    ld, sl = ttwo.launch_day, ttwo.since_launch
    assert (ld.from_date, ld.to_date, ld.from_close, ld.to_close) == (
        LAUNCH_FROM,
        LAUNCH_TO,
        250.0,
        230.0,
    )
    assert (ld.change, ld.change_pct) == (-20.0, -8.0)
    assert (sl.to_date, sl.change, sl.change_pct) == (date(2026, 11, 20), 10.0, 4.0)

    qqq = p.tickers[3]
    assert (qqq.launch_day.change_pct, qqq.since_launch.change_pct) == (1.0, 2.0)
    assert p.subject_vs_baseline_launch_day.model_dump() == {
        "subject_pct": -8.0,
        "baseline_pct": 1.0,
        "difference_pts": -9.0,
    }
    assert p.subject_vs_baseline_since_launch.difference_pts == 2.0  # 4% vs 2%

    sony = p.tickers[2]
    assert sony.launch_day.change_pct == 2.0 and sony.since_launch.change_pct == 1.0


def test_derive_changes_are_null_until_the_closes_exist(cfg: Config):
    before = {s: {"2026-11-17": 1.0, "2026-11-18": 2.0} for s in SYMBOLS}
    rawstore.write_raw(
        cfg.raw_dir, "prices", NOW, {}, payload({s: av_body(s, c) for s, c in before.items()})
    )
    p = derive(cfg, now=NOW).signals.business.prices
    assert all(t.launch_day is None and t.since_launch is None for t in p.tickers)
    assert p.subject_vs_baseline_launch_day is None
    assert p.subject_vs_baseline_since_launch is None


def test_relative_change_needs_the_same_window(cfg: Config):
    # QQQ's newest close is a day behind TTWO's: since-launch spans differ, so no comparison
    closes = copy.deepcopy(CLOSES)
    del closes["QQQ"]["2026-11-20"]
    rawstore.write_raw(
        cfg.raw_dir, "prices", NOW, {}, payload({s: av_body(s, c) for s, c in closes.items()})
    )
    p = derive(cfg, now=NOW).signals.business.prices
    assert p.subject_vs_baseline_launch_day is not None
    assert p.subject_vs_baseline_since_launch is None


def test_history_accumulates_across_snapshots_and_the_latest_fetch_wins(cfg: Config):
    raw = cfg.raw_dir
    old = {"2026-11-16": 1.0, "2026-11-17": 2.0, "2026-11-18": 3.0}
    new = {"2026-11-17": 2.5, "2026-11-18": 3.5, "2026-11-19": 4.0}
    rawstore.write_raw(raw, "prices", NOW, {}, payload({"TTWO": av_body("TTWO", new)}))
    derive(cfg, now=NOW)
    # an older fetch ingested after the newer one never overwrites it
    rawstore.write_raw(raw, "prices", NOW - DAY_TD, {}, payload({"TTWO": av_body("TTWO", old)}))
    p = derive(cfg, now=NOW).signals.business.prices
    (ttwo,) = p.tickers
    assert [(c.date.isoformat(), c.close) for c in ttwo.closes] == [
        ("2026-11-16", 1.0),
        ("2026-11-17", 2.5),
        ("2026-11-18", 3.5),
        ("2026-11-19", 4.0),
    ]
    assert p.tracking_since == NOW - DAY_TD and p.updated_at == NOW
    assert ttwo.fetched_at == NOW

    # and a rebuild from raw gives the same answer, whatever the ingest order
    rebuilt = derive(cfg, now=NOW, rebuild=True).signals.business.prices
    assert rebuilt.tickers[0].closes == ttwo.closes


# --- schema ----------------------------------------------------------------------------


def test_prices_is_optional_and_payloads_validate_with_and_without_it(cfg: Config):
    schema = json_schema()
    business = schema["$defs"]["BusinessSignals"]
    assert "prices" in business["properties"] and "prices" not in business["required"]
    rawstore.write_raw(
        cfg.raw_dir, "prices", NOW, {}, payload({s: av_body(s, c) for s, c in CLOSES.items()})
    )
    body = json.loads(derive(cfg, now=NOW).signals_path.read_text())
    assert body["business"]["prices"]["tickers"][0]["closes"][0] == {
        "date": "2026-11-17",
        "close": 240.0,
    }
    Signals.model_validate(body)
    del body["business"]["prices"]  # a business block from before prices
    assert Signals.model_validate(body).business.prices is None
    body["business"]["prices"] = None
    Signals.model_validate(body)


def test_business_with_prices_only(tmp_path: Path):
    cfg = Config.from_env(
        {"DATA_DIR": str(tmp_path / "d"), "OFFICIAL_FIGURES_PATH": str(tmp_path / "none.json")}
    )
    rawstore.write_raw(
        cfg.raw_dir, "prices", NOW, {}, payload({"TTWO": av_body("TTWO", CLOSES["TTWO"])})
    )
    b = derive(cfg, now=NOW).signals.business
    assert isinstance(b, BusinessSignals)
    assert b.steam_reviews is None and b.official is None and b.prices is not None


# --- runner ----------------------------------------------------------------------------


def test_prices_is_a_default_source_and_skips_without_a_key(tmp_path: Path, caplog):
    cfg = Config.from_env({"DATA_DIR": str(tmp_path / "d")})
    assert "prices" in cfg.sources
    runner = Runner(cfg, client=httpx.Client(), clock=lambda: NOW, sleep=lambda s: None)
    job = next(j for j in runner.jobs if j.name == "prices")
    with caplog.at_level(logging.INFO, logger="collector"):
        runner.run_job(job, NOW)
        runner.run_job(job, NOW + timedelta(days=1))
    lines = [r.getMessage() for r in caplog.records if "prices" in r.getMessage()]
    assert lines == ["prices skipped: ALPHA_VANTAGE_API_KEY not set (will not log this again)"]


def test_prices_runs_daily_after_the_us_close(keyed: Config, tmp_path: Path):
    job = next(j for j in Runner(keyed, client=httpx.Client()).jobs if j.name == "prices")
    assert (job.period_s, job.offset_s, job.triggers_derive) == (DAY, 22 * HOUR + 30 * 60, True)
    assert job.next_slot_after(datetime(2026, 11, 21, 12, 0, tzinfo=UTC)) == datetime(
        2026, 11, 21, 22, 30, tzinfo=UTC
    )
    c2 = Config.from_env(
        {"DATA_DIR": str(tmp_path / "x"), "PRICES_AT_HOUR_UTC": "21", "PRICES_AT_MINUTE_UTC": "5"}
    )
    job = next(j for j in Runner(c2, client=httpx.Client()).jobs if j.name == "prices")
    assert job.offset_s == 21 * HOUR + 5 * 60
    with pytest.raises(ValueError, match="PRICES_AT_HOUR_UTC"):
        Config.from_env({"PRICES_AT_HOUR_UTC": "24"})
    with pytest.raises(ValueError, match="PRICES_AT_MINUTE_UTC"):
        Config.from_env({"PRICES_AT_MINUTE_UTC": "60"})


class CountingPrices:
    name = "prices"

    def __init__(self) -> None:
        self.calls = 0

    def missing_credentials(self):
        return None

    def fetch(self, client, now):
        from collector.sources import Fetched

        self.calls += 1
        return Fetched(request={}, payload=payload({"TTWO": av_body("TTWO", {"2026-11-20": 1.0})}))


def test_startup_fetches_prices_only_while_there_is_no_data(keyed: Config, caplog):
    def start() -> CountingPrices:
        src = CountingPrices()
        r = Runner(
            keyed,
            [src],
            client=httpx.Client(),
            clock=lambda: NOW - timedelta(hours=10),
            sleep=lambda s: None,
            derive_fn=lambda c, now: None,
        )
        r.run_due(r.clock(), all_jobs=True)
        job = next(j for j in r.jobs if j.name == "prices")
        assert job.next_at == datetime(2026, 11, 21, 22, 30, tzinfo=UTC)
        return src

    assert start().calls == 1  # first boot: nothing stored yet, fetch now
    with caplog.at_level(logging.INFO, logger="collector"):
        assert start().calls == 0  # a restart: wait for the daily slot
    assert "prices has data; next run 2026-11-21 22:30 UTC" in caplog.text
