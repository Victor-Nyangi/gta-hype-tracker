from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from collector import rawstore

T = datetime(2026, 11, 19, 21, 5, 0, tzinfo=UTC)


def test_layout_and_roundtrip(tmp_path):
    p = rawstore.write_raw(tmp_path, "steam", T, {"endpoint": "x"}, {"apps": {"730": 1}})
    assert p == tmp_path / "steam" / "date=2026-11-19" / "210500.json"
    doc = rawstore.read_raw(p)
    assert doc.fetched_at == T and doc.source == "steam"
    assert doc.request == {"endpoint": "x"} and doc.payload == {"apps": {"730": 1}}


def test_never_clobbers(tmp_path):
    first = rawstore.write_raw(tmp_path, "steam", T, {}, {"v": 1})
    again = rawstore.write_raw(tmp_path, "steam", T, {}, {"v": 2})
    assert again is None
    assert rawstore.read_raw(first).payload == {"v": 1}
    # no temp files are left behind
    assert [p.name for p in first.parent.iterdir()] == ["210500.json"]


def test_never_clobbers_a_compacted_snapshot(tmp_path):
    rawstore.write_raw(tmp_path, "steam", T, {}, {"v": 1})
    assert rawstore.compact_day(tmp_path, "steam", T.date()) == 1
    assert rawstore.write_raw(tmp_path, "steam", T, {}, {"v": 2}) is None


def test_requires_aware_timestamps(tmp_path):
    with pytest.raises(ValueError):
        rawstore.write_raw(tmp_path, "steam", T.replace(tzinfo=None), {}, {})


def test_iter_order_and_compaction(tmp_path):
    for h in (23, 1, 12):
        day = 18 if h == 23 else 19
        rawstore.write_raw(tmp_path, "steam", datetime(2026, 11, day, h, tzinfo=UTC), {}, {"h": h})
    assert rawstore.compact_before(tmp_path, date(2026, 11, 19)) == 1
    paths = list(rawstore.iter_raw_paths(tmp_path, "steam"))
    assert [p.name for p in paths] == ["230000.json.gz", "010000.json", "120000.json"]
    assert [rawstore.read_raw(p).payload["h"] for p in paths] == [23, 1, 12]
    assert list(rawstore.iter_raw_paths(tmp_path, "missing")) == []
