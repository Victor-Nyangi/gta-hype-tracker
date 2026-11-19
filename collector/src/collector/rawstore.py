"""Immutable raw snapshot store.

Layout: ``<raw_dir>/<source>/date=YYYY-MM-DD/HHMMSS.json``. Every file is
``{fetched_at, source, request, payload}``. A file is written to a temp name in the same
directory and then hard-linked to its final name: ``link`` fails if the name already
exists, so an existing snapshot is never clobbered, and a reader never sees a half-written
file.

``compact_day`` gzips a finished day in place (``HHMMSS.json`` -> ``HHMMSS.json.gz``);
readers accept both.
"""

from __future__ import annotations

import gzip
import json
import os
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RawDoc:
    fetched_at: datetime
    source: str
    request: dict[str, Any]
    payload: Any
    path: Path | None = None


def snapshot_path(raw_dir: Path, source: str, fetched_at: datetime) -> Path:
    ts = fetched_at.astimezone(UTC)
    return raw_dir / source / f"date={ts:%Y-%m-%d}" / f"{ts:%H%M%S}.json"


def write_raw(
    raw_dir: Path,
    source: str,
    fetched_at: datetime,
    request: dict[str, Any],
    payload: Any,
) -> Path | None:
    """Write one snapshot. Returns its path, or None if that name already existed."""
    if fetched_at.tzinfo is None:
        raise ValueError("fetched_at must be timezone-aware")
    final = snapshot_path(raw_dir, source, fetched_at)
    if final.exists() or final.with_suffix(".json.gz").exists():
        return None
    final.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "fetched_at": fetched_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "source": source,
        "request": request,
        "payload": payload,
    }
    fd, tmp = tempfile.mkstemp(dir=final.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(body, fh, ensure_ascii=False, separators=(",", ":"))
            fh.flush()
            os.fsync(fh.fileno())
        try:
            os.link(tmp, final)  # atomic, and refuses to replace an existing file
        except FileExistsError:
            return None
        return final
    finally:
        os.unlink(tmp)


def read_raw(path: Path) -> RawDoc:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        body = json.load(fh)
    return RawDoc(
        fetched_at=datetime.fromisoformat(body["fetched_at"].replace("Z", "+00:00")),
        source=body["source"],
        request=body.get("request") or {},
        payload=body.get("payload"),
        path=path,
    )


def iter_raw_paths(raw_dir: Path, source: str) -> Iterator[Path]:
    """All snapshots for a source, oldest first (the layout sorts lexicographically)."""
    root = raw_dir / source
    if not root.is_dir():
        return
    for day in sorted(p for p in root.iterdir() if p.is_dir() and p.name.startswith("date=")):
        files = [
            p
            for p in day.iterdir()
            if not p.name.startswith(".")
            and (p.name.endswith(".json") or p.name.endswith(".json.gz"))
        ]
        yield from sorted(files, key=lambda p: p.name)


def compact_day(raw_dir: Path, source: str, day: date) -> int:
    """Gzip every plain snapshot of a finished day. Returns how many files were compacted."""
    folder = raw_dir / source / f"date={day:%Y-%m-%d}"
    if not folder.is_dir():
        return 0
    n = 0
    for p in sorted(folder.glob("*.json")):
        if p.name.startswith("."):
            continue
        gz = p.with_suffix(".json.gz")
        if gz.exists():
            continue
        fd, tmp = tempfile.mkstemp(dir=folder, prefix=".tmp-", suffix=".gz")
        try:
            with os.fdopen(fd, "wb") as raw_fh, gzip.GzipFile(fileobj=raw_fh, mode="wb") as gz_fh:
                gz_fh.write(p.read_bytes())
            os.link(tmp, gz)
        finally:
            os.unlink(tmp)
        p.unlink()
        n += 1
    return n


def compact_before(raw_dir: Path, today: date) -> int:
    """Compact every day partition older than ``today`` across all sources."""
    if not raw_dir.is_dir():
        return 0
    total = 0
    for source_dir in sorted(p for p in raw_dir.iterdir() if p.is_dir()):
        for day_dir in sorted(source_dir.glob("date=*")):
            day = date.fromisoformat(day_dir.name.removeprefix("date="))
            if day < today:
                total += compact_day(raw_dir, source_dir.name, day)
    return total
