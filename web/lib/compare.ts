import { COVERS, SHORT_NAMES } from "./data/constants";
import type { CoverArt, Origin, Sourced, SteamData, SteamGame, TwitchSeries } from "./data/types";

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
  /** The chip label (SHORT_NAMES); the full name everywhere else. */
  short: string;
  source: "steam" | "twitch";
  current: number | null;
  peak24h: number | null;
  /** Steam: the all-time peak (or the observed one, if higher). Twitch: since tracking began. */
  allTimePeak: number | null;
  /** True when `allTimePeak` only covers the time since tracking began. */
  peakSinceTracking: boolean;
  /** COMPARE_POINTS hourly values, oldest first, ending now; null = no reading. */
  series24h: (number | null)[];
  /** First reading (ISO), shown when the 24h series starts with empty hours. */
  trackingSince: string;
  origin: Origin;
  updatedAt: string;
  cover?: CoverArt;
}

export function fromSteam(g: SteamGame, steam: Sourced<SteamData>): CompareGame {
  return {
    id: g.id,
    name: g.name,
    short: SHORT_NAMES[g.id] ?? g.name,
    source: "steam",
    current: g.currentPlayers,
    peak24h: g.peak24h,
    allTimePeak: g.allTimePeak,
    peakSinceTracking: g.allTimePeakSource === "observed",
    series24h: g.series24h,
    trackingSince: steam.data.trackingSince,
    origin: steam.origin,
    updatedAt: steam.updatedAt,
    cover: g.cover,
  };
}

/**
 * The last 24 hours of a Twitch series, ending at its newest point, on an hourly grid of
 * COMPARE_POINTS values. Hours between samples are interpolated; hours before the first
 * sample are null (steamPaths flat-starts them), so the vertex count never changes.
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
 * GTA VI as a Compare entry, from the same Twitch series as the Signals card, so the two
 * never disagree. With under 24h of data the series is null-padded on the left and the
 * card says when tracking began.
 */
export function fromTwitch(twitch: Sourced<TwitchSeries>): CompareGame {
  const s = twitch.data;
  const series24h = resample24h(s.points);
  const end = s.points.at(-1)?.hoursFromLaunch ?? 0;
  // peaks come from single snapshots (maxViewers), not hourly means, and include the live count
  const day = s.points.filter((p) => p.hoursFromLaunch >= end - (COMPARE_POINTS - 1)).map((p) => p.maxViewers);
  const peak24h = Math.max(s.currentViewers, ...day);
  return {
    id: GTA6_ID,
    name: "Grand Theft Auto VI",
    short: SHORT_NAMES[GTA6_ID],
    source: "twitch",
    current: s.currentViewers,
    peak24h,
    allTimePeak: Math.max(s.peakViewers, peak24h),
    peakSinceTracking: true,
    series24h,
    trackingSince: s.trackingSince,
    origin: twitch.origin,
    updatedAt: twitch.updatedAt,
    cover: COVERS.gta6,
  };
}

/** The Compare chips: GTA VI first (it is the default selection), then the Steam games. */
export function compareGames(
  steam: Sourced<SteamData> | null,
  twitch: Sourced<TwitchSeries> | null,
): CompareGame[] {
  return [
    ...(twitch ? [fromTwitch(twitch)] : []),
    ...(steam ? steam.data.games.map((g) => fromSteam(g, steam)) : []),
  ];
}

/** How many leading hours of a 24h series are empty (before tracking began). */
export const leadingGaps = (series: (number | null)[]): number => {
  const i = series.findIndex((v) => v !== null);
  return i === -1 ? series.length : i;
};
