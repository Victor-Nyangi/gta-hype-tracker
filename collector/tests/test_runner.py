from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import httpx

from collector.config import Config
from collector.runner import DAY, FIVE_MIN, HOUR, Job, Runner
from collector.sources import Fetched, SourceUnavailable


class FakeClock:
    def __init__(self, start: datetime) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


class OkSource:
    def __init__(self, name: str) -> None:
        self.name = name
        self.calls: list[datetime] = []

    def missing_credentials(self):
        return None

    def fetch(self, client, now):
        self.calls.append(now)
        return Fetched(request={"n": len(self.calls)}, payload={"apps": {}}, summary="fine")


class BoomSource(OkSource):
    def fetch(self, client, now):
        self.calls.append(now)
        raise httpx.ConnectError("connection refused")


class NoKeySource(OkSource):
    def missing_credentials(self):
        return "NO_KEY not set"


def make(cfg: Config, sources, start: datetime):
    clock = FakeClock(start)
    derives: list[datetime] = []
    runner = Runner(
        cfg,
        sources,
        client=httpx.Client(),
        clock=clock,
        sleep=clock.sleep,
        derive_fn=lambda c, now: derives.append(now),
    )
    return runner, clock, derives


def test_slots_align_to_the_wall_clock():
    job = Job("x", FIVE_MIN, 0, lambda now: "")
    assert job.next_slot_after(datetime(2026, 11, 19, 21, 3, 7, tzinfo=UTC)) == datetime(
        2026, 11, 19, 21, 5, tzinfo=UTC
    )
    assert job.next_slot_after(datetime(2026, 11, 19, 21, 5, tzinfo=UTC)) == datetime(
        2026, 11, 19, 21, 10, tzinfo=UTC
    )
    daily = Job("w", DAY, 6 * HOUR, lambda now: "")
    assert daily.next_slot_after(datetime(2026, 11, 19, 21, 0, tzinfo=UTC)) == datetime(
        2026, 11, 20, 6, 0, tzinfo=UTC
    )


def test_failing_source_does_not_stop_the_others(cfg: Config, caplog):
    steam, boom = OkSource("steam"), BoomSource("twitch")
    runner, _clock, derives = make(cfg, [boom, steam], datetime(2026, 11, 19, 21, 3, tzinfo=UTC))
    with caplog.at_level(logging.INFO, logger="collector"):
        runner.loop(max_cycles=3, install_signals=False)
    # startup run + three 5-minute slots (21:05, 21:10, 21:15)
    assert len(boom.calls) == 4 and len(steam.calls) == 4
    assert len(derives) == 4
    assert sum("twitch FAILED" in r.message for r in caplog.records) == 4
    assert sum("steam ok" in r.message for r in caplog.records) == 4
    files = sorted((cfg.raw_dir / "steam").rglob("*.json"))
    assert [f.name for f in files] == ["210300.json", "210500.json", "211000.json", "211500.json"]
    assert not (cfg.raw_dir / "twitch").exists()


def test_skipped_source_logs_once(cfg: Config, caplog):
    nokey, steam = NoKeySource("youtube"), OkSource("steam")
    runner, _clock, _ = make(cfg, [nokey, steam], datetime(2026, 11, 19, 21, 0, tzinfo=UTC))
    with caplog.at_level(logging.INFO, logger="collector"):
        runner.loop(max_cycles=2, install_signals=False)
    skipped = [r for r in caplog.records if "youtube skipped" in r.message]
    assert len(skipped) == 1 and "NO_KEY not set" in skipped[0].message
    assert nokey.calls == []


def test_derive_failure_is_survived(cfg: Config, caplog):
    steam = OkSource("steam")
    clock = FakeClock(datetime(2026, 11, 19, 21, 0, tzinfo=UTC))

    def bad_derive(c, now):
        raise RuntimeError("disk full")

    runner = Runner(
        cfg, [steam], client=httpx.Client(), clock=clock, sleep=clock.sleep, derive_fn=bad_derive
    )
    with caplog.at_level(logging.INFO, logger="collector"):
        runner.loop(max_cycles=2, install_signals=False)
    assert len(steam.calls) == 3
    assert sum("derive FAILED" in r.message for r in caplog.records) == 3


def test_hourly_and_daily_jobs_run_on_their_slots(cfg: Config):
    steam, yt, wiki = OkSource("steam"), OkSource("youtube"), OkSource("wikipedia")
    runner, _clock, _derives = make(
        cfg, [steam, yt, wiki], datetime(2026, 11, 19, 21, 58, tzinfo=UTC)
    )
    runner.loop(max_cycles=13, install_signals=False)  # 22:00 ... 23:00
    assert len(steam.calls) == 14
    assert [c.strftime("%H:%M") for c in yt.calls] == ["21:58", "22:00", "23:00"]
    assert len(wiki.calls) == 1  # startup only; the next daily slot is 06:00


def test_source_unavailable_mid_run_is_a_skip(cfg: Config):
    class LateNoCategory(OkSource):
        def fetch(self, client, now):
            raise SourceUnavailable("no category yet")

    s = LateNoCategory("twitch")
    runner, _, _ = make(cfg, [s], datetime(2026, 11, 19, 21, 0, tzinfo=UTC))
    assert runner.run_due(runner.clock(), all_jobs=True) == ["twitch", "compact"]
