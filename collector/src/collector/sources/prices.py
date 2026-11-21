"""Daily share prices from Alpha Vantage: Take-Two, two peers and a market baseline.

Endpoint: ``TIME_SERIES_DAILY`` (https://www.alphavantage.co/documentation/#daily), one
request per ticker. What the free tier allows, as documented on 2026-11-21:

- ``TIME_SERIES_DAILY`` itself is free; ``TIME_SERIES_DAILY_ADJUSTED`` is premium.
- ``outputsize=compact`` (the latest 100 trading days) is "available to both free and
  premium API keys"; ``outputsize=full`` (20+ years) "is available to premium keys" only.
- A free key gets 25 requests a day (https://www.alphavantage.co/premium/).

So each run asks for ``compact`` (about five months), and history builds up over time:
derive merges every stored snapshot per (ticker, day), the latest fetch winning. One run a
day is 4 requests, well inside 25.

The closes are unadjusted (the adjusted series is premium), so a stock split would show as
a step in the line.

Limits and errors come back as HTTP 200 with no series: ``{"Note": ...}`` or
``{"Information": ...}`` (rate limit, a demo key, a premium-only parameter) and
``{"Error Message": ...}`` (an unknown symbol). Those tickers are recorded with their
message and the rest of the run carries on; derive keeps the last good closes. A run in
which no ticker returned closes raises ``SourceSoftFailure`` and writes nothing.

The key: Alpha Vantage only accepts it as the ``apikey`` query parameter, so it is part of
every request URL. It never reaches the raw store, the logs or an exception: the stored
request meta has no query string, every error is described with ``describe_error`` (which
cuts query strings), and any copy of the key that an API message echoes back is replaced
with ``[redacted]`` before it is stored, logged or raised.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from collector.config import Config
from collector.http import MAX_API_MESSAGE, describe_error, scrub
from collector.sources import Fetched, SourceSoftFailure

URL = "https://www.alphavantage.co/query"
FUNCTION = "TIME_SERIES_DAILY"
OUTPUT_SIZE = "compact"
SERIES_KEY = "Time Series (Daily)"
SOURCE_NAME = "Alpha Vantage"
SOURCE_URL = "https://www.alphavantage.co/"


@dataclass(frozen=True)
class Ticker:
    symbol: str
    name: str
    role: str  # "subject" | "peer" | "baseline"


TICKERS: tuple[Ticker, ...] = (
    Ticker("TTWO", "Take-Two Interactive", "subject"),
    Ticker("EA", "Electronic Arts", "peer"),
    Ticker("SONY", "Sony Group (ADR)", "peer"),
    Ticker("QQQ", "Invesco QQQ Trust (Nasdaq-100)", "baseline"),
)
BY_SYMBOL = {t.symbol: t for t in TICKERS}
SUBJECT = "TTWO"
BASELINE = "QQQ"

# Keys of an HTTP-200 body that carries a message instead of a series.
SOFT_KEYS = ("Note", "Information", "Error Message")

REDACTED = "[redacted]"


class _Bar(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    close: float = Field(alias="4. close", gt=0)


class DailyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
    series: dict[date, _Bar] = Field(alias=SERIES_KEY)


@dataclass(frozen=True)
class DailyClose:
    symbol: str
    day: date
    close: float


def soft_message(body: Any) -> str | None:
    """The message of a 200 that carries no series (rate limit, demo key, unknown symbol)."""
    if not isinstance(body, dict) or SERIES_KEY in body:
        return None
    for key in SOFT_KEYS:
        msg = body.get(key)
        if isinstance(msg, str) and msg.strip():
            return f"{key}: {scrub(msg.strip())[:MAX_API_MESSAGE]}"
    return "no daily series in the response"


def parse_one(symbol: str, body: Any) -> list[DailyClose] | None:
    """Closes, oldest first; None when the body is a soft failure (no series)."""
    if soft_message(body) is not None:
        return None
    resp = DailyResponse.model_validate(body)
    return [DailyClose(symbol, d, bar.close) for d, bar in sorted(resp.series.items())]


def parse(payload: dict[str, Any]) -> dict[str, list[DailyClose]]:
    """Payload is ``{"tickers": {"TTWO": {"status": int, "body": {...} | null}}}``.

    Tickers that failed (HTTP error, not JSON, a soft failure, a series that does not
    validate) are left out, so one bad ticker never hides the others.
    """
    out: dict[str, list[DailyClose]] = {}
    for symbol, entry in (payload.get("tickers") or {}).items():
        if entry.get("status") != 200:
            continue
        try:
            closes = parse_one(symbol, entry.get("body"))
        except ValueError:
            continue
        if closes:
            out[symbol] = closes
    return out


def redact(value: Any, secret: str) -> Any:
    """``value`` with every occurrence of ``secret`` in its strings (and keys) replaced."""
    if not secret:
        return value
    if isinstance(value, str):
        return value.replace(secret, REDACTED)
    if isinstance(value, dict):
        return {redact(k, secret): redact(v, secret) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, secret) for v in value]
    return value


def _status(entry: dict[str, Any]) -> str:
    return f"HTTP {entry['status']}" if entry["status"] != 200 else "unexpected response shape"


class PricesSource:
    name = "prices"

    def __init__(self, cfg: Config, sleep: Callable[[float], None] = time.sleep) -> None:
        self.cfg = cfg
        self.sleep = sleep

    def missing_credentials(self) -> str | None:
        if not self.cfg.alpha_vantage_api_key:
            return "ALPHA_VANTAGE_API_KEY not set"
        return None

    def _get(self, client: httpx.Client, symbol: str) -> dict[str, Any]:
        key = self.cfg.alpha_vantage_api_key
        try:
            r = client.get(
                URL,
                params={
                    "function": FUNCTION,
                    "symbol": symbol,
                    "outputsize": OUTPUT_SIZE,
                    "apikey": key,
                },
            )
            if r.status_code != 200:
                return {"status": r.status_code, "body": None}
            body = redact(r.json(), key)
        except (httpx.HTTPError, ValueError) as e:
            # describe_error never prints a query string; the redact is belt and braces
            return {"status": 0, "body": None, "error": redact(describe_error(e), key)}
        entry: dict[str, Any] = {"status": 200, "body": body}
        msg = soft_message(body)
        if msg is not None:
            entry["soft_failure"] = msg
        return entry

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        tickers: dict[str, dict[str, Any]] = {}
        for i, t in enumerate(TICKERS):
            if i:
                self.sleep(self.cfg.prices_request_gap_s)
            tickers[t.symbol] = self._get(client, t.symbol)
        payload = {"tickers": tickers}
        closes = parse(payload)
        problems = "; ".join(
            f"{s} {e.get('soft_failure') or e.get('error') or _status(e)}"
            for s, e in tickers.items()
            if s not in closes
        )
        if not closes:
            # Nothing new: no raw file, and the closes already stored stay as they are.
            raise SourceSoftFailure(f"no ticker returned closes ({problems})")
        latest = {s: c[-1] for s, c in closes.items()}
        head = latest.get(SUBJECT)
        summary = f"{len(closes)}/{len(TICKERS)} tickers"
        if head:
            summary += f"; {SUBJECT} {head.close:.2f} ({head.day})"
        if problems:
            summary += f"; missing: {problems}"
        return Fetched(
            # No apikey here: the request meta never carries the query string.
            request={
                "endpoint": URL,
                "function": FUNCTION,
                "outputsize": OUTPUT_SIZE,
                "symbols": [t.symbol for t in TICKERS],
            },
            payload=payload,
            summary=summary,
        )
