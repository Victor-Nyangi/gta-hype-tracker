import { COVERS } from "./data/constants";
import type { CoverArt, SteamGame, TwitchSeries } from "./data/types";
import { twitchView } from "./twitch";

/** Points in every Compare chart: hourly, 24h ago through now, so paths can morph. */
export const COMPARE_POINTS = 25;

export const GTA6_ID = "gta6";

/**
 * One chip in Compare. Steam games show Steam players; GTA VI is console-only, so it shows
 * Twitch viewers instead (`source` says which, and the card labels follow it).
 */
export interface CompareGame {
  id: string;
  name: string;
  source: "steam" | "twitch";
  current: number | null;
  peak24h: number | null;
  /** Steam: the all-time peak. Twitch: the peak since tracking began. */
  allTimePeak: number | null;
  /** COMPARE_POINTS hourly values, oldest first, ending now. */
  series24h: (number | null)[];
  cover?: CoverArt;
}

export function fromSteam(g: SteamGame): CompareGame {
  return {
    id: g.id,
    name: g.name,
    source: "steam",
    current: g.currentPlayers,
    peak24h: g.peak24h,
    allTimePeak: g.allTimePeak,
    series24h: g.series24h,
    cover: g.cover,
  };
}

/**
 * The last 24 hours of a Twitch series, ending at its newest point, on an hourly grid of
 * COMPARE_POINTS values. Hours between samples are interpolated; hours before the first
 * sample are null (steamPaths fills them in), so the vertex count never changes.
 */
export function resample24h(points: TwitchSeries["points"]): (number | null)[] {
  if (points.length === 0) return Array(COMPARE_POINTS).fill(null);
  const end = points[points.length - 1].hoursFromLaunch;
  return Array.from({ length: COMPARE_POINTS }, (_, i) => {
    const t = end - (COMPARE_POINTS - 1) + i;
    const after = points.findIndex((p) => p.hoursFromLaunch >= t);
    if (after === -1) return null;
    const b = points[after];
    if (b.hoursFromLaunch === t) return b.viewers;
    if (after === 0) return null;
    const a = points[after - 1];
    return a.viewers + ((b.viewers - a.viewers) * (t - a.hoursFromLaunch)) / (b.hoursFromLaunch - a.hoursFromLaunch);
  });
}

/**
 * GTA VI as a Compare entry, from the same Twitch series (and the same `twitchView` at
 * `now`) as the Signals card, so the two never disagree.
 */
export function fromTwitch(series: TwitchSeries, now: number | null): CompareGame {
  const view = twitchView(series, now);
  const series24h = resample24h(view.points);
  const shown = series24h.filter((v): v is number => v !== null);
  // hourly values can sit under the live count, so the peaks include it
  const peak24h = Math.max(view.current, ...shown);
  return {
    id: GTA6_ID,
    name: "Grand Theft Auto VI",
    source: "twitch",
    current: view.current,
    peak24h,
    allTimePeak: Math.max(view.peak, peak24h),
    series24h,
    cover: COVERS.gta6,
  };
}

/** The Compare chips: GTA VI first (it is the default selection), then the Steam games. */
export function compareGames(steam: SteamGame[], twitch: TwitchSeries, now: number | null): CompareGame[] {
  return [fromTwitch(twitch, now), ...steam.map(fromSteam)];
}
