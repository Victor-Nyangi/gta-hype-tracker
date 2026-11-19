"""Fetch logic against httpx.MockTransport: no live calls to keyed APIs."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest
from conftest import load

from collector.config import Config
from collector.http import make_client
from collector.sources.steam import SteamSource
from collector.sources.twitch import TwitchSource
from collector.sources.wikipedia import WikipediaSource
from collector.sources.youtube import YouTubeSource

NOW = datetime(2026, 11, 19, 21, 0, tzinfo=UTC)


class Recorder:
    def __init__(self, handler):
        self.handler = handler
        self.calls: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return self.handler(request)


def twitch_handler(remaining: str = "799", *, fail_first_streams_401: bool = False):
    state = {"401_sent": False}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.host == "id.twitch.tv":
            assert parse_qs(req.content.decode())["grant_type"] == ["client_credentials"]
            assert req.url.query == b""
            return httpx.Response(200, json=load("twitch_token.json"))
        assert req.headers["Client-Id"] == "test-client"
        assert req.headers["Authorization"].startswith("Bearer ")
        hdrs = {"Ratelimit-Remaining": remaining, "Ratelimit-Reset": "1795640000"}
        if req.url.path == "/helix/games":
            assert req.url.params["name"] == "Grand Theft Auto VI"
            return httpx.Response(200, json=load("twitch_games.json"), headers=hdrs)
        if req.url.path == "/helix/streams":
            if fail_first_streams_401 and not state["401_sent"]:
                state["401_sent"] = True
                return httpx.Response(401, json={"error": "Unauthorized"})
            gid = req.url.params["game_id"]
            if gid == "32982":
                return httpx.Response(200, json=load("twitch_streams_gtav.json"), headers=hdrs)
            page = "page2" if req.url.params.get("after") else "page1"
            return httpx.Response(200, json=load(f"twitch_streams_gta6_{page}.json"), headers=hdrs)
        return httpx.Response(404)

    return handler


def test_twitch_fetch_pages_and_caches_game_id(cfg: Config):
    rec = Recorder(twitch_handler())
    src = TwitchSource(cfg, sleep=lambda s: None, clock=lambda: 1795639000.0)
    with make_client(cfg, httpx.MockTransport(rec)) as client:
        f = src.fetch(client, NOW)
    g6 = f.payload["games"]["gta6"]
    assert g6["game_id"] == "123456789" and len(g6["pages"]) == 2 and g6["truncated"] is False
    assert "gta6 " in f.summary and "20 streams" in f.summary
    assert json.loads((cfg.cache_dir / "twitch_games.json").read_text())["gta6"] == "123456789"
    # a new process reuses the cache instead of calling /games again
    rec2 = Recorder(twitch_handler())
    with make_client(cfg, httpx.MockTransport(rec2)) as client:
        TwitchSource(cfg, sleep=lambda s: None).fetch(client, NOW)
    assert not any(c.url.path == "/helix/games" for c in rec2.calls)
    assert "test-secret" not in json.dumps(f.request) + json.dumps(f.payload)


def test_twitch_game_id_override_and_page_cap(tmp_path):
    cfg = Config.from_env(
        {
            "DATA_DIR": str(tmp_path),
            "TWITCH_CLIENT_ID": "test-client",
            "TWITCH_CLIENT_SECRET": "s",
            "TWITCH_GAME_ID": "555",
            "TWITCH_MAX_PAGES": "1",
        }
    )
    rec = Recorder(twitch_handler())
    with make_client(cfg, httpx.MockTransport(rec)) as client:
        f = TwitchSource(cfg, sleep=lambda s: None).fetch(client, NOW)
    assert not any(c.url.path == "/helix/games" for c in rec.calls)
    assert f.payload["games"]["gta6"]["game_id"] == "555"
    assert f.payload["games"]["gta6"]["truncated"] is True


def test_twitch_waits_when_ratelimit_low(cfg: Config):
    slept: list[float] = []
    src = TwitchSource(cfg, sleep=slept.append, clock=lambda: 1795639990.0)
    with make_client(cfg, httpx.MockTransport(twitch_handler(remaining="3"))) as client:
        src.fetch(client, NOW)
    assert slept and all(0 < s <= 65 for s in slept)


def test_twitch_refreshes_token_on_401(cfg: Config):
    rec = Recorder(twitch_handler(fail_first_streams_401=True))
    with make_client(cfg, httpx.MockTransport(rec)) as client:
        TwitchSource(cfg, sleep=lambda s: None).fetch(client, NOW)
    assert sum(1 for c in rec.calls if c.url.host == "id.twitch.tv") == 2


def test_twitch_unknown_category_is_unavailable(cfg: Config):
    from collector.sources import SourceUnavailable

    def handler(req):
        if req.url.host == "id.twitch.tv":
            return httpx.Response(200, json=load("twitch_token.json"))
        return httpx.Response(200, json=load("twitch_games_empty.json"))

    with make_client(cfg, httpx.MockTransport(handler)) as client, pytest.raises(SourceUnavailable):
        TwitchSource(cfg, sleep=lambda s: None).fetch(client, NOW)


def test_missing_credentials(tmp_path):
    bare = Config.from_env({"DATA_DIR": str(tmp_path)})
    assert TwitchSource(bare).missing_credentials()
    assert YouTubeSource(bare).missing_credentials()
    assert SteamSource(bare).missing_credentials() is None
    assert WikipediaSource(bare).missing_credentials() is None


def test_youtube_never_stores_the_key(cfg: Config):
    def handler(req):
        assert req.headers["X-goog-api-key"] == "test-yt-key"
        assert "key" not in req.url.params
        assert req.url.params["id"] == "QdBZY2fkU-0,VQRLujxTm3c"
        return httpx.Response(200, json=load("youtube_videos.json"))

    with make_client(cfg, httpx.MockTransport(handler)) as client:
        f = YouTubeSource(cfg).fetch(client, NOW)
    blob = json.dumps({"r": f.request, "p": f.payload, "s": f.summary})
    assert "test-yt-key" not in blob
    assert "Trailer 1 271403118" in f.summary


def test_youtube_error_does_not_leak_key(cfg: Config):
    def handler(req):
        return httpx.Response(403, json=load("youtube_error_quota.json"))

    with (
        make_client(cfg, httpx.MockTransport(handler)) as client,
        pytest.raises(RuntimeError) as ei,
    ):
        YouTubeSource(cfg).fetch(client, NOW)
    assert "test-yt-key" not in str(ei.value)


def test_steam_fetch_tolerates_a_failing_app(cfg: Config):
    def handler(req):
        if req.url.params["appid"] == "730":
            return httpx.Response(503)
        return httpx.Response(200, json=load("steam_1086940.json"))

    with make_client(cfg, httpx.MockTransport(handler)) as client:
        f = SteamSource(cfg).fetch(client, NOW)
    assert f.payload["apps"]["730"]["status"] == 503
    assert f.payload["apps"]["271590"]["body"]["response"]["player_count"] == 30018


def test_wikipedia_resolves_titles_and_fetches_editions(cfg: Config):
    rec = Recorder(lambda req: _wiki(req))
    with make_client(cfg, httpx.MockTransport(rec)) as client:
        f = WikipediaSource(cfg).fetch(client, NOW)
    eds = f.payload["editions"]
    assert set(eds) == {"en", "ja", "sah"}  # xx has no article
    assert f.request["langs_without_article"] == ["xx"]
    assert eds["sah"]["status"] == 404
    assert f.request["start"] == "2026-11-09" and f.request["end"] == "2026-11-19"
    assert all(c.headers["User-Agent"].startswith("gta-hype-tracker-collector/") for c in rec.calls)
    ja_call = next(c for c in rec.calls if "ja.wikipedia" in str(c.url))
    assert "/daily/20261109/20261119" in str(ja_call.url)
    # titles are cached: a second run calls neither the en API nor Wikidata
    rec2 = Recorder(lambda req: _wiki(req))
    with make_client(cfg, httpx.MockTransport(rec2)) as client:
        WikipediaSource(cfg).fetch(client, NOW)
    assert not any(c.url.host in {"en.wikipedia.org", "www.wikidata.org"} for c in rec2.calls)


def _wiki(req: httpx.Request) -> httpx.Response:
    if req.url.host == "en.wikipedia.org":
        return httpx.Response(200, json=load("wiki_pageprops.json"))
    if req.url.host == "www.wikidata.org":
        return httpx.Response(200, json=load("wikidata_sitelinks.json"))
    path = req.url.path
    if "/en.wikipedia/" in path:
        return httpx.Response(200, json=load("wiki_pageviews_en.json"))
    if "/ja.wikipedia/" in path:
        return httpx.Response(200, json=load("wiki_pageviews_ja.json"))
    return httpx.Response(404, json=load("wiki_pageviews_404.json"))
