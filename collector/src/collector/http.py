"""Shared HTTP client, and safe descriptions of HTTP errors for the logs."""

from __future__ import annotations

import re

import httpx

from collector.config import Config

# An absolute URL followed by a query string. Query strings are where API keys hide, so any
# that slip into an exception message are cut before the message is logged.
_URL_QUERY = re.compile(r"""(https?://[^\s?#'"<>]+)\?[^\s'"<>]*""")
MAX_API_MESSAGE = 200


def make_client(cfg: Config, transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": cfg.user_agent, "Accept": "application/json"},
        timeout=httpx.Timeout(20.0, connect=10.0),
        follow_redirects=True,
        transport=transport,
    )


def redact_url(url: httpx.URL | str) -> str:
    """scheme://host[:port]/path: no userinfo, query string or fragment."""
    u = httpx.URL(str(url))
    port = f":{u.port}" if u.port is not None else ""
    return f"{u.scheme}://{u.host}{port}{u.path}"


def scrub(text: str) -> str:
    """Cut the query string off every URL in free text."""
    return _URL_QUERY.sub(r"\1?[redacted]", text)


def api_message(response: httpx.Response) -> str | None:
    """The human message an API put in its JSON error body, if any.

    Twitch: ``{"status": 400, "message": "invalid client"}``.
    Google: ``{"error": {"code": 403, "message": "...quota..."}}``.
    """
    try:
        body = response.json()
    except Exception:
        return None
    if not isinstance(body, dict):
        return None
    msg = body.get("message")
    if not isinstance(msg, str) and isinstance(body.get("error"), dict):
        msg = body["error"].get("message")
    if not isinstance(msg, str) or not msg.strip():
        return None
    return scrub(msg.strip())[:MAX_API_MESSAGE]


def describe_error(e: BaseException) -> str:
    """A log-safe one-line description of an exception.

    httpx puts the full request URL in its exception messages, query string included, and
    some APIs take credentials as query params. So HTTP errors are described from their parts
    (type, status, method, URL without the query, the API's own message) rather than with
    ``str(e)``, and anything else has its URLs scrubbed.
    """
    name = type(e).__name__
    if isinstance(e, httpx.HTTPStatusError):
        req, resp = e.request, e.response
        out = f"{name}: HTTP {resp.status_code} {req.method} {redact_url(req.url)}"
        detail = api_message(resp)
        return f"{out}: {detail}" if detail else out
    if isinstance(e, httpx.RequestError):
        try:
            req = e.request
        except RuntimeError:  # raised outside a request context: no request attached
            return f"{name}: {scrub(str(e))}"
        return f"{name}: {req.method} {redact_url(req.url)}: {scrub(str(e))}"
    return f"{name}: {scrub(str(e))}"
