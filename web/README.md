# web

The GTA VI hype tracker page: Next.js (App Router) + TypeScript + Tailwind v4 + Framer
Motion (`motion`) + d3-geo/topojson-client.

```sh
pnpm install
pnpm dev                      # http://localhost:3000
pnpm build && pnpm start      # production
pnpm lint && pnpm typecheck
pnpm gen:signals              # regenerate lib/data/signals.generated.ts from the collector schema
pnpm screenshots              # Playwright captures of a running build (see scripts/screenshots.mjs)
```

- Design tokens: `app/globals.css` (`@theme` is Tailwind v4's config, and emits the CSS
  variables). Values come from `../design/README.md`, cross-checked against
  `../design/reference/_ds/*/tokens/*.css`.
- Data: `lib/data/` holds the adapter interfaces, mock implementations ported from the
  prototype's illustrative series, and the `Signals` type generated from
  `collector/schema/signals.schema.json`.
- Status: checkpoint A (scaffold, tokens, Header, Hero, Footer). `#signals` and `#compare`
  are placeholders.
