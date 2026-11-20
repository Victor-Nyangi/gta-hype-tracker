import type { TwitchPoint, TwitchSeries } from "./data/types";
import { LAUNCH_MS } from "./time";

const HOUR = 3600_000;

/** The Twitch chart always spans 48 hours (design/README.md §2). */
export const WINDOW_HOURS = 48;

export interface TwitchView {
  /** The hourly points inside the window, ascending. */
  points: TwitchPoint[];
  /** The window, in hours from launch: [start, end], end - start = 48. */
  start: number;
  end: number;
  /** When tracking began, in (fractional) hours from launch. */
  trackingFrom: number;
  current: number;
  peak: number;
  peakAt: string;
  hoursWatched: number;
}

/**
 * What the Twitch card shows. The window is the design's -24h..+24h around launch until
 * the data runs past +24h; then it slides so the newest hour stays on the right edge
 * (the "Doors open" marker moves left with launch, and leaves after +48h).
 *
 * data: real data starts at `trackingSince` (the collector started at launch +14.6h), so
 * the left of the default window is empty; the card says so instead of drawing it.
 * Points are hour buckets, so the first one (19:00 UTC) starts a little before tracking
 * did (19:39): it is the mean of the snapshots after 19:39.
 */
export function twitchView(series: TwitchSeries): TwitchView {
  const latest = series.points.at(-1)?.hoursFromLaunch ?? WINDOW_HOURS / 2;
  const end = Math.max(WINDOW_HOURS / 2, latest);
  const start = end - WINDOW_HOURS;
  return {
    points: series.points.filter((p) => p.hoursFromLaunch >= start && p.hoursFromLaunch <= end),
    start,
    end,
    trackingFrom: (Date.parse(series.trackingSince) - LAUNCH_MS) / HOUR,
    current: series.currentViewers,
    peak: series.peakViewers,
    peakAt: series.peakAt,
    hoursWatched: series.hoursWatched,
  };
}

/** Axis ticks every 12h that fall inside the window (−24h, −12h, Launch, +12h, +24h at first). */
export function twitchTicks(view: Pick<TwitchView, "start" | "end">): number[] {
  const ticks: number[] = [];
  for (let h = Math.ceil(view.start / 12) * 12; h <= view.end; h += 12) ticks.push(h);
  return ticks;
}
