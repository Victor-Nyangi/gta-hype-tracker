/*
 * A runtime check of the collector's signals.json against the generated `Signals` type
 * (collector/schema/signals.schema.json). Hand-written rather than a schema library: the
 * contract is small, and this runs in the browser on every refresh.
 *
 * Sources are checked one by one, so one malformed block (say `steam`) is dropped on its
 * own and the page falls back for that card only. Unknown extra fields are allowed, so a
 * collector that adds a field does not take the page down before the web catches up.
 *
 * Only relative, type-only imports: scripts/snapshot-signals.mjs imports this file
 * directly under Node's type stripping.
 */
import type {
  Signals,
  SteamSignals,
  TwitchSignals,
  WikipediaSignals,
  YouTubeSignals,
} from "./signals.generated";

export const SOURCES = ["twitch", "steam", "youtube", "wikipedia"] as const;
export type SourceKey = (typeof SOURCES)[number];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isTime = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const orNull =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || check(v);
const arrOf =
  <T>(check: (v: unknown) => boolean) =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every(check);

/** Every key in `shape` is present on `v` and passes its check. */
function has(v: unknown, shape: Record<string, (x: unknown) => boolean>): v is Obj {
  return isObj(v) && Object.entries(shape).every(([k, check]) => k in v && check(v[k]));
}

const twitchHourPoint = (v: unknown) =>
  has(v, { hour: isTime, hours_from_launch: isInt, avg_viewers: isInt, max_viewers: isInt, samples: isInt });

export function isTwitch(v: unknown): v is TwitchSignals {
  return has(v, {
    game_id: isStr,
    game_name: isStr,
    tracking_since: isTime,
    updated_at: isTime,
    current_viewers: isInt,
    current_streams: isInt,
    current_truncated: isBool,
    peak_viewers: isInt,
    peak_at: isTime,
    hours_watched: isInt,
    hourly: arrOf(twitchHourPoint),
    by_language: arrOf((x) => has(x, { language: isStr, viewers: isInt, streams: isInt, share: isNum })),
    top_streams: arrOf((x) => has(x, { user_login: isStr, viewer_count: isInt, language: isStr })),
    comparison: arrOf((x) =>
      has(x, {
        key: isStr,
        game_id: isStr,
        name: isStr,
        current_viewers: isInt,
        current_streams: isInt,
        peak_viewers: isInt,
        peak_at: isTime,
      }),
    ),
  });
}

const steamPoint = (v: unknown) => has(v, { hour: isTime, players: orNull(isInt) });

const steamGame = (v: unknown) =>
  has(v, {
    key: isStr,
    app_id: isInt,
    name: isStr,
    current_players: orNull(isInt),
    current_at: orNull(isTime),
    peak_24h: orNull(isInt),
    observed_peak: orNull(isInt),
    observed_peak_at: orNull(isTime),
    // the schema pins exactly 25 hourly points; the Compare chart morphs on that count
    series_24h: (s) => arrOf(steamPoint)(s) && s.length === 25,
  });

export function isSteam(v: unknown): v is SteamSignals {
  return has(v, { tracking_since: isTime, updated_at: isTime, games: arrOf(steamGame) });
}

export function isYouTube(v: unknown): v is YouTubeSignals {
  return has(v, {
    updated_at: isTime,
    total_views: isInt,
    videos: arrOf((x) =>
      has(x, {
        video_id: isStr,
        label: isStr,
        views: isInt,
        likes: orNull(isInt),
        comments: orNull(isInt),
        fetched_at: isTime,
      }),
    ),
  });
}

export function isWikipedia(v: unknown): v is WikipediaSignals {
  return has(v, {
    updated_at: isTime,
    item_id: orNull(isStr),
    window_end: isDay,
    total_last_7d: isInt,
    total_since_launch: isInt,
    editions: arrOf((x) =>
      has(x, {
        lang: isStr,
        project: isStr,
        title: isStr,
        views_last_7d: isInt,
        views_since_launch: isInt,
        latest_day: orNull(isDay),
      }),
    ),
  });
}

const CHECKS: Record<SourceKey, (v: unknown) => boolean> = {
  twitch: isTwitch,
  steam: isSteam,
  youtube: isYouTube,
  wikipedia: isWikipedia,
};

export interface CheckedSignals {
  /** The payload with every malformed source replaced by null. */
  signals: Signals;
  /** Sources that were present but malformed (null in `signals`). */
  invalid: SourceKey[];
}

/**
 * Validates a parsed signals.json. Returns null when the envelope itself is wrong (not an
 * object, another schema_version, bad timestamps): nothing in it can be trusted then.
 */
export function checkSignals(raw: unknown): CheckedSignals | null {
  if (!has(raw, { schema_version: (v) => v === 1, generated_at: isTime, launch_at: isTime })) return null;
  const invalid: SourceKey[] = [];
  const out = { schema_version: 1, generated_at: raw.generated_at, launch_at: raw.launch_at } as Signals;
  for (const key of SOURCES) {
    const block = raw[key];
    if (block === null || block === undefined) {
      (out as Record<SourceKey, unknown>)[key] = null;
    } else if (CHECKS[key](block)) {
      (out as Record<SourceKey, unknown>)[key] = block;
    } else {
      invalid.push(key);
      (out as Record<SourceKey, unknown>)[key] = null;
    }
  }
  return { signals: out, invalid };
}

/** True when the whole payload is a valid `Signals` with no malformed source. */
export function isSignals(raw: unknown): raw is Signals {
  const c = checkSignals(raw);
  return c !== null && c.invalid.length === 0;
}
