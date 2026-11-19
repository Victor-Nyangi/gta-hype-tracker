"use client";

import { useSyncExternalStore } from "react";

/*
 * One shared 1-second ticker for every clock on the page. The server snapshot is `null`:
 * the time is never read during prerender (Cache Components forbids it in the static
 * shell), so the server HTML carries a placeholder and the browser fills it in on
 * hydration, then ticks on each whole second.
 */

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  now = Math.floor(Date.now() / 1000) * 1000;
  listeners.forEach((l) => l());
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) tick();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  if (!now) now = Math.floor(Date.now() / 1000) * 1000;
  return now;
}

function getServerSnapshot() {
  return null;
}

/** Current time floored to the second, or `null` on the server and during hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
