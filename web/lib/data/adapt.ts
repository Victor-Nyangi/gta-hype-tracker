/*
 * signals.json -> view models. Pure, so the server (first render) and the browser (the
 * 60s refresh) map the payload the same way.
 */
import { LANGUAGE_COUNTRIES, STEAM_GAMES } from "./constants";
import { checkSignals, type CheckedSignals } from "./guard";
import type {
  Signals,
  SteamSignals,
  TwitchSignals,
  WikipediaSignals,
  YouTubeSignals,
} from "./signals.generated";
import { TRAILERS } from "./trailers";
import type {
  PageData,
  Sourced,
  SteamData,
  SteamGame,
  TwitchSeries,
  WikipediaViews,
  YouTubeTotals,
} from "./types";

export function adaptTwitch(t: TwitchSignals): TwitchSeries {
  // data: `current_truncated` means the latest snapshot hit the collector's page cap, so
  // the long tail of tiny streams is not in current_viewers. The tail is a rounding error
  // next to the headline number, so the page shows nothing for it.
  return {
    points: t.hourly
      .map((h) => ({ hoursFromLaunch: h.hours_from_launch, viewers: h.avg_viewers, maxViewers: h.max_viewers }))
      .sort((a, b) => a.hoursFromLaunch - b.hoursFromLaunch),
    trackingSince: t.tracking_since,
    currentViewers: t.current_viewers,
    peakViewers: t.peak_viewers,
    peakAt: t.peak_at,
    hoursWatched: t.hours_watched,
    byLanguage: t.by_language.map((l) => ({ language: l.language, viewers: l.viewers })),
  };
}

const CURATED = new Map<string, (typeof STEAM_GAMES)[number]>(STEAM_GAMES.map((g) => [g.id, g]));

export function adaptSteam(s: SteamSignals): SteamData {
  return {
    trackingSince: s.tracking_since,
    games: s.games.map((g): SteamGame => {
      const known = CURATED.get(g.key);
      const curated = known?.allTimePeak ?? null;
      const observed = g.observed_peak;
      // The curated all-time peak stands unless the collector has seen more players.
      const useObserved = observed !== null && (curated === null || observed > curated);
      return {
        id: g.key,
        appId: g.app_id,
        name: known?.name ?? g.name,
        currentPlayers: g.current_players,
        peak24h: g.peak_24h,
        allTimePeak: useObserved ? observed : curated,
        allTimePeakSource: useObserved ? "observed" : curated === null ? null : "curated",
        series24h: g.series_24h.map((p) => p.players),
        cover: known?.cover,
      };
    }),
  };
}

export function adaptWikipedia(w: WikipediaSignals): WikipediaViews {
  return {
    languages: [...w.editions]
      .sort((a, b) => b.views_last_7d - a.views_last_7d)
      .map((e) => ({
        code: e.lang,
        name: LANGUAGE_COUNTRIES[e.lang]?.name ?? e.lang,
        views: e.views_last_7d,
        // data: an edition with no mapping still lists, it just colours no country
        countries: LANGUAGE_COUNTRIES[e.lang]?.countries ?? [],
      })),
    total7d: w.total_last_7d,
    windowEnd: w.window_end,
  };
}

/** null when YouTube has nothing to show (sampling off, or no videos yet). */
export function adaptYouTube(y: YouTubeSignals): YouTubeTotals | null {
  if (y.videos.length === 0) return null;
  return {
    totalViews: y.total_views,
    videos: y.videos.map((v) => ({ id: v.video_id, label: v.label, views: v.views })),
  };
}

function sourced<T, U>(
  live: T | null,
  fallback: T | null,
  adapt: (v: T) => U | null,
  updatedAt: (v: T) => string,
): Sourced<U> | null {
  for (const [block, origin] of [
    [live, "live"],
    [fallback, "fallback"],
  ] as const) {
    if (block === null) continue;
    const data = adapt(block);
    if (data !== null) return { data, origin, updatedAt: updatedAt(block) };
  }
  return null;
}

/**
 * The page's data from a checked live payload (or null when the fetch failed or the
 * envelope was malformed) and the bundled last good snapshot. Each source falls back on
 * its own: a missing or malformed `steam` block only moves the Steam cards to "last known".
 */
export function resolvePageData(live: CheckedSignals | null, fallback: Signals): PageData {
  const l = live?.signals ?? null;
  return {
    generatedAt: l?.generated_at ?? fallback.generated_at,
    twitch: sourced(l?.twitch ?? null, fallback.twitch, adaptTwitch, (t) => t.updated_at),
    steam: sourced(l?.steam ?? null, fallback.steam, adaptSteam, (s) => s.updated_at),
    wikipedia: sourced(l?.wikipedia ?? null, fallback.wikipedia, adaptWikipedia, (w) => w.updated_at),
    youtube: sourced(l?.youtube ?? null, fallback.youtube, adaptYouTube, (y) => y.updated_at),
    trailers: TRAILERS,
  };
}

/** Marks a source as last known, keeping its numbers. */
const stale = <T>(s: Sourced<T> | null): Sourced<T> | null => (s ? { ...s, origin: "fallback" } : s);

/**
 * The browser's 60s refresh: the live parts (Twitch, Steam, and the payload time) from a
 * freshly fetched signals.json; `raw` is null when the fetch failed. A source that is
 * missing or malformed keeps what the page already shows, labelled "last known".
 * Wikipedia (daily) and YouTube stay as the server rendered them.
 */
export function mergeLive(prev: PageData, raw: unknown): PageData {
  const checked = raw === null ? null : checkSignals(raw);
  if (!checked) return { ...prev, twitch: stale(prev.twitch), steam: stale(prev.steam) };
  const { twitch, steam, generated_at } = checked.signals;
  return {
    ...prev,
    generatedAt: generated_at,
    twitch: twitch ? { data: adaptTwitch(twitch), origin: "live", updatedAt: twitch.updated_at } : stale(prev.twitch),
    steam: steam ? { data: adaptSteam(steam), origin: "live", updatedAt: steam.updated_at } : stale(prev.steam),
  };
}
