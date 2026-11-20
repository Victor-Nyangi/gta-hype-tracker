"""Twitch Helix: live streams in the GTA VI category (and GTA V for comparison).

Auth is an app access token from the client-credentials flow. The GTA VI game id is
resolved once by name and cached in ``cache/twitch_games.json`` (override with
``TWITCH_GAME_ID``). GTA V's id (32982) has been stable for a decade, so it is a constant.

Helix returns streams sorted by viewer count, 100 per page, with a cursor. A poll pages
until the cursor runs out, so every stream in the category is counted. Three things can
stop it early, and each marks the snapshot ``truncated`` (with a ``truncated_reason``):

- ``page_cap``: ``TWITCH_MAX_PAGES`` (default 1000 pages = 100k streams), a safety cap
  well above launch-week reality, not a sampling limit;
- ``time_budget``: ``TWITCH_TIME_BUDGET_S`` (default 210 s) for the whole poll, so a poll
  never runs into the next 5-minute slot;
- ``rate_limit`` or ``error``: the bucket would not refill inside the budget, or a later
  page kept failing after a retry.

Rate limits: the app-token bucket is 800 points a minute and every request costs one.
Each response carries ``Ratelimit-Remaining`` and ``Ratelimit-Reset`` (epoch seconds);
before the next request, if fewer than ``RATELIMIT_FLOOR`` points remain we sleep until
the reset. A 429 waits the same way and retries the same cursor.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict

from collector.config import Config
from collector.http import describe_error
from collector.sources import Fetched, SourceUnavailable

log = logging.getLogger(__name__)

HELIX = "https://api.twitch.tv/helix"
TOKEN_URL = "https://id.twitch.tv/oauth2/token"

GTA6_NAME = "Grand Theft Auto VI"
GTAV_NAME = "Grand Theft Auto V"
GTAV_GAME_ID = "32982"

# Stop paging when this few points remain; wait for the bucket to refill instead.
RATELIMIT_FLOOR = 10
MAX_RATELIMIT_WAIT_S = 65.0
# Attempts per request: 401 refreshes the token once, 429 waits for the reset, 5xx and
# transport errors are retried once.
MAX_ATTEMPTS = 4


class RateLimited(Exception):
    """The bucket would not refill before the poll's deadline."""


# --- API shapes ------------------------------------------------------------------------


class HelixStream(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    user_id: str
    user_login: str
    user_name: str = ""
    game_id: str = ""
    game_name: str = ""
    type: str = "live"
    viewer_count: int
    language: str = ""
    started_at: str = ""


class HelixStreamsPage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: list[HelixStream]
    pagination: dict[str, Any] = {}


class HelixGame(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str


class HelixGamesResponse(BaseModel):
    data: list[HelixGame]


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    access_token: str
    expires_in: int
    token_type: str = "bearer"


# --- parsed records --------------------------------------------------------------------


@dataclass(frozen=True)
class TopStream:
    user_login: str
    viewer_count: int
    language: str


@dataclass(frozen=True)
class LanguageCount:
    viewers: int
    streams: int


@dataclass(frozen=True)
class TwitchGameSnapshot:
    game_key: str
    game_id: str
    game_name: str
    total_viewers: int
    stream_count: int
    pages: int
    truncated: bool
    by_language: dict[str, LanguageCount] = field(default_factory=dict)
    top_streams: list[TopStream] = field(default_factory=list)


@dataclass(frozen=True)
class StreamPages:
    pages: list[dict[str, Any]]
    truncated: bool
    reason: str | None  # page_cap | time_budget | rate_limit | error | None


def parse_streams_pages(
    game_key: str, game_id: str, game_name: str, pages: list[dict[str, Any]], truncated: bool
) -> TwitchGameSnapshot:
    """Aggregate raw /streams pages. Streams are de-duplicated by id: the ranking shifts
    while we page, so the same stream can appear on two pages."""
    seen: dict[str, HelixStream] = {}
    for raw in pages:
        for s in HelixStreamsPage.model_validate(raw).data:
            if s.id not in seen or s.viewer_count > seen[s.id].viewer_count:
                seen[s.id] = s
    streams = sorted(seen.values(), key=lambda s: (-s.viewer_count, s.user_login))

    by_lang: dict[str, list[int]] = {}
    for s in streams:
        acc = by_lang.setdefault(s.language or "other", [0, 0])
        acc[0] += s.viewer_count
        acc[1] += 1

    return TwitchGameSnapshot(
        game_key=game_key,
        game_id=game_id,
        game_name=game_name,
        total_viewers=sum(s.viewer_count for s in streams),
        stream_count=len(streams),
        pages=len(pages),
        truncated=truncated,
        by_language={
            k: LanguageCount(viewers=v[0], streams=v[1])
            for k, v in sorted(by_lang.items(), key=lambda kv: -kv[1][0])
        },
        top_streams=[TopStream(s.user_login, s.viewer_count, s.language) for s in streams[:10]],
    )


def parse(payload: dict[str, Any]) -> list[TwitchGameSnapshot]:
    """Parse a stored twitch snapshot payload into one record per sampled game."""
    out = []
    for key, game in payload.get("games", {}).items():
        out.append(
            parse_streams_pages(
                key,
                str(game["game_id"]),
                game.get("game_name", ""),
                game.get("pages", []),
                bool(game.get("truncated", False)),
            )
        )
    return out


def parse_game_id(body: dict[str, Any], name: str) -> str | None:
    for g in HelixGamesResponse.model_validate(body).data:
        if g.name.casefold() == name.casefold():
            return g.id
    return None


# --- fetching --------------------------------------------------------------------------


class TwitchSource:
    name = "twitch"

    def __init__(
        self,
        cfg: Config,
        *,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.cfg = cfg
        self.sleep = sleep
        self.clock = clock
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._game_ids: dict[str, str] | None = None
        self._remaining: int | None = None
        self._reset_at: float | None = None

    def missing_credentials(self) -> str | None:
        if not (self.cfg.twitch_client_id and self.cfg.twitch_client_secret):
            return "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set"
        return None

    # auth

    def _get_token(self, client: httpx.Client) -> str:
        if self._token and self.clock() < self._token_expires_at - 300:
            return self._token
        # Credentials go in the form body, never the query string: httpx error messages
        # carry the full URL, and those messages end up in the logs.
        r = client.post(
            TOKEN_URL,
            data={
                "client_id": self.cfg.twitch_client_id,
                "client_secret": self.cfg.twitch_client_secret,
                "grant_type": "client_credentials",
            },
        )
        r.raise_for_status()
        tok = TokenResponse.model_validate(r.json())
        self._token = tok.access_token
        self._token_expires_at = self.clock() + tok.expires_in
        return self._token

    def _helix(
        self,
        client: httpx.Client,
        path: str,
        params: dict[str, Any],
        deadline: float | None = None,
    ) -> httpx.Response:
        """One Helix GET, paced by the rate-limit headers of the previous response.

        Raises ``RateLimited`` when honouring the limit would overrun ``deadline``, and
        ``httpx.HTTPError`` when the request keeps failing.
        """
        retried_5xx = False
        refreshed = False
        for _ in range(MAX_ATTEMPTS):
            self._pace(deadline)
            headers = {
                "Client-Id": self.cfg.twitch_client_id,
                "Authorization": f"Bearer {self._get_token(client)}",
            }
            try:
                r = client.get(f"{HELIX}{path}", params=params, headers=headers)
            except httpx.TransportError:
                if retried_5xx:
                    raise
                retried_5xx = True
                continue
            self._note_ratelimit(r)
            if r.status_code == 401 and not refreshed:
                refreshed = True
                self._token = None  # expired or revoked: get a fresh one and retry once
                continue
            if r.status_code == 429:
                self._remaining = 0  # make the next _pace wait for the reset
                continue
            if r.status_code >= 500 and not retried_5xx:
                retried_5xx = True
                continue
            r.raise_for_status()
            return r
        if r.status_code == 429:
            raise RateLimited("still rate limited after waiting for the reset")
        r.raise_for_status()
        return r

    def _note_ratelimit(self, r: httpx.Response) -> None:
        remaining = r.headers.get("Ratelimit-Remaining")
        reset = r.headers.get("Ratelimit-Reset")
        try:
            self._remaining = int(remaining) if remaining is not None else None
        except ValueError:
            self._remaining = None
        try:
            self._reset_at = float(reset) if reset is not None else None
        except ValueError:
            self._reset_at = None

    def _pace(self, deadline: float | None) -> None:
        """Before a request: if the bucket is nearly empty, sleep until it resets."""
        if self._remaining is None or self._remaining >= RATELIMIT_FLOOR:
            return
        now = self.clock()
        wait = max(0.0, self._reset_at - now) if self._reset_at is not None else 5.0
        wait = min(wait + 0.5, MAX_RATELIMIT_WAIT_S)
        if deadline is not None and now + wait > deadline:
            raise RateLimited(f"bucket resets in {wait:.1f}s, past the poll's time budget")
        log.info("twitch: rate limit low (%s left), waiting %.1fs", self._remaining, wait)
        self.sleep(wait)
        self._remaining = None  # unknown until the next response says otherwise

    # game ids

    def _cache_file(self) -> Path:
        return self.cfg.cache_dir / "twitch_games.json"

    def game_ids(self, client: httpx.Client) -> dict[str, str]:
        if self._game_ids:
            return self._game_ids
        ids = {"gtav": GTAV_GAME_ID}
        if self.cfg.twitch_game_id:
            ids["gta6"] = self.cfg.twitch_game_id
        else:
            cached = self._read_cache()
            if cached:
                ids["gta6"] = cached
            else:
                r = self._helix(client, "/games", {"name": GTA6_NAME})
                gid = parse_game_id(r.json(), GTA6_NAME)
                if not gid:
                    raise SourceUnavailable(f"twitch has no category named {GTA6_NAME!r} yet")
                self._write_cache(gid)
                ids["gta6"] = gid
        self._game_ids = ids
        return ids

    def _read_cache(self) -> str | None:
        try:
            return json.loads(self._cache_file().read_text())["gta6"]
        except (OSError, KeyError, ValueError):
            return None

    def _write_cache(self, gid: str) -> None:
        p = self._cache_file()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps(
                {"gta6": gid, "name": GTA6_NAME, "resolved_at": datetime.now(UTC).isoformat()}
            )
        )

    # streams

    def fetch_streams(
        self, client: httpx.Client, game_id: str, deadline: float | None = None
    ) -> StreamPages:
        """Every page of one category, unless the page cap, the deadline, the rate limit
        or a failing request stops it first (then ``truncated`` says so, and why)."""
        pages: list[dict] = []
        cursor: str | None = None
        while True:
            params: dict[str, Any] = {"game_id": game_id, "first": 100}
            if cursor:
                params["after"] = cursor
            try:
                body = self._helix(client, "/streams", params, deadline).json()
            except RateLimited:
                if not pages:
                    raise
                return StreamPages(pages, True, "rate_limit")
            except (httpx.HTTPError, ValueError) as e:
                if not pages:
                    raise
                # describe_error, never str(e): httpx messages carry the URL and its query.
                log.warning(
                    "twitch: page %d failed (%s); keeping the %d pages before it",
                    len(pages) + 1,
                    describe_error(e),
                    len(pages),
                )
                return StreamPages(pages, True, "error")
            pages.append(body)
            cursor = (body.get("pagination") or {}).get("cursor")
            if not cursor or not body.get("data"):
                return StreamPages(pages, False, None)
            if len(pages) >= self.cfg.twitch_max_pages:
                return StreamPages(pages, True, "page_cap")
            if deadline is not None and self.clock() >= deadline:
                return StreamPages(pages, True, "time_budget")

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        started = self.clock()
        deadline = started + self.cfg.twitch_time_budget_s
        ids = self.game_ids(client)
        names = {"gta6": GTA6_NAME, "gtav": GTAV_NAME}
        games: dict[str, dict[str, Any]] = {}
        # GTA V first: a handful of pages, so a long GTA VI poll cannot starve it.
        for key in ("gtav", "gta6"):
            t0 = self.clock()
            res = self.fetch_streams(client, ids[key], deadline)
            games[key] = {
                "game_id": ids[key],
                "game_name": names[key],
                "pages": res.pages,
                "truncated": res.truncated,
                "truncated_reason": res.reason,
                "elapsed_s": round(self.clock() - t0, 1),
            }
        games = {"gta6": games["gta6"], "gtav": games["gtav"]}
        snaps = {s.game_key: s for s in parse({"games": games})}
        g6 = snaps["gta6"]
        why = f", truncated: {games['gta6']['truncated_reason']}" if g6.truncated else ""
        return Fetched(
            request={
                "endpoint": f"{HELIX}/streams",
                "game_ids": ids,
                "first": 100,
                "max_pages": self.cfg.twitch_max_pages,
                "time_budget_s": self.cfg.twitch_time_budget_s,
            },
            payload={"games": games},
            summary=(
                f"gta6 {g6.total_viewers} viewers / {g6.stream_count} streams "
                f"({g6.pages} pages in {games['gta6']['elapsed_s']}s{why}); "
                f"gtav {snaps['gtav'].total_viewers}"
            ),
        )
