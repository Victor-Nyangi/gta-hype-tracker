/** Pure count-up maths, kept apart from the hook so it can be unit-tested without a DOM. */

/** design/README.md "Count-ups: easeOutQuart". */
export const easeOutQuart = (p: number): number => 1 - Math.pow(1 - p, 4);

export interface Tween {
  from: number;
  to: number;
  /** performance.now() at the start */
  start: number;
  /** ms */
  duration: number;
}

/** The tween's value at `now`, clamped to [from, to] outside its time window. */
export function tweenValue(t: Tween, now: number): number {
  const p = t.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - t.start) / t.duration));
  return t.from + (t.to - t.from) * easeOutQuart(p);
}

export const tweenDone = (t: Tween, now: number): boolean => now - t.start >= t.duration;
