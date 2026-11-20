# web

The GTA VI hype tracker page: Next.js (App Router) + TypeScript + Tailwind v4 + Framer
Motion (`motion`) + d3-geo/topojson-client.

```sh
pnpm install
pnpm dev                      # http://localhost:3000
pnpm build && pnpm start      # production
pnpm lint && pnpm typecheck
pnpm test                     # vitest: count-up maths, formatting, adapters, chart paths
pnpm gen:signals              # regenerate lib/data/signals.generated.ts from the collector schema
pnpm screenshots              # Playwright captures of a running build (see scripts/screenshots.mjs)
```

- Design tokens: `app/globals.css` (`@theme` is Tailwind v4's config, and emits the CSS
  variables). Values come from `../design/README.md`, cross-checked against
  `../design/reference/_ds/*/tokens/*.css`.
- Data: `lib/data/` holds the adapter interfaces, mock implementations ported from the
  prototype's illustrative series, and the `Signals` type generated from
  `collector/schema/signals.schema.json`.
- Map: `public/geo/countries-110m.json` is world-atlas@2.0.2, vendored (no CDN fetch). It is
  projected on the server (`lib/geo.ts`), so the map is plain SVG in the HTML.
- Motion: `<Reveal>` / `<ChartReveal>` (`components/Reveal.tsx`) and `useCountUp`
  (`lib/use-count-up.ts`). Hidden states are overridden in `globals.css` without JS, under
  reduced motion and in print.
- Hero: `components/KeyArt.tsx` is art-directed. Below 768px a `<picture>` serves
  `hero-key-art-portrait.jpg` (a 900x1424 crop of the key art, both characters), above it
  the full 3560x1424 art; each is preloaded for its own media query.
- Compare: GTA VI is the first chip and the default. It is not on Steam, so `lib/compare.ts`
  builds its card from the Twitch series (same `twitchView` as the Signals card), resampled
  to the 25 points every Compare chart uses. The all-time list stays Steam-only. Covers live
  in `public/assets/covers` (`COVERS` in `lib/data/constants.ts` holds alt text and the
  object-position that keeps faces or titles in the tile).
- Status: the whole page (Launch, Signals, Compare) on the mock adapters. Live data
  (design/PROMPT.md stage 4) is next; `// data:` comments mark where the mocks show
  something the real feeds cannot.
