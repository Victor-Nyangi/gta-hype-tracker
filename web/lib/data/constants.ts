import type { Milestone, WaitCounter } from "./types";

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

/** Steam games to compare. All-time peaks are approximate (design/README.md). */
export const STEAM_GAMES = [
  { id: "gtav", appId: 271590, name: "Grand Theft Auto V", allTimePeak: 364548, cover: "/assets/cover-gtav.webp" },
  { id: "rdr2", appId: 1174180, name: "Red Dead Redemption 2", allTimePeak: 92000 },
  { id: "cs2", appId: 730, name: "Counter-Strike 2", allTimePeak: 1862531 },
  { id: "cp77", appId: 1091500, name: "Cyberpunk 2077", allTimePeak: 1054388 },
  { id: "er", appId: 1245620, name: "Elden Ring", allTimePeak: 953426 },
  { id: "bg3", appId: 1086940, name: "Baldur's Gate 3", allTimePeak: 875343 },
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
