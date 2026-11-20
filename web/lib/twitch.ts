import type { TwitchSeries } from "./data/types";
import { LAUNCH_MS } from "./time";

const HOUR = 3600_000;

export interface TwitchView {
  /** Points up to the current hour; the chart never draws the future. */
  points: TwitchSeries["points"];
  current: number;
  peak: number;
  hoursWatched: number;
}

/**
 * What the Twitch card and ticker show at `now`. Points after the current hour are
 * dropped (a no-op for real data, which has no future); `now === null` (server render)
 * keeps the whole window.
 *
 * data: the illustrative series spans the full 48h, so its KPIs are derived from the
 * visible part, like the prototype. Real data carries its own current/peak/hours.
 */
export function twitchView(series: TwitchSeries, now: number | null): TwitchView {
  const illustrative = series.trackingSince === null;
  const hours = now === null ? 24 : Math.max(-24, Math.min(24, (now - LAUNCH_MS) / HOUR));
  const cutoff = Math.floor(hours);
  let points = series.points.filter((p) => p.hoursFromLaunch <= cutoff);
  if (points.length < 2) points = series.points.slice(0, 2);

  if (!illustrative) {
    return {
      points,
      current: series.currentViewers,
      peak: series.peakViewers,
      hoursWatched: series.hoursWatched,
    };
  }

  // The prototype's live wobble on the newest point while the window is still filling.
  if (now !== null && cutoff < 24) {
    const last = points[points.length - 1];
    points = [...points.slice(0, -1), { ...last, viewers: last.viewers * (1 + Math.sin(now / 1300) * 0.004) }];
  }
  const after = points.filter((p) => p.hoursFromLaunch >= 0).map((p) => p.viewers);
  return {
    points,
    current: points[points.length - 1].viewers,
    peak: Math.max(0, ...after),
    hoursWatched: after.reduce((s, v) => s + v, 0),
  };
}
