/* Generated from collector/schema/signals.schema.json by scripts/gen-signals.mjs. Do not edit. */

export interface Signals {
  schema_version: 1;
  generated_at: string;
  launch_at: string;
  twitch: TwitchSignals | null;
  steam: SteamSignals | null;
  youtube: YouTubeSignals | null;
  wikipedia: WikipediaSignals | null;
  /**
   * Money signals: Steam review counts, curated Take-Two figures, share prices
   */
  business?: BusinessSignals | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TwitchSignals".
 */
export interface TwitchSignals {
  game_id: string;
  game_name: string;
  /**
   * First snapshot; nothing before is known
   */
  tracking_since: string;
  /**
   * Latest snapshot
   */
  updated_at: string;
  current_viewers: number;
  current_streams: number;
  /**
   * True if the latest snapshot stopped before the last page (safety page cap, time budget, rate limit or a failing page), so the long tail is not counted
   */
  current_truncated: boolean;
  peak_viewers: number;
  peak_at: string;
  /**
   * Estimate since tracking_since: trapezoid integral of total viewers over time, skipping gaps longer than 15 minutes
   */
  hours_watched: number;
  hourly: TwitchHourPoint[];
  /**
   * Latest snapshot, viewers desc
   */
  by_language: TwitchLanguage[];
  /**
   * Latest snapshot, top 10
   */
  top_streams: TwitchStream[];
  /**
   * Other categories, e.g. GTA V
   */
  comparison: TwitchGameSummary[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TwitchHourPoint".
 */
export interface TwitchHourPoint {
  /**
   * Start of the UTC hour bucket
   */
  hour: string;
  /**
   * hour minus launch, in whole hours
   */
  hours_from_launch: number;
  avg_viewers: number;
  max_viewers: number;
  /**
   * Snapshots that fell in this hour
   */
  samples: number;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TwitchLanguage".
 */
export interface TwitchLanguage {
  /**
   * Twitch stream language (ISO 639-1, or 'other')
   */
  language: string;
  viewers: number;
  streams: number;
  /**
   * viewers / total viewers, 0..1
   */
  share: number;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TwitchStream".
 */
export interface TwitchStream {
  user_login: string;
  viewer_count: number;
  language: string;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TwitchGameSummary".
 */
export interface TwitchGameSummary {
  key: string;
  game_id: string;
  name: string;
  current_viewers: number;
  current_streams: number;
  peak_viewers: number;
  peak_at: string;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SteamSignals".
 */
export interface SteamSignals {
  tracking_since: string;
  updated_at: string;
  games: SteamGame[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SteamGame".
 */
export interface SteamGame {
  /**
   * Stable id shared with the web (gtav, rdr2, cs2, ...)
   */
  key: string;
  app_id: number;
  name: string;
  current_players: number | null;
  current_at: string | null;
  /**
   * Max single reading in the 24h before generated_at. When peak_24h_partial is true the readings only go back to peak_24h_since, so this is the max of a shorter window
   */
  peak_24h: number | null;
  /**
   * Max single reading since tracking began
   */
  observed_peak: number | null;
  observed_peak_at: string | null;
  /**
   * Exactly 25 hourly points, oldest first, ending with the current hour
   *
   * @minItems 25
   * @maxItems 25
   */
  series_24h: [
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint,
    SteamPoint
  ];
  /**
   * When the peak_24h reading was taken (earliest, on a tie)
   */
  peak_24h_at?: string | null;
  /**
   * Oldest reading inside the 24h window: where peak_24h's window really starts
   */
  peak_24h_since?: string | null;
  /**
   * True when peak_24h_since is more than 15 minutes after generated_at minus 24h (tracking began, or resumed after an outage, inside the window), so peak_24h covers less than 24 hours
   */
  peak_24h_partial?: boolean;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SteamPoint".
 */
export interface SteamPoint {
  /**
   * Start of the UTC hour bucket
   */
  hour: string;
  /**
   * Mean of readings in the hour; null if none
   */
  players: number | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "YouTubeSignals".
 */
export interface YouTubeSignals {
  updated_at: string;
  total_views: number;
  videos: YouTubeVideo[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "YouTubeVideo".
 */
export interface YouTubeVideo {
  video_id: string;
  label: string;
  views: number;
  likes: number | null;
  comments: number | null;
  fetched_at: string;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "WikipediaSignals".
 */
export interface WikipediaSignals {
  updated_at: string;
  /**
   * Wikidata item of the GTA VI article
   */
  item_id: string | null;
  /**
   * Last day included in the 7-day window
   */
  window_end: string;
  total_last_7d: number;
  /**
   * Sum of views_since_launch. 0 while since_launch_pending is true: that 0 means 'not published yet', not 'no views'
   */
  total_since_launch: number;
  /**
   * views_last_7d desc
   */
  editions: WikiEdition[];
  /**
   * First UTC day counted in the since-launch sums
   */
  launch_day?: string | null;
  /**
   * True until Wikimedia has published launch_day for any edition. Show 'pending', not total_since_launch
   */
  since_launch_pending?: boolean;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "WikiEdition".
 */
export interface WikiEdition {
  /**
   * Wikipedia language code (en, es, zh-yue, ...)
   */
  lang: string;
  /**
   * e.g. en.wikipedia
   */
  project: string;
  title: string;
  views_last_7d: number;
  /**
   * Sum of daily views from launch_day on. 0 while since_launch_pending is true: that 0 means 'not published yet', not 'no views'
   */
  views_since_launch: number;
  latest_day: string | null;
  /**
   * True while no day from launch_day on has been fetched for this edition (Wikimedia publishes a day's views some hours after it ends)
   */
  since_launch_pending?: boolean;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "BusinessSignals".
 */
export interface BusinessSignals {
  /**
   * Steam review counts and estimated-sales ranges; null until first sampled
   */
  steam_reviews: SteamReviewSignals | null;
  /**
   * Hand-curated Take-Two figures, each with its source; null if unavailable
   */
  official: OfficialFigures | null;
  /**
   * Daily closes for TTWO, peers and QQQ (Alpha Vantage); null until fetched
   */
  prices?: PriceSignals | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SteamReviewSignals".
 */
export interface SteamReviewSignals {
  tracking_since: string;
  updated_at: string;
  method: SalesEstimateMethod;
  games: SteamReviewGame[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SalesEstimateMethod".
 */
export interface SalesEstimateMethod {
  /**
   * One line: how reviews become an estimated-sales range
   */
  name: string;
  /**
   * Low multiple of all-time reviews
   */
  multiplier_low: number;
  /**
   * High multiple of all-time reviews
   */
  multiplier_high: number;
  /**
   * Where the multiples come from (URLs)
   */
  sources: string[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "SteamReviewGame".
 */
export interface SteamReviewGame {
  /**
   * Same keys as steam.games (gtav, rdr2, cs2, ...)
   */
  key: string;
  app_id: number;
  name: string;
  /**
   * All-time Steam user reviews, every language
   */
  total_reviews: number;
  positive: number;
  negative: number;
  fetched_at: string;
  /**
   * Reviews posted in the 7 complete UTC days before fetched_at's day, from Steam's own daily counts; null if Steam sent none
   */
  new_reviews_7d: number | null;
  /**
   * total_reviews minus the total at the latest reading at least 7 days older; null until the tracker has a reading that old
   */
  change_7d: number | null;
  /**
   * When that older reading was taken
   */
  change_7d_since: string | null;
  /**
   * total_reviews x method.multiplier_low. An estimate, not a reported figure; null where the method does not apply (see no_estimate_reason)
   */
  estimated_sales_low: number | null;
  /**
   * total_reviews x method.multiplier_high
   */
  estimated_sales_high: number | null;
  /**
   * Why there is no estimate (free to play, a free upgrade), else null
   */
  no_estimate_reason: string | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "OfficialFigures".
 */
export interface OfficialFigures {
  /**
   * When the curated list was last checked
   */
  updated_at: string;
  figures: OfficialFigure[];
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "OfficialFigure".
 */
export interface OfficialFigure {
  /**
   * Stable id, e.g. gtav_units
   */
  key: string;
  label: string;
  /**
   * The figure as reported (units, or US dollars)
   */
  value: number;
  /**
   * Upper end when the report gives a range
   */
  value_max: number | null;
  /**
   * The report's own hedge: 'nearly 235 million' is value 235000000, 'nearly'
   */
  qualifier: ("nearly" | "over") | null;
  unit: "units" | "usd";
  /**
   * YYYY-MM or YYYY-MM-DD, as precise as the source
   */
  as_of: string;
  source_title: string;
  source_url: string;
  /**
   * The source's own words for the figure
   */
  quote: string;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "PriceSignals".
 */
export interface PriceSignals {
  /**
   * Data provider, e.g. Alpha Vantage
   */
  source: string;
  source_url: string;
  /**
   * Which series: daily closes, unadjusted
   */
  series: string;
  /**
   * First fetch that returned closes
   */
  tracking_since: string;
  /**
   * Latest fetch that returned closes
   */
  updated_at: string;
  /**
   * Last trading day before launch (2026-11-18)
   */
  launch_from: string;
  /**
   * Launch day (2026-11-19)
   */
  launch_to: string;
  /**
   * Symbol the page leads with (TTWO)
   */
  subject: string;
  /**
   * Market baseline symbol (QQQ)
   */
  baseline: string;
  tickers: TickerPrices[];
  /**
   * TTWO vs QQQ over launch_day; null unless both have it
   */
  subject_vs_baseline_launch_day: RelativeChange | null;
  /**
   * TTWO vs QQQ over since_launch; null unless both have it
   */
  subject_vs_baseline_since_launch: RelativeChange | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "TickerPrices".
 */
export interface TickerPrices {
  /**
   * TTWO, EA, SONY, QQQ
   */
  symbol: string;
  name: string;
  /**
   * subject: Take-Two; peer: other publishers; baseline: the market (QQQ)
   */
  role: "subject" | "peer" | "baseline";
  /**
   * Every daily close the tracker has, oldest first. Merged across fetches, the latest fetch winning per day
   */
  closes: PricePoint[];
  first_date: string;
  latest_date: string;
  latest_close: number;
  /**
   * Latest fetch that returned closes for it
   */
  fetched_at: string;
  /**
   * launch_from close -> launch_to close; null until both are known
   */
  launch_day: PriceChange | null;
  /**
   * launch_from close (the last close before launch) -> latest close; null until there is a close after launch_from
   */
  since_launch: PriceChange | null;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "PricePoint".
 */
export interface PricePoint {
  /**
   * US trading day (New York)
   */
  date: string;
  /**
   * Unadjusted daily close, USD
   */
  close: number;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "PriceChange".
 */
export interface PriceChange {
  from_date: string;
  from_close: number;
  to_date: string;
  to_close: number;
  /**
   * to_close minus from_close, USD
   */
  change: number;
  /**
   * Percent, e.g. -3.25 for -3.25%
   */
  change_pct: number;
}
/**
 * This interface was referenced by `Signals`'s JSON-Schema
 * via the `definition` "RelativeChange".
 */
export interface RelativeChange {
  subject_pct: number;
  baseline_pct: number;
  /**
   * subject_pct minus baseline_pct, in percentage points (+ beat the market)
   */
  difference_pts: number;
}
