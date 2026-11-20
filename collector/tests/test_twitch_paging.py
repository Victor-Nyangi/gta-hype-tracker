"""Twitch paging and rate limiting against a fake Helix (httpx.MockTransport).

The fake serves a large category in pages of 100 with a cursor, and keeps a Helix-style
token bucket: every request costs a point, ``Ratelimit-Remaining`` / ``Ratelimit-Reset``
(epoch seconds) come back on every response, and an empty bucket answers 429.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from conftest import load

from collector.config import Config
from collector.http import make_client
from collector.sources.twitch import RATELIMIT_FLOOR, RateLimited, TwitchSource

NOW = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
T0 = 1795640000.0
GTA6 = "123456789"
GTAV = "32982"


class FakeTime:
    """clock() and sleep() for the source; every request also advances it a little."""

    def __init__(self, start: float = T0, per_request: float = 0.2) -> None:
        self.now = start
        self.per_request = per_request
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, s: float) -> None:
        self.slept.append(s)
        self.now += s


class FakeHelix:
    def __init__(
        self,
        t: FakeTime,
        *,
        gta6_streams: int,
        gtav_streams: int = 250,
        bucket: int = 800,
        refill_every: float = 60.0,
        fail_pages: frozenset[int] = frozenset(),
        drain_at_call: int | None = None,
    ) -> None:
        self.t = t
        self.streams = {GTA6: gta6_streams, GTAV: gtav_streams}
        self.bucket_size = bucket
        self.points = bucket
        self.refill_every = refill_every
        self.reset_at = t.now + refill_every
        self.fail_pages = fail_pages
        self.drain_at_call = drain_at_call  # another client on the same token empties it
        self.calls: list[httpx.Request] = []
        self.statuses: list[int] = []

    def _refill(self) -> None:
        while self.t.now >= self.reset_at:
            self.points = self.bucket_size
            self.reset_at += self.refill_every

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.host == "id.twitch.tv":
            return httpx.Response(200, json=load("twitch_token.json"))
        self.calls.append(req)
        self.t.now += self.t.per_request
        self._refill()
        if self.drain_at_call is not None and len(self.calls) == self.drain_at_call:
            self.points = 0
        if self.points <= 0:
            self.statuses.append(429)
            return httpx.Response(429, json={"message": "Too Many Requests"}, headers=self._h())
        self.points -= 1
        assert req.url.path == "/helix/streams"
        gid = req.url.params["game_id"]
        start = int(req.url.params.get("after", "0"))
        page_no = start // 100 + 1
        if gid == GTA6 and page_no in self.fail_pages:
            self.statuses.append(503)
            return httpx.Response(503, json={"message": "unavailable"}, headers=self._h())
        total = self.streams[gid]
        end = min(start + 100, total)
        data = [
            {
                "id": f"{gid}-{i}",
                "user_id": str(i),
                "user_login": f"s{i}",
                "viewer_count": max(1, 100_000 // (i + 1)),
                "language": "en" if i % 3 else "es",
            }
            for i in range(start, end)
        ]
        pagination = {"cursor": str(end)} if end < total else {}
        self.statuses.append(200)
        return httpx.Response(200, json={"data": data, "pagination": pagination}, headers=self._h())

    def _h(self) -> dict[str, str]:
        return {
            "Ratelimit-Limit": str(self.bucket_size),
            "Ratelimit-Remaining": str(max(self.points, 0)),
            "Ratelimit-Reset": str(int(self.reset_at)),
        }


def _cfg(tmp_path, **env: str) -> Config:
    return Config.from_env(
        {
            "DATA_DIR": str(tmp_path),
            "TWITCH_CLIENT_ID": "test-client",
            "TWITCH_CLIENT_SECRET": "test-secret",
            "TWITCH_GAME_ID": GTA6,
            **env,
        }
    )


def _run(cfg: Config, helix: FakeHelix, t: FakeTime):
    src = TwitchSource(cfg, sleep=t.sleep, clock=t.clock)
    with make_client(cfg, httpx.MockTransport(helix)) as client:
        return src.fetch(client, NOW)


def _expected_viewers(n: int) -> int:
    return sum(max(1, 100_000 // (i + 1)) for i in range(n))


def test_counts_every_stream_across_hundreds_of_pages(tmp_path):
    t = FakeTime()
    helix = FakeHelix(t, gta6_streams=34_567)
    f = _run(_cfg(tmp_path), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert len(g6["pages"]) == 346
    assert g6["truncated"] is False and g6["truncated_reason"] is None
    assert "34567 streams" in f.summary and "truncated" not in f.summary
    assert f"gta6 {_expected_viewers(34_567)} viewers" in f.summary
    assert f.payload["games"]["gtav"]["truncated"] is False
    assert t.slept == []  # 349 requests fit in one 800-point bucket


def test_waits_for_reset_when_bucket_runs_low_and_still_counts_everything(tmp_path):
    t = FakeTime(per_request=0.1)
    # A 200-point bucket that refills every 60 s: 503 requests need two refills.
    helix = FakeHelix(t, gta6_streams=50_000, bucket=200, refill_every=60.0)
    f = _run(_cfg(tmp_path), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert g6["truncated"] is False and len(g6["pages"]) == 500
    assert "50000 streams" in f.summary
    assert 429 not in helix.statuses  # paced by the headers, never hit the wall
    assert len(t.slept) == 2
    # each wait runs to the advertised reset (+0.5 s), not a blind maximum
    assert all(0.5 <= s <= 60.5 for s in t.slept)


def test_429_waits_and_retries_the_same_cursor(tmp_path):
    t = FakeTime(per_request=0.1)
    # Headers said plenty was left, then another client emptied the bucket: request 5 is
    # answered 429, and paging resumes from the same cursor after the reset.
    helix = FakeHelix(t, gta6_streams=1_000, drain_at_call=5)
    f = _run(_cfg(tmp_path), helix, t)
    assert helix.statuses.count(429) == 1
    after = [c.url.params.get("after") for c in helix.calls]
    assert after[4] == after[5]  # the 429'd request was repeated, not skipped
    g6 = f.payload["games"]["gta6"]
    assert g6["truncated"] is False and len(g6["pages"]) == 10
    assert "1000 streams" in f.summary
    assert t.slept and t.slept[0] <= 60.5


def test_time_budget_stops_paging_and_marks_truncated(tmp_path):
    t = FakeTime(per_request=1.0)
    helix = FakeHelix(t, gta6_streams=50_000)
    f = _run(_cfg(tmp_path, TWITCH_TIME_BUDGET_S="30"), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert g6["truncated"] is True and g6["truncated_reason"] == "time_budget"
    assert f.payload["games"]["gtav"]["truncated"] is False  # fetched first, complete
    assert 20 <= len(g6["pages"]) <= 30
    assert "truncated: time_budget" in f.summary


def test_rate_limit_past_the_budget_truncates_instead_of_sleeping(tmp_path):
    t = FakeTime(per_request=0.1)
    helix = FakeHelix(t, gta6_streams=50_000, bucket=50, refill_every=60.0)
    f = _run(_cfg(tmp_path, TWITCH_TIME_BUDGET_S="20"), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert g6["truncated"] is True and g6["truncated_reason"] == "rate_limit"
    assert t.slept == []  # the reset was further away than the budget allowed
    assert len(g6["pages"]) == 50 - 3 - RATELIMIT_FLOOR + 1  # gtav took 3 points


def test_page_cap_is_a_safety_net_and_is_reported(tmp_path):
    t = FakeTime()
    helix = FakeHelix(t, gta6_streams=50_000)
    f = _run(_cfg(tmp_path, TWITCH_MAX_PAGES="200"), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert len(g6["pages"]) == 200
    assert g6["truncated"] is True and g6["truncated_reason"] == "page_cap"


def test_exactly_full_last_page_is_not_truncated(tmp_path):
    t = FakeTime()
    helix = FakeHelix(t, gta6_streams=200)
    f = _run(_cfg(tmp_path, TWITCH_MAX_PAGES="2"), helix, t)
    assert f.payload["games"]["gta6"]["truncated"] is False


def test_a_failing_later_page_keeps_what_was_counted(tmp_path, caplog):
    t = FakeTime()
    helix = FakeHelix(t, gta6_streams=5_000, fail_pages=frozenset({7}))
    f = _run(_cfg(tmp_path), helix, t)
    g6 = f.payload["games"]["gta6"]
    assert g6["truncated"] is True and g6["truncated_reason"] == "error"
    assert len(g6["pages"]) == 6
    assert helix.statuses.count(503) == 2  # retried once
    assert not any("?" in r.getMessage() for r in caplog.records)  # no query strings


def test_a_transient_5xx_is_retried(tmp_path):
    t = FakeTime()
    helix = FakeHelix(t, gta6_streams=500)
    real = helix.__call__
    state = {"failed": False}

    def flaky(req):
        if req.url.host != "id.twitch.tv" and not state["failed"]:
            state["failed"] = True
            return httpx.Response(502)
        return real(req)

    src = TwitchSource(_cfg(tmp_path), sleep=t.sleep, clock=t.clock)
    with make_client(src.cfg, httpx.MockTransport(flaky)) as client:
        f = src.fetch(client, NOW)
    assert f.payload["games"]["gta6"]["truncated"] is False
    assert "500 streams" in f.summary


def test_rate_limited_before_any_page_raises(tmp_path):
    t = FakeTime(per_request=0.1)
    helix = FakeHelix(t, gta6_streams=500, bucket=5, refill_every=60.0)
    with pytest.raises(RateLimited):
        _run(_cfg(tmp_path, TWITCH_TIME_BUDGET_S="5"), helix, t)
