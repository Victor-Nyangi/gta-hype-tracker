"""Steam current players (``ISteamUserStats/GetNumberOfCurrentPlayers``). No key needed.

GTA VI is console-only, so Steam is the comparison set: what everyone else is playing.
GTA V is split across two Steam apps since March 2025 (Legacy 271590 and Enhanced
3240220); both are sampled so the page can show either or their sum.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict

from collector.config import Config
from collector.sources import Fetched

URL = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/"


@dataclass(frozen=True)
class SteamGame:
    key: str
    app_id: int
    name: str


# Keys match the prototype's GAMES ids so the web adapters can join on them.
GAMES: tuple[SteamGame, ...] = (
    SteamGame("gtav", 271590, "Grand Theft Auto V"),
    SteamGame("rdr2", 1174180, "Red Dead Redemption 2"),
    SteamGame("cs2", 730, "Counter-Strike 2"),
    SteamGame("cp77", 1091500, "Cyberpunk 2077"),
    SteamGame("er", 1245620, "Elden Ring"),
    SteamGame("bg3", 1086940, "Baldur's Gate 3"),
    SteamGame("gtav_enhanced", 3240220, "Grand Theft Auto V Enhanced"),
)
BY_APP = {g.app_id: g for g in GAMES}


class _Inner(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_count: int | None = None
    result: int


class CurrentPlayersResponse(BaseModel):
    response: _Inner


@dataclass(frozen=True)
class SteamReading:
    app_id: int
    key: str
    name: str
    player_count: int | None  # None when Steam answered but without a count


def parse_one(app_id: int, body: dict[str, Any]) -> SteamReading:
    inner = CurrentPlayersResponse.model_validate(body).response
    game = BY_APP.get(app_id, SteamGame(str(app_id), app_id, str(app_id)))
    count = inner.player_count if inner.result == 1 else None
    return SteamReading(app_id, game.key, game.name, count)


def parse(payload: dict[str, Any]) -> list[SteamReading]:
    """Payload is ``{"apps": {"<appid>": {"status": int, "body": {...} | null}}}``."""
    out = []
    for app_id_s, entry in payload.get("apps", {}).items():
        if entry.get("status") != 200 or not entry.get("body"):
            continue
        out.append(parse_one(int(app_id_s), entry["body"]))
    return out


class SteamSource:
    name = "steam"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def missing_credentials(self) -> str | None:
        return None

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        apps: dict[str, dict[str, Any]] = {}
        for g in GAMES:
            try:
                r = client.get(URL, params={"appid": g.app_id})
                body = r.json() if r.status_code == 200 else None
                apps[str(g.app_id)] = {"status": r.status_code, "body": body}
            except (httpx.HTTPError, ValueError) as e:
                apps[str(g.app_id)] = {"status": 0, "body": None, "error": repr(e)}
        ok = sum(1 for a in apps.values() if a["status"] == 200)
        if ok == 0:
            raise RuntimeError("steam: every app request failed")
        readings = {r.key: r.player_count for r in parse({"apps": apps})}
        return Fetched(
            request={"endpoint": URL, "app_ids": [g.app_id for g in GAMES]},
            payload={"apps": apps},
            summary=(
                f"{ok}/{len(GAMES)} apps; gtav {readings.get('gtav')}, cs2 {readings.get('cs2')}"
            ),
        )
