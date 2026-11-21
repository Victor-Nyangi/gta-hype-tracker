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

type PriceSignals = NonNullable<NonNullable<Signals["business"]>["prices"]>;
type TickerPrices = PriceSignals["tickers"][number];

/** Weekdays from `from` to `to` inclusive (YYYY-MM-DD), like a trading calendar without holidays. */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 24 * H) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const pct = (a: number, b: number) => Math.round(((b - a) / a) * 100 * 1e4) / 1e4;

function ticker(symbol: string, name: string, role: TickerPrices["role"], days: string[], close: (i: number) => number): TickerPrices {
  const closes = days.map((date, i) => ({ date, close: Math.round(close(i) * 1e4) / 1e4 }));
  const at = new Map(closes.map((c) => [c.date, c.close]));
  const last = closes.at(-1)!;
  const change = (from: string, to: string) => {
    const a = at.get(from);
    const b = at.get(to);
    if (a === undefined || b === undefined || to <= from) return null;
    return { from_date: from, from_close: a, to_date: to, to_close: b, change: Math.round((b - a) * 1e4) / 1e4, change_pct: pct(a, b) };
  };
  return {
    symbol,
    name,
    role,
    closes,
    first_date: closes[0].date,
    latest_date: last.date,
    latest_close: last.close,
    fetched_at: "2026-11-20T22:30:12Z",
    launch_day: change("2026-11-18", "2026-11-19"),
    since_launch: change("2026-11-18", last.date),
  };
}

/**
 * SYNTHETIC share prices in the collector's `business.prices` shape, for tests only: made-up
 * closes on a weekday calendar. Never copy this into the bundled fallback.
 */
export function makePrices({ from = "2026-07-01", to = "2026-11-20" }: { from?: string; to?: string } = {}): PriceSignals {
  const days = weekdays(from, to);
  const launch = days.indexOf("2026-11-19");
  const tickers = [
    // TTWO drifts up, drops $20 on launch day, then climbs $5 a day
    ticker("TTWO", "Take-Two Interactive", "subject", days, (i) =>
      launch < 0 || i < launch ? 200 + i * 0.5 : 180 + i * 0.5 + (i - launch) * 5,
    ),
    ticker("EA", "Electronic Arts", "peer", days, (i) => 150 + (i % 5)),
    ticker("SONY", "Sony Group (ADR)", "peer", days, (i) => 25 + i * 0.01),
    ticker("QQQ", "Invesco QQQ Trust (Nasdaq-100)", "baseline", days, (i) => 500 + i),
  ];
  const [ttwo, , , qqq] = tickers;
  const rel = (a: TickerPrices["launch_day"], b: TickerPrices["launch_day"]) =>
    a && b ? { subject_pct: a.change_pct, baseline_pct: b.change_pct, difference_pts: Math.round((a.change_pct - b.change_pct) * 1e4) / 1e4 } : null;
  return {
    source: "Synthetic test data",
    source_url: "https://www.alphavantage.co/",
    series: "TIME_SERIES_DAILY: daily closes, unadjusted",
    tracking_since: "2026-11-20T22:30:12Z",
    updated_at: "2026-11-20T22:30:12Z",
    launch_from: "2026-11-18",
    launch_to: "2026-11-19",
    subject: "TTWO",
    baseline: "QQQ",
    tickers,
    subject_vs_baseline_launch_day: rel(ttwo.launch_day, qqq.launch_day),
    subject_vs_baseline_since_launch: rel(ttwo.since_launch, qqq.since_launch),
  };
}
