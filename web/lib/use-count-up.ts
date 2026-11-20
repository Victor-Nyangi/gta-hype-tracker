"use client";

import { useEffect, useRef, useState } from "react";
import { useSeen } from "@/components/SeenScope";
import { useHydrated, useReducedMotion } from "./motion";
import { tweenValue, type Tween } from "./tween";

export interface CountUpOptions {
  /** First count-up, from 0, once the enclosing SeenScope is in view. */
  duration?: number;
  /** Later changes of `value` tween from the current number. */
  changeDuration?: number;
}

/**
 * A number that counts up to `value` (design/README.md "Count-ups": easeOutQuart, 1500ms
 * on first view, 700ms when the value changes, starting only once the section is seen).
 *
 * The server render and reduced motion get `value` itself, so the HTML always carries the
 * real number; on the client it reads 0 until the section is seen, while it is off screen.
 */
export function useCountUp(value: number, { duration = 1500, changeDuration = 700 }: CountUpOptions = {}): number {
  const seen = useSeen();
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!seen || reduced) return;
    const first = !startedRef.current;
    startedRef.current = true;
    const tween: Tween = {
      from: currentRef.current,
      to: value,
      start: performance.now(),
      duration: first ? duration : changeDuration,
    };
    let frames = 0;
    let raf = requestAnimationFrame(function step(now) {
      frames++;
      const v = tweenValue(tween, now);
      currentRef.current = v;
      setCurrent(v);
      if (now - tween.start < tween.duration) raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      // cancelled before the first frame (a re-run or StrictMode): it never started
      if (first && frames === 0) startedRef.current = false;
    };
  }, [seen, reduced, value, duration, changeDuration]);

  if (!hydrated || reduced) return value;
  return seen ? current : 0;
}
