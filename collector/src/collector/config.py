"""Runtime configuration, read once from the environment.

Every credential is optional: a source whose credentials are missing is skipped by the
runner (one log line), it never stops the other sources.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

LAUNCH_AT = datetime(2026, 11, 19, 5, 0, 0, tzinfo=UTC)

ALL_SOURCES = ("twitch", "steam", "youtube", "wikipedia", "steam_reviews")

# Hand-curated Take-Two figures, shipped with the package (see that file for sources).
DEFAULT_OFFICIAL_FIGURES = Path(__file__).resolve().parent / "curated" / "official_figures.json"

# Rockstar Games' official uploads, confirmed against YouTube oEmbed on 2026-11-19.
DEFAULT_YOUTUBE_VIDEOS = {
    "QdBZY2fkU-0": "Trailer 1",
    "VQRLujxTm3c": "Trailer 2",
}

# ~30 editions with the largest readerships that carry a GTA VI article. Titles are
# resolved from Wikidata sitelinks at runtime, so only the language codes live here.
DEFAULT_WIKI_LANGS = [
    "en",
    "es",
    "pt",
    "de",
    "ru",
    "fr",
    "ja",
    "pl",
    "it",
    "tr",
    "zh",
    "ko",
    "ar",
    "uk",
    "nl",
    "id",
    "vi",
    "th",
    "fa",
    "hi",
    "he",
    "cs",
    "sv",
    "hu",
    "ro",
    "fi",
    "da",
    "no",
    "el",
    "bg",
]

DEFAULT_CONTACT = "https://github.com/Victor-Nyangi/gta-hype-tracker"


def _csv(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def _divisor_of_24(e: Mapping[str, str], name: str, default: int) -> int:
    n = int(e.get(name) or default)
    if n < 1 or 24 % n:
        raise ValueError(f"{name} must divide 24 (1, 2, 3, 4, 6, 8, 12 or 24)")
    return n


@dataclass(frozen=True)
class Config:
    data_dir: Path
    sources: tuple[str, ...]
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    twitch_game_id: str = ""
    # Safety cap only: launch-week GTA VI can run to a few hundred pages of 100 streams.
    twitch_max_pages: int = 1000
    # Wall-clock budget for one Twitch poll (both categories), inside the 5-minute slot.
    twitch_time_budget_s: float = 210.0
    youtube_api_key: str = ""
    youtube_videos: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_YOUTUBE_VIDEOS))
    wiki_langs: tuple[str, ...] = tuple(DEFAULT_WIKI_LANGS)
    wiki_at_hour_utc: int = 6
    wiki_every_hours: int = 6
    steam_reviews_every_hours: int = 6
    steam_reviews_at_hour_utc: int = 3
    official_figures_path: Path = DEFAULT_OFFICIAL_FIGURES
    contact_url: str = DEFAULT_CONTACT

    @property
    def user_agent(self) -> str:
        # Wikimedia's policy asks for a descriptive UA with a way to reach the operator.
        return f"gta-hype-tracker-collector/0.1 (+{self.contact_url}) httpx"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def public_dir(self) -> Path:
        return self.data_dir / "public"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "signals.duckdb"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Config:
        e = os.environ if env is None else env
        sources = tuple(s for s in _csv(e.get("COLLECTOR_SOURCES")) or ALL_SOURCES)
        unknown = set(sources) - set(ALL_SOURCES)
        if unknown:
            raise ValueError(f"COLLECTOR_SOURCES has unknown sources: {sorted(unknown)}")

        videos = dict(DEFAULT_YOUTUBE_VIDEOS)
        if e.get("YOUTUBE_VIDEO_IDS"):
            # "id" or "id=Label", comma separated.
            videos = {}
            for item in _csv(e["YOUTUBE_VIDEO_IDS"]):
                vid, _, label = item.partition("=")
                videos[vid.strip()] = label.strip() or DEFAULT_YOUTUBE_VIDEOS.get(vid.strip(), vid)

        langs = tuple(_csv(e.get("WIKI_LANGS"))) or tuple(DEFAULT_WIKI_LANGS)

        wiki_every = _divisor_of_24(e, "WIKI_EVERY_HOURS", 6)
        reviews_every = _divisor_of_24(e, "STEAM_REVIEWS_EVERY_HOURS", 6)

        return cls(
            data_dir=Path(e.get("DATA_DIR") or "./data").resolve(),
            sources=sources,
            twitch_client_id=e.get("TWITCH_CLIENT_ID", ""),
            twitch_client_secret=e.get("TWITCH_CLIENT_SECRET", ""),
            twitch_game_id=e.get("TWITCH_GAME_ID", ""),
            twitch_max_pages=int(e.get("TWITCH_MAX_PAGES") or 1000),
            twitch_time_budget_s=float(e.get("TWITCH_TIME_BUDGET_S") or 210),
            youtube_api_key=e.get("YOUTUBE_API_KEY", ""),
            youtube_videos=videos,
            wiki_langs=langs,
            wiki_at_hour_utc=int(e.get("WIKI_AT_HOUR_UTC") or 6),
            wiki_every_hours=wiki_every,
            steam_reviews_every_hours=reviews_every,
            steam_reviews_at_hour_utc=int(e.get("STEAM_REVIEWS_AT_HOUR_UTC") or 3),
            official_figures_path=Path(e.get("OFFICIAL_FIGURES_PATH") or DEFAULT_OFFICIAL_FIGURES),
            contact_url=e.get("CONTACT_URL") or DEFAULT_CONTACT,
        )
