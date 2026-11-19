"""Wikimedia Pageviews for the GTA VI article across language editions.

Titles differ per edition (ja: グランド・セフト・オートVI, ar: جراند ثفت أوتو 6 ...), so they
are resolved from the Wikidata item's sitelinks: the English article's ``pageprops`` gives
the item id, ``wbgetentities`` gives every edition's title. The mapping is cached in
``cache/wiki_titles.json`` and refreshed weekly.

Daily runs fetch a trailing window (pageviews for a day settle a few hours after UTC
midnight, so re-fetching recent days lets derive pick up the final numbers). ``backfill``
fetches a long range once.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ConfigDict

from collector.config import Config
from collector.sources import Fetched

log = logging.getLogger(__name__)

EN_TITLE = "Grand Theft Auto VI"
EN_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
PAGEVIEWS = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
TITLE_CACHE_MAX_AGE = timedelta(days=7)
DAILY_WINDOW_DAYS = 10
BACKFILL_START = date(2022, 2, 1)  # the month Rockstar confirmed VI


# --- API shapes ------------------------------------------------------------------------


class PageviewItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project: str
    article: str
    timestamp: str  # YYYYMMDDHH
    views: int


class PageviewsResponse(BaseModel):
    items: list[PageviewItem] = []


@dataclass(frozen=True)
class WikiDay:
    lang: str
    project: str
    title: str
    day: date
    views: int


def parse_item_id(body: dict[str, Any]) -> str | None:
    pages = (body.get("query") or {}).get("pages") or {}
    for page in pages.values():
        item = (page.get("pageprops") or {}).get("wikibase_item")
        if item:
            return item
    return None


def sitelink_to_lang(site: str) -> str | None:
    """``enwiki`` -> ``en``, ``zh_yuewiki`` -> ``zh-yue``; non-Wikipedia sites -> None."""
    if not site.endswith("wiki") or site in {"commonswiki", "specieswiki", "metawiki"}:
        return None
    code = site.removesuffix("wiki")
    if not code or code.startswith("abstract") or code.endswith(("quote", "news", "voyage")):
        return None
    return code.replace("_", "-")


def parse_sitelinks(body: dict[str, Any], item_id: str) -> dict[str, str]:
    entity = (body.get("entities") or {}).get(item_id) or {}
    out = {}
    for site, link in (entity.get("sitelinks") or {}).items():
        lang = sitelink_to_lang(site)
        if lang:
            out[lang] = link["title"]
    return dict(sorted(out.items()))


def parse_pageviews(lang: str, title: str, body: dict[str, Any]) -> list[WikiDay]:
    return [
        WikiDay(
            lang=lang,
            project=i.project,
            title=title,
            day=datetime.strptime(i.timestamp[:8], "%Y%m%d").date(),
            views=i.views,
        )
        for i in PageviewsResponse.model_validate(body).items
    ]


def parse(payload: dict[str, Any]) -> list[WikiDay]:
    """Payload is ``{"editions": {lang: {"title", "status", "body"}}}``."""
    out: list[WikiDay] = []
    for lang, ed in payload.get("editions", {}).items():
        if ed.get("status") == 200 and ed.get("body"):
            out.extend(parse_pageviews(lang, ed["title"], ed["body"]))
    return out


def article_path(title: str) -> str:
    return quote(title.replace(" ", "_"), safe="")


# --- fetching --------------------------------------------------------------------------


class WikipediaSource:
    name = "wikipedia"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def missing_credentials(self) -> str | None:
        return None

    def _cache_file(self) -> Path:
        return self.cfg.cache_dir / "wiki_titles.json"

    def titles(self, client: httpx.Client, now: datetime) -> tuple[str, dict[str, str]]:
        try:
            cached = json.loads(self._cache_file().read_text())
            resolved = datetime.fromisoformat(cached["resolved_at"])
            if now - resolved < TITLE_CACHE_MAX_AGE and cached["titles"]:
                return cached["item_id"], cached["titles"]
        except (OSError, KeyError, ValueError):
            pass

        r = client.get(
            EN_API,
            params={
                "action": "query",
                "prop": "pageprops",
                "ppprop": "wikibase_item",
                "titles": EN_TITLE,
                "redirects": 1,
                "format": "json",
            },
        )
        r.raise_for_status()
        item_id = parse_item_id(r.json())
        if not item_id:
            raise RuntimeError("wikipedia: could not resolve the Wikidata item for the en article")
        r = client.get(
            WIKIDATA_API,
            params={
                "action": "wbgetentities",
                "ids": item_id,
                "props": "sitelinks",
                "format": "json",
            },
        )
        r.raise_for_status()
        titles = parse_sitelinks(r.json(), item_id)
        p = self._cache_file()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps(
                {"item_id": item_id, "resolved_at": now.isoformat(), "titles": titles},
                ensure_ascii=False,
                indent=1,
            )
        )
        return item_id, titles

    def fetch_range(self, client: httpx.Client, now: datetime, start: date, end: date) -> Fetched:
        item_id, all_titles = self.titles(client, now)
        wanted = list(self.cfg.wiki_langs) if self.cfg.wiki_langs != ("all",) else list(all_titles)
        editions: dict[str, dict[str, Any]] = {}
        missing = [lang for lang in wanted if lang not in all_titles]
        for lang in wanted:
            title = all_titles.get(lang)
            if not title:
                continue
            url = (
                f"{PAGEVIEWS}/{lang}.wikipedia/all-access/user/{article_path(title)}"
                f"/daily/{start:%Y%m%d}/{end:%Y%m%d}"
            )
            try:
                r = client.get(url)
                # 404 means "no data for this range" (e.g. the article is newer than start).
                body = r.json() if r.status_code in (200, 404) else None
                editions[lang] = {"title": title, "status": r.status_code, "body": body}
            except (httpx.HTTPError, ValueError) as e:
                editions[lang] = {"title": title, "status": 0, "body": None, "error": repr(e)}
        ok = sum(1 for e in editions.values() if e["status"] == 200)
        if editions and ok == 0:
            raise RuntimeError("wikipedia: every edition request failed")
        days = parse({"editions": editions})
        return Fetched(
            request={
                "endpoint": PAGEVIEWS,
                "access": "all-access",
                "agent": "user",
                "granularity": "daily",
                "start": start.isoformat(),
                "end": end.isoformat(),
                "item_id": item_id,
                "langs": wanted,
                "langs_without_article": missing,
            },
            payload={"item_id": item_id, "editions": editions},
            summary=f"{ok}/{len(editions)} editions, {len(days)} day-rows, {start}..{end}",
        )

    def fetch(self, client: httpx.Client, now: datetime) -> Fetched:
        today = now.astimezone(UTC).date()
        return self.fetch_range(client, now, today - timedelta(days=DAILY_WINDOW_DAYS), today)
