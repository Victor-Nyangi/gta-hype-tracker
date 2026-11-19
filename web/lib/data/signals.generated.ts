/* Generated from collector/schema/signals.schema.json by scripts/gen-signals.mjs. Do not edit. */

export interface Signals {
  schema_version: 1;
  generated_at: string;
  launch_at: string;
  twitch: TwitchSignals | null;
  steam: SteamSignals | null;
  youtube: YouTubeSignals | null;
  wikipedia: WikipediaSignals | null;
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
   * True if the latest snapshot hit the page cap (long tail not counted)
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
   * Max single reading in the last 24h
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
  total_since_launch: number;
  /**
   * views_last_7d desc
   */
  editions: WikiEdition[];
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
  views_since_launch: number;
  latest_day: string | null;
}
