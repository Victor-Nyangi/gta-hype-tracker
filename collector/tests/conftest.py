from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from collector.config import Config

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    return Config.from_env(
        {
            "DATA_DIR": str(tmp_path / "data"),
            "TWITCH_CLIENT_ID": "test-client",
            "TWITCH_CLIENT_SECRET": "test-secret",
            "YOUTUBE_API_KEY": "test-yt-key",
            "WIKI_LANGS": "en,ja,sah,xx",
        }
    )
