/*
 * View models the page renders. The signals.json adapter (`adapt.ts`) produces these, so
 * components never see the collector's shape.
 */

/** Where a card's numbers came from: this fetch, or the last good snapshot. */
export type Origin = "live" | "fallback";

/** One source's view model plus how fresh it is. */
export interface Sourced<T> {
  data: T;
  /** "fallback": the live fetch failed or was malformed; the card says "last known". */
  origin: Origin;
  /** The source's own updated_at (ISO). */
  updatedAt: string;
}

/** One hourly bucket of the GTA VI Twitch category. */
export interface TwitchPoint {
  /** Start of the UTC hour, in whole hours from launch. */
  hoursFromLaunch: number;
  /** Mean of the snapshots in the hour (what the chart draws). */
  viewers: number;
  /** Highest single snapshot in the hour (what peaks are taken from). */
  maxViewers: number;
}

/** Concurrent viewers in the GTA VI Twitch category, since the collector started. */
export interface TwitchSeries {
  /** Hourly, ascending. Nothing exists before `trackingSince`. */
  points: TwitchPoint[];
  /** First snapshot (ISO). */
  trackingSince: string;
  currentViewers: number;
  /** Highest single snapshot since tracking began, and when (ISO). */
  peakViewers: number;
  peakAt: string;
  /** The collector's estimate since tracking began. */
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
}

/** Live YouTube totals, when the collector samples YouTube. */
export interface YouTubeTotals {
  totalViews: number;
  videos: { id: string; label: string; views: number }[];
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

export interface WikipediaViews {
  /** Last-7-days views per edition, descending. */
  languages: LanguageViews[];
  total7d: number;
  /** Last day in the 7-day window (YYYY-MM-DD). */
  windowEnd: string;
}

export interface SteamGame {
  /** Stable id shared with the collector (gtav, rdr2, cs2, cp77, er, bg3, gtav_enhanced). */
  id: string;
  appId: number;
  name: string;
  currentPlayers: number | null;
  peak24h: number | null;
  /**
   * The higher of the curated all-time peak (SteamDB/SteamCharts, approximate) and the
   * highest reading the collector has seen; null when neither is known.
   */
  allTimePeak: number | null;
  /** Which of the two `allTimePeak` is. */
  allTimePeakSource: "curated" | "observed" | null;
  /** 25 hourly points, oldest first, ending with the current hour; null = no reading. */
  series24h: (number | null)[];
  /** Cover art under /public, if we have one. */
  cover?: CoverArt;
}

export interface SteamData {
  /** First Steam reading (ISO); the 24h series is empty before it. */
  trackingSince: string;
  games: SteamGame[];
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

/** One Steam game's review count and the estimated-sales range drawn from it. */
export interface ReviewEstimate {
  /** Same ids as SteamGame (gtav, rdr2, cs2, ...). */
  id: string;
  name: string;
  totalReviews: number;
  positive: number;
  negative: number;
  /** Reviews in the 7 complete days before the read (Steam's own daily counts). */
  newReviews7d: number | null;
  /** Estimated copies sold, low..high; null where the method does not apply. */
  estimate: { low: number; high: number } | null;
  /** Why there is no estimate (free to play, a free upgrade). */
  noEstimateReason: string | null;
}

export interface SteamReviews {
  games: ReviewEstimate[];
  method: { name: string; low: number; high: number; sources: string[] };
}

/** A Take-Two-reported figure, as curated in the collector with its source. */
export interface OfficialFigure {
  key: string;
  label: string;
  value: number;
  /** Upper end when the report gives a range. */
  valueMax: number | null;
  /** The report's own hedge ("nearly 235 million"). */
  qualifier: "nearly" | "over" | null;
  unit: "units" | "usd";
  /** YYYY-MM or YYYY-MM-DD. */
  asOf: string;
  sourceTitle: string;
  sourceUrl: string;
  quote: string;
}

/** Everything the page renders. A null source is unavailable live and in the fallback. */
export interface PageData {
  /** The payload's generated_at (ISO). */
  generatedAt: string;
  twitch: Sourced<TwitchSeries> | null;
  steam: Sourced<SteamData> | null;
  wikipedia: Sourced<WikipediaViews> | null;
  /** null while the collector's YouTube sampling is off. */
  youtube: Sourced<YouTubeTotals> | null;
  /** Curated first-30-day curves; not a feed. */
  trailers: TrailerSeries[];
  /** business.steam_reviews: null until the collector samples it. */
  reviews: Sourced<SteamReviews> | null;
  /** business.official: the curated Take-Two figures. */
  official: Sourced<OfficialFigure[]> | null;
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
