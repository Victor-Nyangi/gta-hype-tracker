"""Steam user-review counts, as a rough sales signal. No key needed.

Endpoint: the store's review histogram, ``store.steampowered.com/appreviewhistogram/<appid>``
(the JSON behind the review graph on every store page). It returns

- ``rollups``: positive/negative review counts per month (per week for young apps) since the
  app's first review, so their sum is the app's all-time review count, and
- ``recent``: the same per UTC day for the last 30 days.

The usual ``/appreviews/<appid>?json=1`` endpoint (``query_summary.total_reviews``) was tried
first, on 2026-11-20: it answered every request with a 302 to the store's front page. The
histogram counts every review regardless of language (its ``l`` parameter is only the UI
language: ``english`` and ``german`` return identical counts).

Reviews -> sales is the "Boxleiter method": the number of owners is some multiple of the
review count. Published multiples vary a lot, so the estimate is a range, never one number:

- Jake Birkett, "Using Steam reviews to estimate sales" (Game Developer, 2018-05-04):
  30x to 150x for premium indie games, median 64x-77x.
  https://www.gamedeveloper.com/business/using-steam-reviews-to-estimate-sales
- Karl Kontus (VG Insights), "How to estimate Steam video game sales in 2021" (Game
  Developer, 2021-08-02): 20x to 55x for games released from 2020, around 30x typical;
  higher-priced games tend to sit lower.
  https://gamedeveloper.com/business/how-to-estimate-steam-video-game-sales-in-2021-

``ESTIMATE_LOW`` / ``ESTIMATE_HIGH`` (30x, 55x) are where those two ranges overlap. The
method does not apply to free-to-play games (CS2) or to a free upgrade for existing owners
(GTA V Enhanced), so those get no estimate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict

from collector.config import Config
from collector.http import describe_error
from collector.sources import Fetched
from collector.sources.steam import GAMES, SteamGame

URL = "https://store.steampowered.com/appreviewhistogram/{app_id}"
PARAMS = {"l": "english", "review_score_preference": "0"}

ESTIMATE_LOW = 30
ESTIMATE_HIGH = 55
METHOD_NAME = "Boxleiter method: estimated sales = all-time Steam reviews x 30 to x 55"
METHOD_SOURCES = (
    "https://www.gamedeveloper.com/business/using-steam-reviews-to-estimate-sales",
    "https://gamedeveloper.com/business/how-to-estimate-steam-video-game-sales-in-2021-",
)

# Why an app gets no sales estimate. Keys are app ids.
NO_ESTIMATE: dict[int, str] = {
    730: "Free to play: reviews do not track sales",
    3240220: "A free upgrade for GTA V owners: its reviews are not new sales",
}

RECENT_DAYS = 7


class _Bucket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    date: int  # unix seconds, start of the UTC month/week/day
    recommendations_up: int
    recommendations_down: int


class _Results(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rollups: list[_Bucket]
    recent: list[_Bucket] | None = None


class HistogramResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    success: int
    results: _Results


@dataclass(frozen=True)
class ReviewReading:
    app_id: int
    key: str
    name: str
    positive: int
    negative: int
    # Reviews posted in the RECENT_DAYS complete UTC days before the fetch day; None when the
    # response had no daily ``recent`` block.
    new_last_7d: int | None

    @property
    def total(self) -> int:
        return self.positive + self.negative


def estimate_range(total_reviews: int, app_id: int) -> tuple[int, int] | None:
    """(low, high) estimated copies sold, or None where the method does not apply."""
    if app_id in NO_ESTIMATE or total_reviews <= 0:
        return None
    return total_reviews * ESTIMATE_LOW, total_reviews * ESTIMATE_HIGH


def _day(ts: int) -> date:
    return datetime.fromtimestamp(ts, tz=UTC).date()


def parse_one(app_id: int, body: dict[str, Any], fetched_on: date) -> ReviewReading | None:
    """None when Steam answered without data (``success`` other than 1)."""
    resp = HistogramResponse.model_validate(body)
    if resp.success != 1:
        return None
    game = next((g for g in GAMES if g.app_id == app_id), SteamGame(str(app_id), app_id, ""))
    pos = sum(b.recommendations_up for b in resp.results.rollups)
    neg = sum(b.recommendations_down for b in resp.results.rollups)
    new = None
    if resp.results.recent is not None:
        first = fetched_on - timedelta(days=RECENT_DAYS)
        new = sum(
            b.recommendations_up + b.recommendations_down
            for b in resp.results.recent
            if first <= _day(b.date) < fetched_on
        )
    return ReviewReading(app_id, game.key, game.name or str(app_id), pos, neg, new)


def parse(payload: dict[str, Any], fetched_on: date) -> list[ReviewReading]:
    """Payload is ``{"apps": {"<appid>": {"status": int, "body": {...} | null}}}``."""
    out = []
    for app_id_s, entry in payload.get("apps", {}).items():
        if entry.get("status") != 200 or not isinstance(entry.get("body"), dict):
            continue
        r = parse_one(int(app_id_s), entry["body"], fetched_on)
        if r is not None:
            out.append(r)
    return out


class SteamReviewsSource:
    name = "steam_reviews"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def missing_credentials(self) -> str | None:
        return None

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        apps: dict[str, dict[str, Any]] = {}
        for g in GAMES:
            try:
                r = client.get(URL.format(app_id=g.app_id), params=PARAMS)
                body = r.json() if r.status_code == 200 else None
                apps[str(g.app_id)] = {"status": r.status_code, "body": body}
            except (httpx.HTTPError, ValueError) as e:
                # ValueError: a 200 that is not JSON (e.g. an HTML page after a redirect)
                apps[str(g.app_id)] = {"status": 0, "body": None, "error": describe_error(e)}
        readings = parse({"apps": apps}, now.astimezone(UTC).date())
        if not readings:
            raise RuntimeError("steam_reviews: no app returned review counts")
        by_key = {r.key: r.total for r in readings}
        return Fetched(
            request={"endpoint": URL, "params": PARAMS, "app_ids": [g.app_id for g in GAMES]},
            payload={"apps": apps},
            summary=(
                f"{len(readings)}/{len(GAMES)} apps; gtav {by_key.get('gtav')} reviews,"
                f" bg3 {by_key.get('bg3')}"
            ),
        )
