# Deploying the collector

Two containers on the shared box, behind snapcount's existing Traefik:

- `collector`: `collector run`, writing to the `gta-data` volume
  (`raw/` snapshots, `cache/`, `signals.duckdb`, `public/signals.json`).
- `data`: Caddy serving only the volume's `public/` directory, read-only, with
  `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=60` (mounted at
  `/srv/gta`, because the Caddy image keeps its own state in `/data`).
  Traefik routes `https://$DATA_DOMAIN/` to it with the `le` cert resolver.

Nothing here publishes a port: Traefik reaches `data` over its own Docker network.

## Before you start

1. DNS: an A record for the data hostname (e.g. `gta-data.nyangi.dev`) pointing at the box.
2. Credentials, if you have them (every one is optional; a source without them is skipped):
   - Twitch: create an app at dev.twitch.tv/console (any OAuth redirect, e.g.
     `http://localhost`), copy the client id and generate a client secret.
   - YouTube: a Data API v3 key from console.cloud.google.com (restrict it to that API).
   - Steam and Wikipedia need nothing.

## Steps on the box

```sh
# 1. Clone next to snapcount
git clone <this repo's URL> ~/gta-hype-tracker
cd ~/gta-hype-tracker

# 2. Find the network snapcount's Traefik is on. It is the compose project's default
#    network, not a named external one, so its name depends on snapcount's project name.
docker ps --format '{{.Names}}' | grep -i proxy
docker inspect <that proxy container> \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
#    -> e.g. snapcount_default

# 3. Configure
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
$EDITOR deploy/.env        # DATA_DOMAIN, TRAEFIK_NETWORK, and any keys you have

# 4. Build and start
docker compose -f deploy/compose.yml up -d --build

# 5. One-off: backfill Wikipedia daily views since Feb 2022 (about 30 small requests)
docker compose -f deploy/compose.yml exec collector collector backfill
docker compose -f deploy/compose.yml exec collector collector derive
```

`deploy/.env` sits next to `compose.yml`, which is where Compose looks for it when run with
`-f deploy/compose.yml`, and the collector reads the same file through `env_file`.

## Checking it

```sh
docker compose -f deploy/compose.yml ps                    # collector should turn "healthy"
docker compose -f deploy/compose.yml logs -f collector     # one line per job
docker compose -f deploy/compose.yml logs --tail 50 data

curl -sS https://$DATA_DOMAIN/signals.json | head -c 400; echo
curl -sSI https://$DATA_DOMAIN/signals.json | grep -iE 'access-control|cache-control|content-type'
```

A healthy log looks like:

```
INFO  collector starting: data_dir=/data jobs=[twitch/5m, steam/5m, youtube/60m, wikipedia/1440m, compact/1440m]
INFO  twitch ok in 6.2s: gta6 1843211 viewers / 9120 streams (92 pages); gtav 41022 -> raw/twitch/...
INFO  steam ok in 2.3s: 7/7 apps; gtav 73545, cs2 956208 -> raw/steam/date=.../181322.json
INFO  derive ok in 0.4s: ingested {'twitch': 1, 'steam': 1} -> public/signals.json
```

`twitch skipped: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set (will not log this again)`
means the source is off, not broken. Add the keys to `deploy/.env` and
`docker compose -f deploy/compose.yml up -d` to pick them up.

## Updating

```sh
git pull
docker compose -f deploy/compose.yml up -d --build
# after a parsing change, reload all raw history into fresh tables:
docker compose -f deploy/compose.yml exec collector collector derive --rebuild
```

## Disk

Twitch is the only large source: a launch-week snapshot of ~90 pages is a few MB, every
5 minutes. The daily `compact` job gzips each finished day's raw files (roughly a 10x
saving), and derive reads both forms. Check with:

```sh
docker run --rm -v gta-hype-tracker_gta-data:/data alpine du -sh /data/raw/*
```

Raw snapshots are the only irreplaceable part (the APIs only return current values). To copy
them off the box:

```sh
docker run --rm -v gta-hype-tracker_gta-data:/data -v "$PWD":/out alpine \
  tar czf /out/gta-raw-$(date -u +%Y%m%d).tgz -C /data raw
```
