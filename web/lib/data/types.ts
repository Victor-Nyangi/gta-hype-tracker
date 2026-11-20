/*
 * View models the page renders. Every adapter (the mocks today, signals.json later)
 * produces these, so components never see an API's shape.
 */

/** Concurrent viewers in the GTA VI Twitch category, hourly around launch. */
export interface TwitchSeries {
  /** Hours relative to launch, ascending; the chart spans -24..+24. */
  points: { hoursFromLaunch: number; viewers: number }[];
  /** First real sample, or null for illustrative data. */
  trackingSince: string | null;
  currentViewers: number;
  peakViewers: number;
  hoursWatched: number;
  byLanguage: { language: string; viewers: number }[];
}

export interface TrailerSeries {
  id: string;
  label: string;
  /** Token name for the line colour. */
  color: "violet" | "orange";
  /** Cumulative views by day since release, day 0 first. */
  viewsByDay: number[];
  currentViews: number;
}

/** Wikipedia views of the GTA VI article for one language, with where it is mostly read. */
export interface LanguageViews {
  /** Wikipedia language code (en, es, ...). */
  code: string;
  name: string;
  views: number;
  /** ISO 3166-1 numeric ids, matching world-atlas countries-110m feature ids. */
  countries: number[];
}

export interface SteamGame {
  /** Stable id shared with the collector (gtav, rdr2, cs2, cp77, er, bg3, gtav_enhanced). */
  id: string;
  appId: number;
  name: string;
  currentPlayers: number | null;
  peak24h: number | null;
  /** All-time peak (SteamDB/SteamCharts, approximate), or null when not known. */
  allTimePeak: number | null;
  /** 25 hourly points, oldest first, ending now. */
  series24h: (number | null)[];
  /** Cover art under /public, if we have one. */
  cover?: CoverArt;
}

/** A cover-art master under /public, cropped into the Compare tile with object-fit: cover. */
export interface CoverArt {
  src: string;
  alt: string;
  /**
   * CSS object-position for the tile. The masters are square, portrait and landscape, and
   * the tile is not, so this keeps the faces or the title in frame.
   */
  position: string;
}

export interface Milestone {
  label: string;
  /** YYYY-MM-DD */
  date: string;
  tone: "violet" | "pink" | "muted" | "orange";
}

export interface WaitCounter {
  label: string;
  /** YYYY-MM-DD */
  since: string;
  color: "violet" | "pink" | "orange" | "teal";
}

/** The page's data access. Implementations: `mockHypeData` (now), signals.json (later). */
export interface HypeData {
  twitch(): Promise<TwitchSeries>;
  trailers(): Promise<TrailerSeries[]>;
  wikipedia(): Promise<LanguageViews[]>;
  steam(): Promise<SteamGame[]>;
}
