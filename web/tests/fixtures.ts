import type { Signals } from "@/lib/data";
import { STEAM_GAMES } from "@/lib/data";

type SteamSeries = NonNullable<Signals["steam"]>["games"][number]["series_24h"];

const H = 3600_000;
const LAUNCH = Date.parse("2026-11-19T05:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/**
 * A small signals.json in the collector's real shape, modelled on the live file at
 * launch +24h: Twitch tracked from 19:39 UTC (+14.66h) with hourly buckets +14..+24,
 * Steam from 18:47 UTC with 13 empty hours at the start of its 24h series, YouTube off.
 * Deterministic, so tests do not depend on the bundled fallback snapshot's values.
 */
export function makeSignals({ endHour = 24 }: { endHour?: number } = {}): Signals {
  const now = LAUNCH + endHour * H;
  const hourly = Array.from({ length: endHour - 14 + 1 }, (_, i) => {
    const h = 14 + i;
    const avg = Math.max(300_000, 2_350_000 - i * 150_000);
    return {
      hour: iso(LAUNCH + h * H),
      hours_from_launch: h,
      avg_viewers: avg,
      max_viewers: avg + 20_000,
      samples: i === 0 ? 5 : 12,
    };
  });
  const steamHours = Array.from({ length: 25 }, (_, i) => now - (24 - i) * H);
  return {
    schema_version: 1,
    generated_at: iso(now + 25 * 60_000),
    launch_at: iso(LAUNCH),
    twitch: {
      game_id: "1867279146",
      game_name: "Grand Theft Auto VI",
      tracking_since: "2026-11-19T19:39:47.733374Z",
      updated_at: iso(now + 25 * 60_000),
      current_viewers: 827_094,
      current_streams: 8351,
      current_truncated: true,
      peak_viewers: 2_392_628,
      peak_at: "2026-11-19T21:25:00.000399Z",
      hours_watched: 16_241_499,
      hourly,
      by_language: [{ language: "en", viewers: 600_300, streams: 5866, share: 0.7258 }],
      top_streams: [{ user_login: "caseoh_", viewer_count: 90_840, language: "en" }],
      comparison: [],
    },
    steam: {
      tracking_since: "2026-11-19T18:47:01.653755Z",
      updated_at: iso(now + 25 * 60_000),
      games: STEAM_GAMES.map((g, gi) => ({
        key: g.id,
        app_id: g.appId,
        name: g.name,
        current_players: 10_000 * (gi + 1),
        current_at: iso(now + 25 * 60_000),
        peak_24h: 20_000 * (gi + 1),
        observed_peak: 20_000 * (gi + 1),
        observed_peak_at: "2026-11-19T18:47:01.653755Z",
        series_24h: steamHours.map((h, i) => ({
          hour: iso(h),
          players: i < 13 ? null : 10_000 * (gi + 1) + i,
        })) as SteamSeries,
      })),
    },
    youtube: null,
    wikipedia: {
      updated_at: "2026-11-19T19:39:59.981059Z",
      item_id: "Q23648408",
      window_end: "2026-11-18",
      total_last_7d: 1_300_000,
      total_since_launch: 0,
      editions: [
        { lang: "en", project: "en.wikipedia", title: "Grand Theft Auto VI", views_last_7d: 1_000_000, views_since_launch: 0, latest_day: "2026-11-18" },
        { lang: "fa", project: "fa.wikipedia", title: "جی‌تی‌ای ۶", views_last_7d: 200_000, views_since_launch: 0, latest_day: "2026-11-18" },
        { lang: "xx", project: "xx.wikipedia", title: "GTA VI", views_last_7d: 100_000, views_since_launch: 0, latest_day: null },
      ],
    },
  };
}

/** A deep copy that can be broken in place. */
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
