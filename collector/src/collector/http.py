"""Shared HTTP client."""

from __future__ import annotations

import httpx

from collector.config import Config


def make_client(cfg: Config, transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": cfg.user_agent, "Accept": "application/json"},
        timeout=httpx.Timeout(20.0, connect=10.0),
        follow_redirects=True,
        transport=transport,
    )
