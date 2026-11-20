"""The public contract: ``public/signals.json``.

This model is the single definition of what the site receives. ``collector schema``
exports it to ``collector/schema/signals.schema.json``; the web adapters are typed from
that file. Every section is nullable: a source that has never produced data is ``null``
rather than a fake zero, so the page can show "not tracking yet".

Timestamps are UTC ISO-8601 strings with a ``Z`` suffix.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Twitch ----------------------------------------------------------------------------


class TwitchHourPoint(_Model):
    hour: datetime = Field(description="Start of the UTC hour bucket")
    hours_from_launch: int = Field(description="hour minus launch, in whole hours")
    avg_viewers: int
    max_viewers: int
    samples: int = Field(description="Snapshots that fell in this hour")


class TwitchLanguage(_Model):
    language: str = Field(description="Twitch stream language (ISO 639-1, or 'other')")
    viewers: int
    streams: int
    share: float = Field(description="viewers / total viewers, 0..1")


class TwitchStream(_Model):
    user_login: str
    viewer_count: int
    language: str


class TwitchGameSummary(_Model):
    key: str
    game_id: str
    name: str
    current_viewers: int
    current_streams: int
    peak_viewers: int
    peak_at: datetime


class TwitchSignals(_Model):
    game_id: str
    game_name: str
    tracking_since: datetime = Field(description="First snapshot; nothing before is known")
    updated_at: datetime = Field(description="Latest snapshot")
    current_viewers: int
    current_streams: int
    current_truncated: bool = Field(
        description=(
            "True if the latest snapshot stopped before the last page (safety page cap, time"
            " budget, rate limit or a failing page), so the long tail is not counted"
        )
    )
    peak_viewers: int
    peak_at: datetime
    hours_watched: int = Field(
        description=(
            "Estimate since tracking_since: trapezoid integral of total viewers over time,"
            " skipping gaps longer than 15 minutes"
        )
    )
    hourly: list[TwitchHourPoint]
    by_language: list[TwitchLanguage] = Field(description="Latest snapshot, viewers desc")
    top_streams: list[TwitchStream] = Field(description="Latest snapshot, top 10")
    comparison: list[TwitchGameSummary] = Field(description="Other categories, e.g. GTA V")


# --- Steam -----------------------------------------------------------------------------


class SteamPoint(_Model):
    hour: datetime = Field(description="Start of the UTC hour bucket")
    players: int | None = Field(description="Mean of readings in the hour; null if none")


class SteamGame(_Model):
    key: str = Field(description="Stable id shared with the web (gtav, rdr2, cs2, ...)")
    app_id: int
    name: str
    current_players: int | None
    current_at: datetime | None
    peak_24h: int | None = Field(
        description=(
            "Max single reading in the 24h before generated_at. When peak_24h_partial is true"
            " the readings only go back to peak_24h_since, so this is the max of a shorter window"
        )
    )
    observed_peak: int | None = Field(description="Max single reading since tracking began")
    observed_peak_at: datetime | None
    series_24h: list[SteamPoint] = Field(
        description="Exactly 25 hourly points, oldest first, ending with the current hour",
        min_length=25,
        max_length=25,
    )
    # Added after schema v1 shipped: optional, so older payloads still validate.
    peak_24h_at: datetime | None = Field(
        default=None, description="When the peak_24h reading was taken (earliest, on a tie)"
    )
    peak_24h_since: datetime | None = Field(
        default=None,
        description="Oldest reading inside the 24h window: where peak_24h's window really starts",
    )
    peak_24h_partial: bool = Field(
        default=False,
        description=(
            "True when peak_24h_since is more than 15 minutes after generated_at minus 24h"
            " (tracking began, or resumed after an outage, inside the window), so peak_24h"
            " covers less than 24 hours"
        ),
    )


class SteamSignals(_Model):
    tracking_since: datetime
    updated_at: datetime
    games: list[SteamGame]


# --- YouTube ---------------------------------------------------------------------------


class YouTubeVideo(_Model):
    video_id: str
    label: str
    views: int
    likes: int | None
    comments: int | None
    fetched_at: datetime


class YouTubeSignals(_Model):
    updated_at: datetime
    total_views: int
    videos: list[YouTubeVideo]


# --- Wikipedia -------------------------------------------------------------------------


class WikiEdition(_Model):
    lang: str = Field(description="Wikipedia language code (en, es, zh-yue, ...)")
    project: str = Field(description="e.g. en.wikipedia")
    title: str
    views_last_7d: int
    views_since_launch: int = Field(
        description=(
            "Sum of daily views from launch_day on. 0 while since_launch_pending is true: that"
            " 0 means 'not published yet', not 'no views'"
        )
    )
    latest_day: date | None
    # Added after schema v1 shipped: optional, so older payloads still validate.
    since_launch_pending: bool = Field(
        default=False,
        description=(
            "True while no day from launch_day on has been fetched for this edition (Wikimedia"
            " publishes a day's views some hours after it ends)"
        ),
    )


class WikipediaSignals(_Model):
    updated_at: datetime
    item_id: str | None = Field(description="Wikidata item of the GTA VI article")
    window_end: date = Field(description="Last day included in the 7-day window")
    total_last_7d: int
    total_since_launch: int = Field(
        description=(
            "Sum of views_since_launch. 0 while since_launch_pending is true: that 0 means"
            " 'not published yet', not 'no views'"
        )
    )
    editions: list[WikiEdition] = Field(description="views_last_7d desc")
    # Added after schema v1 shipped: optional, so older payloads still validate.
    launch_day: date | None = Field(
        default=None, description="First UTC day counted in the since-launch sums"
    )
    since_launch_pending: bool = Field(
        default=False,
        description=(
            "True until Wikimedia has published launch_day for any edition. Show 'pending',"
            " not total_since_launch"
        ),
    )


# --- root ------------------------------------------------------------------------------


class Signals(_Model):
    # Every key is always present in the output, so the schema marks them all required.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    schema_version: Literal[1] = SCHEMA_VERSION
    generated_at: datetime
    launch_at: datetime
    twitch: TwitchSignals | None
    steam: SteamSignals | None
    youtube: YouTubeSignals | None
    wikipedia: WikipediaSignals | None


def json_schema() -> dict:
    schema = Signals.model_json_schema(mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = (
        "https://github.com/Victor-Nyangi/gta-hype-tracker/collector/schema/signals.schema.json"
    )
    return schema


def write_schema(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_schema(), indent=2, ensure_ascii=False) + "\n")
