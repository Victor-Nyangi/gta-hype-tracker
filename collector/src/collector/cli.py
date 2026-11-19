"""``collector`` command line."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

from collector.config import Config
from collector.derive import derive
from collector.runner import Runner, backfill
from collector.signals import write_schema
from collector.sources.wikipedia import BACKFILL_START

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schema" / "signals.schema.json"


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        stream=sys.stdout,
    )
    logging.Formatter.converter = __import__("time").gmtime
    # httpx logs every request URL at INFO, and the YouTube URL carries the API key.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def _date(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="collector", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("run", help="run the scheduler until stopped")
    sub.add_parser("once", help="run every enabled job once, then derive")
    d = sub.add_parser("derive", help="raw -> DuckDB -> public/signals.json")
    d.add_argument("--rebuild", action="store_true", help="drop the tables and reload all raw")
    b = sub.add_parser("backfill", help="one-off Wikipedia pageviews over a long range")
    b.add_argument("--start", type=_date, default=_date(BACKFILL_START.isoformat()))
    b.add_argument("--end", type=_date, default=datetime.now(UTC))
    s = sub.add_parser("schema", help="export the signals.json JSON Schema")
    s.add_argument("--out", type=Path, default=SCHEMA_PATH)
    args = p.parse_args(argv)

    _setup_logging()
    log = logging.getLogger("collector")

    if args.cmd == "schema":
        write_schema(args.out)
        log.info("wrote %s", args.out)
        return 0

    cfg = Config.from_env()
    if args.cmd == "run":
        Runner(cfg).loop()
    elif args.cmd == "once":
        runner = Runner(cfg)
        runner.run_due(runner.clock(), all_jobs=True)
    elif args.cmd == "derive":
        res = derive(cfg, rebuild=args.rebuild)
        log.info("derive ok: ingested %s -> %s", res.ingested or "nothing new", res.signals_path)
    elif args.cmd == "backfill":
        log.info("backfill %s", backfill(cfg, args.start, args.end))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
