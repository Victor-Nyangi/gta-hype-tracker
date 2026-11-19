# Claude Code prompts

## 1. Kickoff (paste first)
```
Read design_handoff_gta6_hype_tracker/README.md completely, then open
reference/GTA VI Hype Tracker.dc.html (serve it with `npx serve reference`) to see the live prototype.
The HTML is a design reference, not code to copy.

Build a production version as a single scrolling page:
- Next.js (App Router) + TypeScript + Tailwind + Framer Motion + d3-geo + topojson-client.
- Put the design tokens from the README into tailwind.config + CSS variables.
  Load Archivo (variable wdth/wght) via next/font.
- Components: Header (scroll-spy tabs), Hero, Ticker, WaitCounters, Timeline,
  TwitchChart, TrailerChart, LanguageMap, GamePicker, SteamChart, PeaksList, Footer.
- Put all data behind typed adapters in /lib/data with mock implementations that
  match the prototype's illustrative series. Leave the real API calls for later.
- Match the colours, type, spacing and motion values in the README exactly.
- Content must be visible without JS. Respect prefers-reduced-motion.

Start with the scaffold, tokens, Header and Hero. Show me before continuing.
```

## 2. Section-by-section follow-ups
```
Now build the Ticker, WaitCounters and Timeline per README §1. Use a shared
useCountUp(value, {duration}) hook (easeOutQuart; restarts only when the section
first enters view) and a <Reveal> wrapper (whileInView, once, the README's entrance keyframes, 110ms stagger).
```
```
Build the Signals section per README §2. The mesh headline uses background-clip:text
with assets/gta-full-wide.png, and its background-position/size are tied to useScroll + useTransform.
The Twitch chart needs a hover crosshair and tooltip, a pulsing live dot, and future hours hidden.
The map uses Natural Earth projection with world-atlas countries-110m, coloured by language, with hover linking between the language list and the map.
```
```
Build the Compare section per README §3. Morph the SteamChart path with motion.path
animate={{ d }} (keep 25 points). Clicking a chip or a peaks row selects that game.
```

## 3. Polish
```
Compare each section against the prototype side by side at 1440px and 390px wide.
Fix any spacing, type or motion mismatches. Then add a hero parallax with useScroll
using the README's values, and run a Lighthouse pass (target performance ≥90 and accessibility ≥95).
```

## 4. Real data (when ready)
```
Replace the mock adapters with real ones, keeping the same interfaces:
Twitch Helix (streams by game_id, sampled by a cron into a KV store),
YouTube Data API (video statistics), the Wikimedia Pageviews API (per language),
and Steam GetNumberOfCurrentPlayers. Use API routes with caching (revalidate 60s)
and put keys in .env.local. Add loading skeletons and an error fallback for each card.
```
