/*
 * signals.json -> view models. Pure, so the server (first render) and the browser (the
 * 60s refresh) map the payload the same way.
 */
import { LANGUAGE_COUNTRIES, STEAM_GAMES } from "./constants";
import { checkSignals, type CheckedSignals } from "./guard";
import type {
  OfficialFigures,
  PriceSignals,
  Signals,
  SteamReviewSignals,
  SteamSignals,
  TwitchSignals,
  WikipediaSignals,
  YouTubeSignals,
} from "./signals.generated";
import { TRAILERS } from "./trailers";
import type {
  OfficialFigure,
  PageData,
  PriceMove,
  SharePrices,
  SteamReviews,
  Sourced,
  SteamData,
  SteamGame,
  TickerSeries,
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

export function adaptSteamReviews(r: SteamReviewSignals): SteamReviews | null {
  if (r.games.length === 0) return null;
  return {
    games: r.games.map((g) => ({
      id: g.key,
      name: CURATED.get(g.key)?.name ?? g.name,
      totalReviews: g.total_reviews,
      positive: g.positive,
      negative: g.negative,
      newReviews7d: g.new_reviews_7d,
      // data: both ends or neither; a half range would read as a point estimate
      estimate:
        g.estimated_sales_low !== null && g.estimated_sales_high !== null
          ? { low: g.estimated_sales_low, high: g.estimated_sales_high }
          : null,
      noEstimateReason: g.no_estimate_reason,
    })),
    method: {
      name: r.method.name,
      low: r.method.multiplier_low,
      high: r.method.multiplier_high,
      sources: r.method.sources,
    },
  };
}

export function adaptOfficial(o: OfficialFigures): OfficialFigure[] | null {
  if (o.figures.length === 0) return null;
  return o.figures.map((f) => ({
    key: f.key,
    label: f.label,
    value: f.value,
    valueMax: f.value_max,
    qualifier: f.qualifier,
    unit: f.unit,
    asOf: f.as_of,
    sourceTitle: f.source_title,
    sourceUrl: f.source_url,
    quote: f.quote,
  }));
}

type Ticker = PriceSignals["tickers"][number];
type Change = Ticker["launch_day"];

const move = (c: Change): PriceMove | null => (c ? { pct: c.change_pct, from: c.from_date, to: c.to_date } : null);

function adaptTicker(t: Ticker): TickerSeries {
  return {
    symbol: t.symbol,
    name: t.name,
    closes: t.closes.map((p) => ({ date: p.date, close: p.close })),
    latestClose: t.latest_close,
    latestDate: t.latest_date,
    launchDay: move(t.launch_day),
    sinceLaunch: move(t.since_launch),
  };
}

/** Days a ticker's newest close may trail the newest of the others before it is left out. */
export const STALE_AFTER_DAYS = 10;

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/**
 * The tickers whose newest close is within STALE_AFTER_DAYS of the newest close among the
 * others. The collector already leaves stale tickers out (EA stopped at 2026-08-04 when it
 * went private); this keeps an older payload from putting one on the page.
 */
function freshTickers(tickers: Ticker[]): Ticker[] {
  return tickers.filter((t) => {
    const others = tickers.filter((o) => o !== t && o.closes.length > 0).map((o) => dayNumber(o.latest_date));
    return others.length === 0 || Math.max(...others) - dayNumber(t.latest_date) <= STALE_AFTER_DAYS;
  });
}

/** null when Take-Two has fewer than two closes: one point is not a line. */
export function adaptPrices(p: PriceSignals): SharePrices | null {
  const tickers = freshTickers(p.tickers.filter((t) => t.closes.length > 0));
  const subject = tickers.find((t) => t.symbol === p.subject);
  if (!subject || subject.closes.length < 2) return null;
  const baseline = tickers.find((t) => t.symbol === p.baseline);
  return {
    subject: adaptTicker(subject),
    baseline: baseline ? adaptTicker(baseline) : null,
    peers: tickers.filter((t) => t.role === "peer").map(adaptTicker),
    vsBaseline: {
      launchDay: p.subject_vs_baseline_launch_day?.difference_pts ?? null,
      sinceLaunch: p.subject_vs_baseline_since_launch?.difference_pts ?? null,
    },
    source: p.source,
    sourceUrl: p.source_url,
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
    // business is optional (a v1 collector leaves it out); each part falls back on its own
    reviews: sourced(
      l?.business?.steam_reviews ?? null,
      fallback.business?.steam_reviews ?? null,
      adaptSteamReviews,
      (r) => r.updated_at,
    ),
    official: sourced(
      l?.business?.official ?? null,
      fallback.business?.official ?? null,
      adaptOfficial,
      (o) => o.updated_at,
    ),
    // prices came after the rest of business: a block without it is fine
    prices: sourced(l?.business?.prices ?? null, fallback.business?.prices ?? null, adaptPrices, (p) => p.updated_at),
  };
}

/** Marks a source as last known, keeping its numbers. */
const stale = <T>(s: Sourced<T> | null): Sourced<T> | null => (s ? { ...s, origin: "fallback" } : s);

/**
 * The browser's 60s refresh: the live parts (Twitch, Steam, and the payload time) from a
 * freshly fetched signals.json; `raw` is null when the fetch failed. A source that is
 * missing or malformed keeps what the page already shows, labelled "last known".
 * Wikipedia (daily) and YouTube stay as the server rendered them. The business parts
 * (6-hourly reviews, curated figures, daily share prices) update when the refresh carries
 * them and otherwise keep what the page shows; their cards print the source's own time
 * either way.
 */
export function mergeLive(prev: PageData, raw: unknown): PageData {
  const checked = raw === null ? null : checkSignals(raw);
  if (!checked) return { ...prev, twitch: stale(prev.twitch), steam: stale(prev.steam) };
  const { twitch, steam, business, generated_at } = checked.signals;
  const reviews = sourced(business?.steam_reviews ?? null, null, adaptSteamReviews, (r) => r.updated_at);
  const official = sourced(business?.official ?? null, null, adaptOfficial, (o) => o.updated_at);
  const prices = sourced(business?.prices ?? null, null, adaptPrices, (p) => p.updated_at);
  return {
    ...prev,
    generatedAt: generated_at,
    reviews: reviews ?? prev.reviews,
    official: official ?? prev.official,
    prices: prices ?? prev.prices,
    twitch: twitch ? { data: adaptTwitch(twitch), origin: "live", updatedAt: twitch.updated_at } : stale(prev.twitch),
    steam: steam ? { data: adaptSteam(steam), origin: "live", updatedAt: steam.updated_at } : stale(prev.steam),
  };
}
