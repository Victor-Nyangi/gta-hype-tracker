# syntax=docker/dockerfile:1
FROM python:3.13-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    DATA_DIR=/data

WORKDIR /app

# Dependencies first, so code changes do not reinstall them.
COPY pyproject.toml uv.lock .python-version README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
COPY schema ./schema
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 --home /app collector \
 && mkdir -p /data \
 && chown collector /data
USER collector
VOLUME ["/data"]

ENV PATH="/app/.venv/bin:$PATH"

# Healthy while signals.json keeps being refreshed (derive runs every 5 minutes).
HEALTHCHECK --interval=60s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import os,sys,time; p='/data/public/signals.json'; sys.exit(0 if os.path.exists(p) and time.time()-os.path.getmtime(p) < 900 else 1)"

CMD ["collector", "run"]
