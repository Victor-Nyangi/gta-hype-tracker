import { cacheLife } from "next/cache";
import { resolvePageData } from "./adapt";
import fallbackJson from "./fallback-signals.json";
import { checkSignals } from "./guard";
import type { Signals } from "./signals.generated";
import type { PageData } from "./types";

/** The collector's public snapshot (deploy/Caddyfile): CORS *, max-age=60, rebuilt every 5 min. */
export const DEFAULT_SIGNALS_URL = "https://gta-data.nyangi.dev/signals.json";

/** SIGNALS_URL overrides it (no Vercel variable is needed for the public one). */
export const signalsUrl = (): string => process.env.SIGNALS_URL || DEFAULT_SIGNALS_URL;

/** The last good snapshot, bundled at build (`pnpm snapshot:signals`). */
export const FALLBACK_SIGNALS = fallbackJson as Signals;

/** Fetches and checks signals.json; null on any network, HTTP, JSON or envelope failure. */
export async function fetchSignals(url: string, fetchImpl: typeof fetch = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const checked = checkSignals(await res.json());
    if (!checked) throw new Error("payload failed the Signals check");
    if (checked.invalid.length) console.warn(`signals: malformed source(s) ${checked.invalid.join(", ")}; using the fallback for them`);
    return checked;
  } catch (err) {
    console.warn(`signals: ${url} unavailable (${err instanceof Error ? err.message : err}); using the fallback snapshot`);
    return null;
  }
}

export interface LoadedPage {
  data: PageData;
  /** Where the browser refreshes from: the same URL, fetched directly (CORS allows it). */
  url: string;
}

/**
 * Everything the page renders, in one cached call.
 *
 * Cache Components: `"use cache"` + `cacheLife("minutes")` (stale 5 min, revalidate 60s,
 * expire 1h). The result is prerendered into the page at build, so the HTML carries real
 * numbers without JS, and the page is regenerated in the background (ISR-style) at most
 * once a minute, on the first request after the 60s are up; the collector rewrites the
 * file every 5 minutes, so that is as fresh as it gets. `stale` stays at 5 minutes on
 * purpose: under that, the entry would leave the route's static App Shell. The browser
 * refresh (components/live) covers the minute between regenerations.
 *
 * A failed fetch is cached too (as the fallback, labelled "last known"), and retried on the
 * same 60s schedule.
 */
export async function loadPageData(): Promise<LoadedPage> {
  "use cache";
  cacheLife("minutes");
  const url = signalsUrl();
  return { data: resolvePageData(await fetchSignals(url), FALLBACK_SIGNALS), url };
}
