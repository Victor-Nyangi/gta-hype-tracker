"""YouTube Data API v3: ``videos?part=statistics`` for the GTA VI trailers.

One call per run costs 1 quota unit regardless of how many ids (up to 50) it carries, so
hourly sampling uses 24 of the default 10,000 daily units. The API key is never written to
the raw store: the stored request meta carries the endpoint and ids only. It travels in
the ``X-goog-api-key`` header, not the query string, so it is never part of a logged URL.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict

from collector.config import Config
from collector.http import api_message
from collector.sources import Fetched

URL = "https://www.googleapis.com/youtube/v3/videos"


class VideoStatistics(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # The API returns counts as strings; likes/comments are absent when hidden/disabled.
    viewCount: int
    likeCount: int | None = None
    commentCount: int | None = None


class VideoItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    statistics: VideoStatistics


class VideoListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    items: list[VideoItem] = []


@dataclass(frozen=True)
class VideoStats:
    video_id: str
    label: str
    views: int
    likes: int | None
    comments: int | None


def parse(payload: dict[str, Any], labels: dict[str, str] | None = None) -> list[VideoStats]:
    labels = labels or payload.get("labels") or {}
    body = VideoListResponse.model_validate(payload.get("body") or {})
    return [
        VideoStats(
            video_id=i.id,
            label=labels.get(i.id, i.id),
            views=i.statistics.viewCount,
            likes=i.statistics.likeCount,
            comments=i.statistics.commentCount,
        )
        for i in body.items
    ]


class YouTubeSource:
    name = "youtube"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def missing_credentials(self) -> str | None:
        if not self.cfg.youtube_api_key:
            return "YOUTUBE_API_KEY not set"
        if not self.cfg.youtube_videos:
            return "YOUTUBE_VIDEO_IDS is empty"
        return None

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        ids = list(self.cfg.youtube_videos)
        # The key goes in the X-goog-api-key header rather than ?key=, so it is never part of
        # a URL that could end up in an error message or a log line.
        r = client.get(
            URL,
            params={"part": "statistics", "id": ",".join(ids)},
            headers={"X-goog-api-key": self.cfg.youtube_api_key},
        )
        if r.status_code != 200:
            detail = api_message(r)
            raise RuntimeError(f"youtube: HTTP {r.status_code}" + (f": {detail}" if detail else ""))
        body = r.json()
        stats = parse({"body": body}, self.cfg.youtube_videos)
        return Fetched(
            request={"endpoint": URL, "part": "statistics", "ids": ids},
            payload={"labels": dict(self.cfg.youtube_videos), "body": body},
            summary=", ".join(f"{s.label} {s.views}" for s in stats) or "no items",
        )
