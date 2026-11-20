"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { mergeLive } from "@/lib/data/adapt";
import type { PageData } from "@/lib/data/types";
import { useHydrated } from "@/lib/motion";

/** design/README.md: live values move every minute; the collector's file is max-age=60. */
export const REFRESH_MS = 60_000;

interface LiveState {
  data: PageData;
  /** True until the browser's first refresh settles (never on the server or without JS). */
  pending: boolean;
}

const LiveContext = createContext<LiveState | null>(null);

/** The page data, refreshed in the browser. Throws outside <LiveSignals>. */
export function useLive(): LiveState {
  const v = useContext(LiveContext);
  if (!v) throw new Error("useLive outside <LiveSignals>");
  return v;
}

/**
 * Holds the server-rendered page data and keeps its live parts (Twitch, Steam, the header
 * status) fresh: it refetches signals.json straight from the collector (CORS *) on mount
 * and every 60s while the tab is visible, and as soon as a hidden tab comes back if a
 * refresh is due. Numbers move with the count-ups' 700ms change tween. A failed or
 * malformed refresh keeps the numbers and labels them "last known" (`mergeLive`).
 *
 * The server HTML carries the full data, so nothing here is needed to read the page.
 */
export function LiveSignals({ initial, url, children }: { initial: PageData; url: string; children: ReactNode }) {
  const [data, setData] = useState(initial);
  const [settled, setSettled] = useState(false);
  const hydrated = useHydrated();

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let last = 0;
    const ctrl = new AbortController();

    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      last = Date.now();
      let raw: unknown = null;
      try {
        // no-cache: revalidate with the collector (an ETag 304 when nothing changed) rather
        // than reuse a browser copy up to 60s old
        const res = await fetch(url, { cache: "no-cache", signal: ctrl.signal });
        if (res.ok) raw = await res.json();
      } catch {
        // offline, blocked, aborted or not JSON: raw stays null -> "last known"
      }
      inFlight = false;
      if (!alive) return;
      setData((prev) => mergeLive(prev, raw));
      setSettled(true);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= REFRESH_MS) void refresh();
    };

    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  return <LiveContext value={{ data, pending: hydrated && !settled }}>{children}</LiveContext>;
}
