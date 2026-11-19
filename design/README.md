# Handoff: GTA VI Hype Tracker

## Overview
A fan-made, single-page, scroll-driven "hype tracker" for the GTA VI launch (Nov 19, 2026). It has three sections: **Launch** (a live launch clock, a stats ticker, "days waited" counters and a timeline), **Signals** (the Twitch viewers curve, trailer views, and a world map of Wikipedia views by language) and **Compare** (a game picker showing Steam player counts).

## About the design files
The files in `reference/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code. Recreate them in the target stack. **Recommended: Next.js (App Router) + TypeScript + Tailwind + Framer Motion + d3-geo/topojson-client.** Open `reference/GTA VI Hype Tracker.dc.html` in a browser through a local static server (for example `npx serve reference`) to see the live prototype.

## Fidelity
**High fidelity.** Match the colours, type, spacing and motion precisely. All data is **illustrative** except the Steam all-time peaks, which are approximate. Build data adapters so real APIs can be plugged in.

## Layout (global)
- The content column is `max-width: 1280px` with 24px side padding. The canvas is `#120A14`.
- **Sticky header** (z-index 20, background `#120A14`, 1px bottom border `#33223A`):
  - Left: a 28×28 radius-8 tile with an animated sunset gradient, then "GTA **VI** Hype Tracker" (Archivo 20px/900, stretch 80%; "VI" in pink).
  - Centre: tabs Launch / Signals / Compare. Clicking a tab smooth-scrolls to its section with a 64px offset. The active tab follows the section whose top is ≤160px from the viewport top. The active tab has a 2px emerald underline (`#1FAA6B`); tab text is 13.5px/700.
  - Right: a pulsing pink dot plus a live status, either `Live · day N · HH:MM:SS` or `T-minus Nd HH:MM:SS`.

## Sections

### 1. Launch (`#launch`)
- **Hero:** `min-height: clamp(560px, 80vh, 860px)`, content aligned to the bottom, `overflow: hidden`.
  - Full-bleed key art (`assets/hero-gif.webp`, fallback `assets/gta-full-wide.png`), object-fit cover, transform-origin 70% 40%.
  - Scrim (layout borrowed from PlayStation's hero: text on the left, art on the right):
    `linear-gradient(90deg, #120A14 0%, rgba(18,10,20,.88) 26%, rgba(18,10,20,.3) 56%, transparent 78%), linear-gradient(180deg, transparent 50%, #120A14 98%)`.
  - Overlay: an animated sunset gradient layer (`mix-blend-mode: soft-light`, opacity .4, 300% background-size, 14s loop).
  - Content, in a column with 28px gaps:
    - Badges: "Out now · Nov 19, 2026" (success) and "PS5 · Xbox Series X|S" (neutral). Badges are 11px/700, uppercase, 0.04em tracking, pill shape, 4×10 padding.
    - **H1** "Miami," / "here we come." in Archivo 900, stretch 68%, `clamp(52px, 7.5vw, 116px)`, line-height .88, max-width 8ch. Line 2 is gradient text `linear-gradient(90deg, oklch(.80 .16 60), oklch(.70 .21 350) 50%, #8B4FC9)` with an 8s background-position loop.
    - Clock: 4 boxes (`grid repeat(4, minmax(0,150px))`, 12px gap). Each box has background `rgba(29,18,32,.72)`, a 1px border, radius 16 and padding 16/14/12. The number is `clamp(34px,5vw,56px)`/800 with tabular-nums; the label is 11px uppercase. Values are days, hours, minutes and seconds **since** launch, or until launch if before it.
    - Caption: "Time since doors opened at midnight Eastern." (15px, secondary).
  - The launch moment is `2026-11-19T05:00:00Z`.
- **Ticker:** a full-width sunset gradient bar `linear-gradient(90deg, oklch(.78 .16 55), oklch(.70 .21 350), #8B4FC9)`.
  - Text is `#0A0A0C`, 15px/800, uppercase, with a ✦ separator.
  - The content is duplicated and scrolls `translateX(0 → -50%)` over 38s, linear, infinite.
- **"The wait, in days":** eyebrow (orange) plus the heading "Thirteen years in the making."
  - The grid is `auto-fit minmax(230px,1fr)`.
  - Each card: background `#1D1220`, border `#33223A`, radius 20, padding 24. The number is 52px/800 and counts up.
  - Cards: since GTA V (2013‑09‑17, violet), since VI was confirmed (2022‑02‑04, pink), since Trailer 1 (2023‑12‑05, orange), since Trailer 2 (2025‑05‑06, teal).
- **Road to launch timeline:** 150px tall.
  - The track is 2px `#3E2944` at y=74, with a 4px gradient progress bar on top (violet → pink → orange) that wipes in left to right.
  - Milestones are positioned proportionally by date and alternate above and below the track. Each has a 14px dot with a 3px canvas border.
  - Milestones:
    - GTA V release
    - VI confirmed
    - Trailer 1 (2023‑12‑05)
    - Delay → May 26 (2025‑05‑02)
    - Trailer 2 (2025‑05‑06)
    - Delay → Nov 19 (2025‑11‑06)
    - Launch (2026‑11‑19)
- **CTAs:** a primary "See the live signals" button and a secondary "Compare on Steam" button. Both are large (14×26 padding, 15px/800, radius 8) and scroll to their sections.

### 2. Signals (`#signals`, full-bleed band `#0C060E`, 96px vertical padding)
- **Mesh headline:** "The whole / internet is / watching." in Archivo 900, stretch 68%, `clamp(72px,15vw,240px)`, line-height .86.
  - The letters are filled with `gta-full-wide.png` via `background-clip: text`.
  - Behind it is an outline copy offset 6px/6px (`-webkit-text-stroke: 1px rgba(255,255,255,.18)`).
  - **The fill is scroll-linked:** with progress q = 0→1 as the headline crosses the viewport, `background-position: q*100% (25+q*50)%` and `background-size: (230 − q*90)% auto`.
- **Twitch card:**
  - KPIs: watching now (`clamp(44px,6vw,68px)`/800), peak (orange, 28px), hours watched.
  - The chart is 300px tall and covers a 48h window (−24h → +24h), with a dashed "Doors open" marker at 50%.
  - The area is filled with pink at 45% fading to 0, and the 3px line runs violet → pink → orange.
  - A pulsing orange dot sits on the latest point, and future hours are not drawn.
  - Hovering shows a crosshair, a dot and a tooltip ("1,234,567 viewers / Launch +3h").
  - The x labels are −24h, −12h, Launch, +12h, +24h.
- **Two-column grid** (`auto-fit minmax(min(100%,420px),1fr)`):
  - Trailer views card: Trailer 1 (violet) and Trailer 2 (orange) lines over days 0–30, gridlines at 50/100/150/200M, and a legend showing the day‑30 totals.
  - A media tile on the right (`assets/trailer-gif.webp`, radius 20).
- **Map card:**
  - The map spans 2 columns. It uses the Natural Earth projection fitted to 960×470, from world-atlas `countries-110m`, with Antarctica removed.
  - Countries are filled by the language mostly read there: `color-mix(in oklch, pink (25+k*75)%, #2A1A2E)` where k = √(views/max).
  - On the right is a list of the top 12 languages, each with an animated bar (violet → pink).
  - Hovering a language highlights its countries in orange and dims the others.

### 3. Compare (`#compare`)
- Heading: "Who else is still playing?" plus a note that GTA VI is console-only.
- **Game chips:** pills (10×16 padding, 13.5px/800). The active chip has an orange → pink gradient with dark text; inactive chips have a 1px `#3E2944` border and secondary text.
- **Selected game card:** in-game now (counts up), 24h peak, and all-time peak (orange).
  - The 260px area chart covers 24h. **When the game changes, the path morphs** over 750ms with `cubic-bezier(.22,1,.36,1)`. Keep the same point count so the paths can interpolate; Framer Motion `animate={{ d }}` works for this.
  - A cover art tile per game.
- **All-time Steam peaks:** horizontal bars, highlighting the selected game. Clicking a row selects that game.

## Interactions & motion
Inspired by the motion on rockstargames.com/VI:
- **Section entrance** (whileInView, once, about 12% visible):
  - Keyframes `opacity 0, y 80, scale .96, clipPath inset(100% 0 0 0)` → `opacity 1, y 0, scale 1, inset(0)`.
  - 1200ms, `cubic-bezier(.16,1,.3,1)`, children staggered by 110ms (up to 8).
- **Chart reveal:** clipPath `inset(0 100% 0 0)` → `inset(0)`, 1800ms, 200ms delay, `cubic-bezier(.22,1,.36,1)`.
- **Hero parallax**, with p = scrollY/vh clamped to 0–1:
  - Image: `translateY(p*18%) scale(1+p*.18)` and `brightness(1−p*.55)`.
  - Text: `translateY(−scrollY*.3)` and `opacity 1−scrollY/(.75vh)`.
- **Count-ups:** easeOutQuart. 1500ms on first view, 700ms when a value changes. Counters start only once their section has been seen.
- **Pulse:** an expanding box-shadow ring (12px) over 1.6s, infinite.
- **Always render content visible by default** (for SSR, reduced motion and print). Respect `prefers-reduced-motion`.

## State
- `now` (ticks every 1s)
- `activeSection` (scroll spy)
- `seenSections`
- `twitchHoverIndex`
- `hoverLanguage`
- `selectedGameId`
- `geo` (loaded topojson paths)

## Data (create typed adapters; the mock data lives in the prototype's JS)
- Twitch: concurrent viewers for the GTA VI category, hourly ±24h around launch. Real source: Twitch Helix `GET /streams?game_id=…` (sum `viewer_count`, sampled on a cron).
- Trailers: YouTube Data API `videos?part=statistics`, sampled daily.
- Wikipedia: Wikimedia Pageviews API `per-article/{lang}.wikipedia/all-access/user/{title}/daily/{start}/{end}`, per language edition.
- Steam: `ISteamUserStats/GetNumberOfCurrentPlayers?appid=` for current players. Use SteamDB/SteamCharts for the 24h history and all-time peaks.
  - App IDs: GTA V 271590, RDR2 1174180, CS2 730, Cyberpunk 1091500, Elden Ring 1245620, BG3 1086940.
  - Approximate all-time peaks: CS2 1,862,531; Cyberpunk 1,054,388; Elden Ring 953,426; BG3 875,343; GTA V 364,548; RDR2 ~92,000.
- The language → country mapping is in `LANGS` in the prototype JS.

## Design tokens
- **Canvas:** canvas `#120A14`; Signals band `#0C060E`; card `#1D1220`; card raised and map land `#2A1A2E`; border `#33223A`; track `#3E2944`.
- **Text:** primary `#F4F1EA`; secondary `oklch(.82 .02 330)`; tertiary `oklch(.70 .03 330)`.
- **Accents:**
  - Pink `oklch(.70 .21 350)`
  - Orange `oklch(.78 .16 55)`
  - Violet `#8B4FC9`
  - Orchid `#6B21A8`
  - Teal `oklch(.75 .13 200)`
  - Emerald (tabs and primary button) `#1FAA6B`, hover `#4BC98C`
- **Sunset gradient:** `90deg, orange → pink → violet`.
- **Type:** Archivo (Google Fonts, variable `wdth 62–125`, `wght 100–900`) for everything. Headlines use weight 900 with `font-stretch` 68–72%. Eyebrows are 11px/700, uppercase, 0.06em tracking. Body text is 13–15px.
- **Spacing:** a 4px base (4/8/12/16/20/24/32/48/64/80/96). Cards use 24–28px padding, and grids use 16–24px gaps.
- **Radii:** 8 (buttons), 16 (clock boxes), 20 (cards), pill.
- **Shadows:** soft ambient shadows only (`--shadow-sm/md` in the DS tokens).

## Assets
- `assets/gta-full-wide.png`: the key-art collage supplied by the user. It is the hero fallback and the mesh-headline fill.
- `assets/hero-gif.webp`, `assets/trailer-gif.webp`, `assets/cover-gtav.webp`: images the user dropped into the prototype. Other games' covers are empty placeholders.
- These are fan-use only. Confirm rights before shipping. The site must not use the Rockstar logo, and the footer says it is "not affiliated with Rockstar Games or Take-Two".

## Files
- `reference/GTA VI Hype Tracker.dc.html`: the full prototype (markup, plus its logic class at the bottom).
- `reference/_ds/...`: the base design-system tokens and components (Tabs, Badge, Button).
- `PROMPT.md`: prompts for Claude Code.
- `screenshots/`: one capture per section at 909px wide (01-hero … 07-compare-chart). The live clock values and the illustrative data will differ from what you see.
