"""The long-running scheduler.

Same shape as snapcount's ingest-scheduler: a plain loop that sleeps until the next
scheduled moment, runs what is due, and never lets one failure take the loop down. No
queue, no worker pool: a handful of small HTTP jobs do not need one.

Schedule (UTC, aligned to the wall clock, no jitter):
  every 5 min   twitch, steam    then derive
  hourly        youtube          (at :00)
  every 6 h     wikipedia        (WIKI_EVERY_HOURS, slots anchored on WIKI_AT_HOUR_UTC:00:
                                  00/06/12/18 by default), then derive. Wikimedia publishes a
                                  day's pageviews some hours after it ends, so each run
                                  re-fetches the trailing days and picks up late ones.
  every 6 h     steam_reviews    (STEAM_REVIEWS_EVERY_HOURS, anchored on
                                  STEAM_REVIEWS_AT_HOUR_UTC:00: 03/09/15/21 by default), then
                                  derive. Review totals move slowly; four reads a day is plenty.
  daily         prices           (PRICES_AT_HOUR_UTC:PRICES_AT_MINUTE_UTC, 22:30 by default,
                                  after the US close), then derive. 4 Alpha Vantage requests a
                                  run, against a free limit of 25 a day.
  daily         compact          (00:10, gzips yesterday's raw partitions)

Every job also runs once at startup, so a fresh deploy (or a restart after downtime) has
current data without waiting for the next slot, except prices, which runs at startup only
while it has no data yet (a restart loop must not burn the daily request limit). Missed
slots are skipped, not replayed.
"""

from __future__ import annotations

import logging
import signal
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from collector import rawstore
from collector.config import Config
from collector.derive import derive
from collector.http import describe_error, make_client
from collector.sources import Source, SourceSoftFailure, SourceUnavailable
from collector.sources.prices import PricesSource
from collector.sources.steam import SteamSource
from collector.sources.steam_reviews import SteamReviewsSource
from collector.sources.twitch import TwitchSource
from collector.sources.wikipedia import WikipediaSource
from collector.sources.youtube import YouTubeSource

log = logging.getLogger("collector")

FIVE_MIN = 300
HOUR = 3600
DAY = 86400


@dataclass
class Job:
    name: str
    period_s: int
    offset_s: int
    run: Callable[[datetime], str]
    triggers_derive: bool = False
    next_at: datetime | None = None
    # Whether the startup run includes this job (asked at startup); default: always.
    at_startup: Callable[[], bool] = lambda: True

    def next_slot_after(self, now: datetime) -> datetime:
        ts = now.timestamp()
        k = (ts - self.offset_s) // self.period_s + 1
        return datetime.fromtimestamp(k * self.period_s + self.offset_s, tz=UTC)


def build_sources(cfg: Config) -> list[Source]:
    factories: dict[str, Callable[[], Source]] = {
        "twitch": lambda: TwitchSource(cfg),
        "steam": lambda: SteamSource(cfg),
        "youtube": lambda: YouTubeSource(cfg),
        "wikipedia": lambda: WikipediaSource(cfg),
        "steam_reviews": lambda: SteamReviewsSource(cfg),
        "prices": lambda: PricesSource(cfg),
    }
    return [factories[name]() for name in cfg.sources]


SCHEDULE = {
    "twitch": (FIVE_MIN, 0, True),
    "steam": (FIVE_MIN, 0, True),
    "youtube": (HOUR, 0, False),
}


class Runner:
    def __init__(
        self,
        cfg: Config,
        sources: list[Source] | None = None,
        *,
        client: httpx.Client | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        sleep: Callable[[float], None] = time.sleep,
        derive_fn: Callable[..., object] = derive,
    ) -> None:
        self.cfg = cfg
        self.client = client or make_client(cfg)
        self.clock = clock
        self.sleep = sleep
        self.derive_fn = derive_fn
        self.stopping = False
        self._skip_logged: set[str] = set()
        self.jobs = self._build_jobs(sources if sources is not None else build_sources(cfg))

    # jobs

    def _build_jobs(self, sources: list[Source]) -> list[Job]:
        # Sources that run every N hours on slots anchored at an hour of the day: (every, at).
        anchored = {
            "wikipedia": (self.cfg.wiki_every_hours, self.cfg.wiki_at_hour_utc),
            "steam_reviews": (
                self.cfg.steam_reviews_every_hours,
                self.cfg.steam_reviews_at_hour_utc,
            ),
        }
        jobs = []
        for src in sources:
            if src.name == "prices":
                at = self.cfg.prices_at_hour_utc * HOUR + self.cfg.prices_at_minute_utc * 60
                jobs.append(
                    Job(
                        src.name,
                        DAY,
                        at,
                        self._source_job(src),
                        True,
                        at_startup=lambda name=src.name: not self._has_raw(name),
                    )
                )
                continue
            if src.name in anchored:
                every, at = anchored[src.name]
                period = every * HOUR
                offset = (at * HOUR) % period
                trig = True
            else:
                period, offset, trig = SCHEDULE.get(src.name, (FIVE_MIN, 0, True))
            jobs.append(Job(src.name, period, offset, self._source_job(src), trig))
        jobs.append(Job("compact", DAY, 10 * 60, self._compact_job))
        return jobs

    def _source_job(self, src: Source) -> Callable[[datetime], str]:
        def run(now: datetime) -> str:
            reason = src.missing_credentials()
            if reason:
                raise SourceUnavailable(reason)
            fetched = src.fetch(self.client, now)
            path = rawstore.write_raw(
                self.cfg.raw_dir, src.name, now, fetched.request, fetched.payload
            )
            where = path.relative_to(self.cfg.data_dir) if path else "exists, kept the original"
            return f"{fetched.summary} -> {where}"

        return run

    def _has_raw(self, source: str) -> bool:
        return next(rawstore.iter_raw_paths(self.cfg.raw_dir, source), None) is not None

    def _compact_job(self, now: datetime) -> str:
        n = rawstore.compact_before(self.cfg.raw_dir, now.date())
        return f"gzipped {n} raw files from earlier days"

    def _derive(self, now: datetime) -> None:
        t0 = time.monotonic()
        try:
            res = self.derive_fn(self.cfg, now=now)
            ingested = getattr(res, "ingested", {})
            log.info(
                "derive ok in %.1fs: ingested %s -> public/signals.json",
                time.monotonic() - t0,
                ingested or "nothing new",
            )
        except Exception as e:
            log.error("derive FAILED in %.1fs: %s", time.monotonic() - t0, describe_error(e))

    def run_job(self, job: Job, now: datetime) -> bool:
        """Run one job, logging exactly one line. Returns True if it succeeded."""
        t0 = time.monotonic()
        try:
            summary = job.run(now)
        except SourceUnavailable as e:
            if job.name not in self._skip_logged:
                log.warning("%s skipped: %s (will not log this again)", job.name, e)
                self._skip_logged.add(job.name)
            return False
        except SourceSoftFailure as e:
            log.warning(
                "%s no new data in %.1fs: %s; kept the last good data",
                job.name,
                time.monotonic() - t0,
                describe_error(e),
            )
            return False
        except Exception as e:
            # Never log str(e) for HTTP errors: httpx includes the URL and its query string.
            log.error("%s FAILED in %.1fs: %s", job.name, time.monotonic() - t0, describe_error(e))
            return False
        log.info("%s ok in %.1fs: %s", job.name, time.monotonic() - t0, summary)
        return True

    def run_due(self, now: datetime, *, all_jobs: bool = False) -> list[str]:
        """Run every due job (or all of them), then derive if a 5-minute job was among them."""
        ran = []
        derive_needed = False
        for job in self.jobs:
            if all_jobs and not job.at_startup():
                job.next_at = job.next_slot_after(self.clock())
                log.info("%s has data; next run %s UTC", job.name, f"{job.next_at:%Y-%m-%d %H:%M}")
                continue
            if all_jobs or (job.next_at is not None and job.next_at <= now):
                # Stamp each snapshot with its own start time, not the cycle's.
                self.run_job(job, self.clock())
                ran.append(job.name)
                derive_needed |= job.triggers_derive
                job.next_at = job.next_slot_after(self.clock())
        if derive_needed or (all_jobs and ran):
            self._derive(self.clock())
        return ran

    # loop

    def _install_signal_handlers(self) -> None:
        def stop(signum: int, _frame: object) -> None:
            log.info("received signal %s, stopping after the current job", signum)
            self.stopping = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)

    def loop(self, max_cycles: int | None = None, install_signals: bool = True) -> None:
        if install_signals:
            self._install_signal_handlers()
        names = ", ".join(f"{j.name}/{j.period_s // 60}m" for j in self.jobs)
        log.info("collector starting: data_dir=%s jobs=[%s]", self.cfg.data_dir, names)
        self.run_due(self.clock(), all_jobs=True)
        cycles = 0
        while not self.stopping and (max_cycles is None or cycles < max_cycles):
            nxt = min(j.next_at for j in self.jobs if j.next_at is not None)
            # Sleep in short slices so SIGTERM is honoured promptly.
            while not self.stopping:
                remaining = (nxt - self.clock()).total_seconds()
                if remaining <= 0:
                    break
                self.sleep(min(remaining, 5.0))
            if self.stopping:
                break
            self.run_due(self.clock())
            cycles += 1
        log.info("collector stopped")


def backfill(cfg: Config, start: datetime, end: datetime) -> str:
    """One-off: fetch a long Wikipedia range and store it as an ordinary raw snapshot."""
    now = datetime.now(UTC)
    src = WikipediaSource(cfg)
    with make_client(cfg) as client:
        fetched = src.fetch_range(client, now, start.date(), end.date())
    path = rawstore.write_raw(cfg.raw_dir, "wikipedia", now, fetched.request, fetched.payload)
    return f"{fetched.summary} -> {path}"
