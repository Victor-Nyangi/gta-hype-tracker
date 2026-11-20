/*
 * Illustrative series, ported from the prototype's script
 * (design/reference/GTA VI Hype Tracker.dc.html, TW / T1 / T2 / GAMES / LANGS). Same
 * seeded noise and formulas, so the page matches the design until real data is wired in.
 */
import { LANGUAGE_COUNTRIES, STEAM_GAMES } from "./constants";
import type { Signals } from "./signals.generated";
import type { HypeData, LanguageViews, SteamGame, TrailerSeries, TwitchSeries } from "./types";

/** The prototype's deterministic noise. */
export const rnd = (s: number) => {
  const x = Math.sin(s * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

/**
 * Twitch viewers for hours -24..+24 around launch (49 points).
 * data: the real series starts when the collector did (launch +14.6h, 19:39 UTC on launch
 * day), so the -24h..+14h part of this curve can never come from live data.
 */
export const TW: number[] = Array.from({ length: 49 }, (_, i) => {
  const h = i - 24;
  let v =
    h <= 0
      ? 0.32 + 2.3 * Math.exp(h / 4.5)
      : 1.7 + 3.6 * Math.exp(-Math.max(0, h - 1.5) / 7) * (h < 1.5 ? 0.85 + h * 0.1 : 1);
  v += 0.25 * Math.sin(((h + 6) / 24) * Math.PI * 2) * (h > 0 ? 1 : 0.3);
  return Math.max(0.1, v * (1 + (rnd(i) - 0.5) * 0.08)) * 1e6;
});

/**
 * Cumulative trailer views, days 0..30 since release.
 * data: YouTube's API only returns today's total, so real first-30-day curves would be
 * curated milestones (press-reported day-1/week-1 figures), not samples.
 */
export const T1: number[] = Array.from(
  { length: 31 },
  (_, d) => (93 + (57 * Math.log(1 + d)) / Math.log(31) + (rnd(d + 7) - 0.5) * 1.5) * 1e6,
);
export const T2: number[] = Array.from(
  { length: 31 },
  (_, d) => (112 + (66 * Math.log(1 + d)) / Math.log(31) + (rnd(d + 70) - 0.5) * 1.5) * 1e6,
);

/** Steam curve shape per game (base players, daily amplitude, phase). */
const CURVES: Record<string, { base: number; amp: number; ph: number }> = {
  gtav: { base: 115000, amp: 0.32, ph: 2 },
  rdr2: { base: 24000, amp: 0.35, ph: 3 },
  cs2: { base: 1250000, amp: 0.28, ph: 8 },
  cp77: { base: 38000, amp: 0.4, ph: 1 },
  er: { base: 52000, amp: 0.38, ph: 4 },
  bg3: { base: 68000, amp: 0.36, ph: 0 },
  // data: not in the prototype; an illustrative curve in the same style.
  gtav_enhanced: { base: 58000, amp: 0.33, ph: 2 },
};

export const GAMES: SteamGame[] = STEAM_GAMES.map((g, gi) => {
  const c = CURVES[g.id];
  const series24h = Array.from(
    { length: 25 },
    (_, i) =>
      c.base * (1 + c.amp * Math.sin(((i - 6 - c.ph) / 24) * Math.PI * 2) + (rnd(i + gi * 40) - 0.5) * 0.1),
  );
  return {
    id: g.id,
    appId: g.appId,
    name: g.name,
    allTimePeak: g.allTimePeak,
    cover: g.cover,
    series24h,
    currentPlayers: series24h[24],
    peak24h: Math.max(...series24h),
  };
});

/**
 * Wikipedia views by language, in thousands in the prototype; stored here as views.
 * data: a language edition is not a country; the map's language -> country join
 * (LANGUAGE_COUNTRIES) is an approximation of where each edition is mostly read.
 */
const LANG_VIEWS_K: [code: string, thousands: number][] = [
  ["en", 4200],
  ["es", 1120],
  ["pt", 760],
  ["de", 640],
  ["ru", 590],
  ["fr", 520],
  ["ja", 410],
  ["pl", 330],
  ["it", 300],
  ["tr", 260],
  ["zh", 240],
  ["ko", 210],
  ["ar", 190],
  ["uk", 150],
  ["nl", 140],
];

export const LANGS: LanguageViews[] = LANG_VIEWS_K.map(([code, k]) => ({
  code,
  name: LANGUAGE_COUNTRIES[code].name,
  views: k * 1000,
  countries: LANGUAGE_COUNTRIES[code].countries,
}));

const TWITCH: TwitchSeries = {
  points: TW.map((viewers, i) => ({ hoursFromLaunch: i - 24, viewers })),
  trackingSince: null,
  currentViewers: TW[48],
  peakViewers: Math.max(...TW.slice(24)),
  hoursWatched: TW.slice(24).reduce((s, v) => s + v, 0),
  byLanguage: [],
};

const TRAILERS: TrailerSeries[] = [
  { id: "QdBZY2fkU-0", label: "Trailer 1", color: "violet", viewsByDay: T1, currentViews: T1[30] },
  { id: "VQRLujxTm3c", label: "Trailer 2", color: "orange", viewsByDay: T2, currentViews: T2[30] },
];

/** The mock adapter: resolves the illustrative series. */
export const mockHypeData: HypeData = {
  twitch: async () => TWITCH,
  trailers: async () => TRAILERS,
  wikipedia: async () => LANGS,
  steam: async () => GAMES,
};

/**
 * The same illustrative data in the collector's `signals.json` shape. It type-checks
 * against the generated `Signals`, so a schema change that breaks the page breaks
 * `tsc` first. Times are anchored to launch so the object is deterministic.
 */
export function mockSignals(): Signals {
  const launch = Date.parse("2026-11-19T05:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
  const H = 3600_000;
  const now = launch + 24 * H;
  const steamSeries = (s: (number | null)[]) =>
    s.map((players, i) => ({
      hour: iso(now - (24 - i) * H),
      players: players === null ? null : Math.round(players),
    })) as NonNullable<Signals["steam"]>["games"][number]["series_24h"];
  return {
    schema_version: 1,
    generated_at: iso(now),
    launch_at: iso(launch),
    twitch: {
      game_id: "mock",
      game_name: "Grand Theft Auto VI",
      tracking_since: iso(launch - 24 * H),
      updated_at: iso(now),
      current_viewers: Math.round(TWITCH.currentViewers),
      current_streams: 0,
      current_truncated: false,
      peak_viewers: Math.round(TWITCH.peakViewers),
      peak_at: iso(launch + TW.slice(24).indexOf(TWITCH.peakViewers) * H),
      hours_watched: Math.round(TWITCH.hoursWatched),
      hourly: TWITCH.points.map((p) => ({
        hour: iso(launch + p.hoursFromLaunch * H),
        hours_from_launch: p.hoursFromLaunch,
        avg_viewers: Math.round(p.viewers),
        max_viewers: Math.round(p.viewers),
        samples: 12,
      })),
      by_language: [],
      top_streams: [],
      comparison: [],
    },
    steam: {
      tracking_since: iso(now - 24 * H),
      updated_at: iso(now),
      games: GAMES.map((g) => ({
        key: g.id,
        app_id: g.appId,
        name: g.name,
        current_players: g.currentPlayers === null ? null : Math.round(g.currentPlayers),
        current_at: iso(now),
        peak_24h: g.peak24h === null ? null : Math.round(g.peak24h),
        observed_peak: g.peak24h === null ? null : Math.round(g.peak24h),
        observed_peak_at: iso(now),
        series_24h: steamSeries(g.series24h),
      })),
    },
    youtube: {
      updated_at: iso(now),
      total_views: Math.round(T1[30] + T2[30]),
      videos: TRAILERS.map((t) => ({
        video_id: t.id,
        label: t.label,
        views: Math.round(t.currentViews),
        likes: null,
        comments: null,
        fetched_at: iso(now),
      })),
    },
    wikipedia: {
      updated_at: iso(now),
      item_id: "Q23648408",
      window_end: "2026-11-19",
      total_last_7d: LANGS.reduce((s, l) => s + l.views, 0),
      total_since_launch: 0,
      editions: LANGS.map((l) => ({
        lang: l.code,
        project: `${l.code}.wikipedia`,
        title: "Grand Theft Auto VI",
        views_last_7d: l.views,
        views_since_launch: 0,
        latest_day: "2026-11-19",
      })),
    },
  };
}
