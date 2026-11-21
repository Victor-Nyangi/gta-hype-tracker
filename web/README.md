# web

The GTA VI hype tracker page: Next.js (App Router) + TypeScript + Tailwind v4 + Framer
Motion (`motion`) + d3-geo/topojson-client.

```sh
pnpm install
pnpm dev                      # http://localhost:3000
pnpm build && pnpm start      # production
pnpm lint && pnpm typecheck
pnpm test                     # vitest: count-up maths, formatting, payload guard, adapters, chart paths
pnpm gen:signals              # regenerate lib/data/signals.generated.ts from the collector schema
pnpm snapshot:signals         # refresh lib/data/fallback-signals.json from the live signals.json
pnpm screenshots              # Playwright captures of a running build (see scripts/screenshots.mjs)
```

- Design tokens: `app/globals.css` (`@theme` is Tailwind v4's config, and emits the CSS
  variables). Values come from `../design/README.md`, cross-checked against
  `../design/reference/_ds/*/tokens/*.css`.
- Data: the collector's `signals.json`, from `SIGNALS_URL` (default
  `https://gta-data.nyangi.dev/signals.json`; no Vercel variable needed).
  - Server: `lib/data/load.ts` fetches it inside `"use cache"` with `cacheLife("minutes")`
    (revalidate 60s, stale 5 min, expire 1h). The page is prerendered with real numbers at
    build and regenerated in the background at most once a minute; the build output shows
    `/  1m  1h`. `stale` stays at 5 minutes so the data remains in the static App Shell.
  - Validation: `lib/data/guard.ts` checks the payload against the generated `Signals` type,
    source by source (hand-written; no schema library). A failed fetch or a malformed
    envelope falls back to `lib/data/fallback-signals.json` (the last good snapshot,
    `pnpm snapshot:signals`); a malformed or missing source falls back on its own. Cards on
    the fallback say "Last known · <time>" and the header says "last known data".
  - Browser: `components/live/LiveSignals.tsx` refetches the same URL (CORS `*`) on load and
    every 60s while the tab is visible, and updates Twitch, Steam and the header status;
    count-ups tween to the new values over 700ms. Each card shows "Updated N min ago" (the
    absolute UTC time without JS). Wikipedia (daily) and the map stay server-rendered.
  - `lib/data/adapt.ts` maps the payload to the view models in `lib/data/types.ts`, so
    components never see the collector's shape. Each card sits in its own error boundary
    (`components/live/CardBoundary.tsx`).
- Map: `public/geo/countries-110m.json` is world-atlas@2.0.2, vendored (no CDN fetch). It is
  projected on the server (`lib/geo.ts`), so the map is plain SVG in the HTML.
- Motion: `<Reveal>` / `<ChartReveal>` (`components/Reveal.tsx`) and `useCountUp`
  (`lib/use-count-up.ts`). Hidden states are overridden in `globals.css` without JS, under
  reduced motion and in print.
- Hero: `components/KeyArt.tsx` is art-directed. Below 768px a `<picture>` serves
  `hero-key-art-portrait.jpg` (a 900x1424 crop of the key art, both characters), above it
  the full 3560x1424 art; each is preloaded for its own media query. Below 768px the scrim
  is a bottom-up fade only, so it does not sit on Lucia in the portrait crop.
- Twitch: the design's 48h window (−24h → +24h) with the "Doors open" marker. Data starts
  when the collector did (launch +14.6h), so only that span is drawn and the empty part says
  "Tracking since …". Once the data runs past +24h the window slides with it.
- Trailers: YouTube sampling is off, so the card shows the curated first-30-day curves as
  "reported milestones" (`lib/data/trailers.ts`; only day 0 of Trailer 1 is a sourced
  figure, the rest is the prototype's shape). Live totals join the legend when `youtube`
  has data.
- Compare: GTA VI is the first chip and the default. It is not on Steam, so `lib/compare.ts`
  builds its card from the Twitch series (same data as the Signals card), resampled to the
  25 points every Compare chart uses; hours before tracking began are flat-started under a
  "Tracking since …" veil. Steam all-time peaks are curated (SteamDB/SteamCharts) unless the
  collector has observed more. The all-time list stays Steam-only. Covers live
  in `public/assets/covers` (`COVERS` in `lib/data/constants.ts` holds alt text and the
  object-position that keeps faces or titles in the tile). Chips use short labels
  (`SHORT_NAMES`, with the full title in the accessible name) so they fit one row at 1440;
  the card, the peaks list and the alt text keep the full names.
- Business ("Follow the money", after Compare, `components/business/Business.tsx`): the
  collector's optional `business` block. Take-Two's reported figures as tiles (value, the
  source's own "nearly"/"over", as-of and a link to the page that says so), and estimated
  Steam sales per game as a low–high range bar (all-time reviews x30 to x55, the method in
  the footnote; no estimate for CS2 or GTA V Enhanced). The guard checks `steam_reviews` and
  `official` separately, so either falls back to the bundled snapshot on its own; the whole
  section is hidden if none of its parts exists. The 60s refresh updates them when the
  payload carries them. `pnpm snapshot:signals` keeps each business part from the previous
  snapshot while the live file lacks it.
- Share prices (top of "Follow the money", `components/business/SharePrices.tsx`, maths in
  `lib/prices.ts`): `business.prices`, Alpha Vantage daily closes via the collector. Take-Two's
  close as the sunset line, QQQ (the Nasdaq-100 ETF) rebased to TTWO's close on the first day
  both have as a dashed muted line, and dashed markers for the `MILESTONES` dates (Trailer 1,
  Trailer 2, the delays, Launch) that fall inside the data. X is the trading-day index. Chips:
  latest close, launch-day move (Nov 18 → Nov 19 close), since launch (Nov 18 → latest), and
  each against QQQ in percentage points; the peers' since-launch moves sit under the chart.
  The guard checks `prices` on its own (a missing or malformed block hides only the chart),
  and fewer than two TTWO closes hide it too. The bundled fallback only ever holds what the
  collector wrote: until the box has fetched prices, the chart is simply not there. On day
  one the series covers about 100 trading days (Alpha Vantage's free `compact` output; it
  grows a day at a time), so only the launch marker shows. The synthetic sample in
  `tests/fixtures.ts` (`makePrices`) is for tests only.
- Status: the whole page on live data (design/PROMPT.md stage 4). `// data:` comments mark
  where the page and the feeds differ (truncated Twitch snapshots, hour buckets vs
  tracking_since, curated trailer curves, language-to-country mapping).
