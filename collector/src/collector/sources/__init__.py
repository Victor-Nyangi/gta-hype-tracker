"""Sources. Each module exposes a ``Source`` (fetch -> raw payload) and a typed ``parse``.

Fetching and parsing are deliberately separate: fetch stores the API's response as-is, and
parse turns a stored raw document into typed records. Derive can then be rerun over the
whole raw history whenever the parsing or the analysis changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import httpx


class SourceUnavailable(Exception):
    """Raised by fetch when the source cannot run at all (for example, no credentials)."""


@dataclass
class Fetched:
    request: dict[str, Any]
    payload: Any
    summary: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


class Source(Protocol):
    name: str

    def missing_credentials(self) -> str | None:
        """A human reason if this source cannot run, else None."""
        ...

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched: ...


class SourceSoftFailure(Exception):
    """Raised by fetch when the source answered but had nothing new (for example, a rate
    limit that comes back as HTTP 200). Nothing is stored and the last good data stands."""
