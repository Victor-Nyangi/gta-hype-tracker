import type { CoverArt, Milestone, WaitCounter } from "./types";

/** Facts, not data feeds: they do not change, so they live here rather than in an adapter. */

export const MILESTONES: Milestone[] = [
  { label: "GTA V release", date: "2013-09-17", tone: "violet" },
  { label: "VI confirmed", date: "2022-02-04", tone: "violet" },
  { label: "Trailer 1", date: "2023-12-05", tone: "pink" },
  { label: "Delay → May 26", date: "2025-05-02", tone: "muted" },
  { label: "Trailer 2", date: "2025-05-06", tone: "pink" },
  { label: "Delay → Nov 19", date: "2025-11-06", tone: "muted" },
  { label: "Launch", date: "2026-11-19", tone: "orange" },
];

export const WAITS: WaitCounter[] = [
  { label: "Since GTA V came out", since: "2013-09-17", color: "violet" },
  { label: "Since VI was confirmed", since: "2022-02-04", color: "pink" },
  { label: "Since Trailer 1", since: "2023-12-05", color: "orange" },
  { label: "Since Trailer 2", since: "2025-05-06", color: "teal" },
];

/**
 * Compare cover art, keyed by game id. Masters live in public/assets/covers (at most 1200px
 * on the long side; next/image re-encodes them per width). Fan use only (design/README.md).
 */
export const COVERS = {
  gta6: {
    src: "/assets/covers/gta6.jpg",
    alt: "Grand Theft Auto VI key art: Lucia and Jason in front of the Vice City skyline at sunset",
    position: "50% 50%",
  },
  // The 16:9 key art cropped to the three faces and the logo, with the sky extended upward
  // (fading to the card colour) so the ~0.89 tile at 1440 shows its full width.
  gtav: {
    src: "/assets/covers/gtav.jpg",
    alt: "Grand Theft Auto V key art: Michael, Trevor and Franklin in work coveralls around the GTA V logo",
    position: "50% 45%",
  },
  gtav_enhanced: {
    src: "/assets/covers/gtav-enhanced.jpg",
    alt: "Grand Theft Auto V Enhanced box art: the GTA V logo among panels of Michael, Franklin, Trevor and Chop",
    position: "50% 0%",
  },
  rdr2: {
    src: "/assets/covers/rdr2.jpg",
    alt: "Red Dead Redemption 2 cover: Arthur Morgan aiming a revolver, riders on the horizon behind him",
    position: "50% 8%",
  },
  cs2: {
    src: "/assets/covers/cs2.jpg",
    alt: "Counter-Strike art: a masked counter-terrorist firing a rifle",
    position: "38% 50%",
  },
  cp77: {
    src: "/assets/covers/cp77.jpg",
    alt: "Cyberpunk 2077 cover: V in a jacket with a glowing collar, pistol raised, on yellow",
    position: "45% 40%",
  },
  er: {
    src: "/assets/covers/er.jpg",
    alt: "Elden Ring cover: a kneeling knight beneath the burning sigil of the Elden Ring",
    position: "50% 50%",
  },
  bg3: {
    src: "/assets/covers/bg3.jpg",
    alt: "Baldur's Gate 3 cover: Astarion leads the companions under a stormy sky",
    position: "50% 30%",
  },
} satisfies Record<string, CoverArt>;

/** Steam games to compare. All-time peaks are approximate (design/README.md). */
export const STEAM_GAMES = [
  { id: "gtav", appId: 271590, name: "Grand Theft Auto V", allTimePeak: 364548, cover: COVERS.gtav },
  { id: "rdr2", appId: 1174180, name: "Red Dead Redemption 2", allTimePeak: 92000, cover: COVERS.rdr2 },
  { id: "cs2", appId: 730, name: "Counter-Strike 2", allTimePeak: 1862531, cover: COVERS.cs2 },
  { id: "cp77", appId: 1091500, name: "Cyberpunk 2077", allTimePeak: 1054388, cover: COVERS.cp77 },
  { id: "er", appId: 1245620, name: "Elden Ring", allTimePeak: 953426, cover: COVERS.er },
  { id: "bg3", appId: 1086940, name: "Baldur's Gate 3", allTimePeak: 875343, cover: COVERS.bg3 },
  // GTA V has been split across two Steam apps since March 2025; the collector samples
  // both (collector/src/collector/sources/steam.py).
  // data: no all-time peak for Enhanced yet (the 364,548 above predates the split, and
  // the collector only records peaks it has observed), so the page shows a dash for now.
  {
    id: "gtav_enhanced",
    appId: 3240220,
    name: "Grand Theft Auto V Enhanced",
    allTimePeak: null,
    cover: COVERS.gtav_enhanced,
  },
] as const;

/**
 * Where each language is mostly read (ISO 3166-1 numeric, as in world-atlas). Keyed by
 * Wikipedia language code so collector data joins on it. From the prototype's LANGS.
 */
export const LANGUAGE_COUNTRIES: Record<string, { name: string; countries: number[] }> = {
  en: { name: "English", countries: [840, 826, 124, 36, 372, 554, 356, 710, 566] },
  es: {
    name: "Spanish",
    countries: [724, 484, 32, 170, 152, 604, 862, 218, 68, 600, 858, 320, 340, 222, 558, 188, 591, 214, 192],
  },
  pt: { name: "Portuguese", countries: [76, 620, 24, 508] },
  de: { name: "German", countries: [276, 40, 756] },
  ru: { name: "Russian", countries: [643, 112, 398] },
  fr: { name: "French", countries: [250, 56, 384, 686, 120, 450] },
  ja: { name: "Japanese", countries: [392] },
  pl: { name: "Polish", countries: [616] },
  it: { name: "Italian", countries: [380] },
  tr: { name: "Turkish", countries: [792] },
  zh: { name: "Chinese", countries: [156, 158] },
  ko: { name: "Korean", countries: [410] },
  ar: { name: "Arabic", countries: [682, 818, 784, 504, 12, 368, 400, 788, 434, 760, 887, 512] },
  uk: { name: "Ukrainian", countries: [804] },
  nl: { name: "Dutch", countries: [528] },
};
