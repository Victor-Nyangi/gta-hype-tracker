import { describe, expect, it } from "vitest";
import { easeOutQuart, tweenDone, tweenValue } from "@/lib/tween";

describe("easeOutQuart", () => {
  it("runs 0 -> 1 and front-loads the motion", () => {
    expect(easeOutQuart(0)).toBe(0);
    expect(easeOutQuart(1)).toBe(1);
    expect(easeOutQuart(0.5)).toBeCloseTo(0.9375);
  });
});

describe("tweenValue", () => {
  const t = { from: 100, to: 200, start: 1000, duration: 1500 };
  it("holds `from` before the start and `to` after the end", () => {
    expect(tweenValue(t, 0)).toBe(100);
    expect(tweenValue(t, 5000)).toBe(200);
  });
  it("eases in between", () => {
    expect(tweenValue(t, 1750)).toBeCloseTo(100 + 100 * easeOutQuart(0.5));
  });
  it("counts down as well as up", () => {
    expect(tweenValue({ ...t, from: 200, to: 100 }, 2500)).toBe(100);
  });
  it("jumps straight to `to` with a zero duration", () => {
    expect(tweenValue({ ...t, duration: 0 }, 1000)).toBe(200);
  });
  it("reports completion", () => {
    expect(tweenDone(t, 2499)).toBe(false);
    expect(tweenDone(t, 2500)).toBe(true);
  });
});
