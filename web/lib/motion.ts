"use client";

import { useSyncExternalStore } from "react";

/** Motion values from design/README.md "Interactions & motion". */
type Bezier = [number, number, number, number];
export const EASE_ENTRANCE: Bezier = [0.16, 1, 0.3, 1];
export const EASE_REVEAL: Bezier = [0.22, 1, 0.36, 1];

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the visitor has asked for reduced motion. Read at call time; false on the server. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** `prefers-reduced-motion`, live. `false` on the server and during hydration. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

const noop = () => () => {};

/** `false` on the server and during hydration, `true` once the client has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
