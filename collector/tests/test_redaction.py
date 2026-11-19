"""Credentials must never reach the logs, even when an upstream call fails.

httpx puts the full request URL in its exception messages. Twitch's token call used to send
client_id/client_secret as query params, so a 400 from id.twitch.tv logged the secret.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import pytest

from collector.config import Config
from collector.http import describe_error, make_client, redact_url, scrub
from collector.runner import Runner
from collector.sources import Fetched
from collector.sources.twitch import TOKEN_URL, TwitchSource
from collector.sources.youtube import YouTubeSource

NOW = datetime(2026, 11, 19, 21, 0, tzinfo=UTC)
CLIENT_ID = "cid-DO-NOT-LOG-1a2b3c"
SECRET = "s3cr3t-DO-NOT-LOG-9f8e7d"
YT_KEY = "AIza-yt-DO-NOT-LOG-77aa"


@pytest.fixture
def keyed(tmp_path) -> Config:
    return Config.from_env(
        {
            "DATA_DIR": str(tmp_path / "data"),
            "TWITCH_CLIENT_ID": CLIENT_ID,
            "TWITCH_CLIENT_SECRET": SECRET,
            "YOUTUBE_API_KEY": YT_KEY,
        }
    )


def run_once(cfg: Config, source, handler, caplog) -> str:
    """Run one source job through the real runner against a mock transport; return the log."""
    runner = Runner(
        cfg,
        [source],
        client=make_client(cfg, httpx.MockTransport(handler)),
        clock=lambda: NOW,
        sleep=lambda s: None,
        derive_fn=lambda c, now: None,
    )
    job = next(j for j in runner.jobs if j.name == source.name)
    with caplog.at_level(logging.INFO, logger="collector"):
        assert runner.run_job(job, NOW) is False
    return caplog.text


def assert_no_credentials(text: str) -> None:
    for value in (CLIENT_ID, SECRET, YT_KEY):
        assert value not in text


# --- Twitch token request ------------------------------------------------------------------


def test_twitch_token_request_sends_credentials_in_the_body(keyed: Config):
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})

    with make_client(keyed, httpx.MockTransport(handler)) as client:
        assert TwitchSource(keyed)._get_token(client) == "tok"
    (req,) = seen
    assert req.method == "POST"
    assert str(req.url) == TOKEN_URL and req.url.query == b""
    assert req.headers["Content-Type"] == "application/x-www-form-urlencoded"
    assert parse_qs(req.content.decode()) == {
        "client_id": [CLIENT_ID],
        "client_secret": [SECRET],
        "grant_type": ["client_credentials"],
    }


def test_twitch_token_400_is_logged_without_credentials(keyed: Config, caplog):
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"status": 400, "message": "invalid client"})

    text = run_once(keyed, TwitchSource(keyed, sleep=lambda s: None), handler, caplog)
    line = next(r.getMessage() for r in caplog.records if "twitch FAILED" in r.getMessage())
    assert "HTTPStatusError: HTTP 400 POST https://id.twitch.tv/oauth2/token" in line
    assert line.endswith(": invalid client")
    assert_no_credentials(text)


# --- YouTube -------------------------------------------------------------------------------


def test_youtube_key_travels_in_a_header(keyed: Config):
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"items": []})

    with make_client(keyed, httpx.MockTransport(handler)) as client:
        YouTubeSource(keyed).fetch(client, NOW)
    assert seen[0].headers["X-goog-api-key"] == YT_KEY
    assert YT_KEY not in str(seen[0].url)


def test_youtube_http_error_is_logged_without_the_key(keyed: Config, caplog):
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400, json={"error": {"code": 400, "message": "API key not valid. Please pass a valid"}}
        )

    text = run_once(keyed, YouTubeSource(keyed), handler, caplog)
    assert "youtube FAILED" in text and "HTTP 400" in text and "API key not valid" in text
    assert_no_credentials(text)


def test_youtube_network_error_is_logged_without_the_key(keyed: Config, caplog):
    def handler(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=req)

    text = run_once(keyed, YouTubeSource(keyed), handler, caplog)
    assert "ConnectTimeout: GET https://www.googleapis.com/youtube/v3/videos: timed out" in text
    assert_no_credentials(text)


# --- the runner redacts any source, even one that still puts secrets in the URL -------------


class LeakySource:
    """Simulates the old bug: a source whose failing request carries secrets in the URL."""

    name = "leaky"

    def __init__(self, exc: Exception) -> None:
        self.exc = exc

    def missing_credentials(self):
        return None

    def fetch(self, client, now) -> Fetched:
        raise self.exc


LEAKY_URL = f"https://api.example.com/v1/thing?client_id={CLIENT_ID}&key={YT_KEY}&s={SECRET}"


def test_runner_redacts_http_status_errors_from_any_source(keyed: Config, caplog):
    req = httpx.Request("GET", LEAKY_URL)
    resp = httpx.Response(403, json={"message": "forbidden"}, request=req)
    exc = httpx.HTTPStatusError(
        f"Client error '403 Forbidden' for url '{req.url}'", request=req, response=resp
    )
    text = run_once(keyed, LeakySource(exc), lambda r: httpx.Response(200), caplog)
    assert "HTTP 403 GET https://api.example.com/v1/thing: forbidden" in text
    assert_no_credentials(text)


def test_runner_redacts_request_errors_and_plain_exceptions(keyed: Config, caplog):
    req = httpx.Request("GET", LEAKY_URL)
    text = run_once(
        keyed,
        LeakySource(httpx.ReadTimeout(f"timed out on {req.url}", request=req)),
        lambda r: httpx.Response(200),
        caplog,
    )
    assert "ReadTimeout: GET https://api.example.com/v1/thing" in text
    caplog.clear()
    text = run_once(
        keyed,
        LeakySource(RuntimeError(f"boom at {LEAKY_URL} again")),
        lambda r: httpx.Response(200),
        caplog,
    )
    assert "RuntimeError: boom at https://api.example.com/v1/thing?[redacted] again" in text
    assert_no_credentials(text)


def test_derive_failure_log_is_scrubbed(keyed: Config, caplog):
    def bad_derive(c, now):
        raise RuntimeError(f"fetch failed: {LEAKY_URL}")

    runner = Runner(
        keyed,
        [],
        client=httpx.Client(),
        clock=lambda: NOW,
        sleep=lambda s: None,
        derive_fn=bad_derive,
    )
    with caplog.at_level(logging.INFO, logger="collector"):
        runner._derive(NOW)
    assert "derive FAILED" in caplog.text and "?[redacted]" in caplog.text
    assert_no_credentials(caplog.text)


# --- helpers -------------------------------------------------------------------------------


def test_redact_url_drops_query_fragment_and_userinfo():
    assert redact_url("https://u:p@h.example:8443/a/b?x=1#f") == "https://h.example:8443/a/b"
    assert redact_url(httpx.URL("https://h.example/a?key=k")) == "https://h.example/a"


def test_scrub_and_describe_plain_errors():
    assert (
        scrub("see 'http://h/x?key=k' and https://h/y")
        == "see 'http://h/x?[redacted]' and https://h/y"
    )
    assert describe_error(ValueError("no url here")) == "ValueError: no url here"
