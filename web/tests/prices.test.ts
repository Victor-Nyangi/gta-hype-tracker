import { describe, expect, it } from "vitest";
import { adaptPrices, checkBusiness, checkSignals, isPrices, MILESTONES, mergeLive, resolvePageData } from "@/lib/data";
import { FALLBACK_SIGNALS } from "@/lib/data/load";
import { signedPct, signedPts, usd } from "@/lib/format";
import { pricePath, priceView } from "@/lib/prices";
import { clone, makePrices, makeSignals } from "./fixtures";

const withPrices = (prices: unknown = makePrices(), rest: Record<string, unknown> = {}) => ({
  ...makeSignals(),
  business: { steam_reviews: null, official: null, ...rest, prices },
});

describe("prices guard", () => {
  it("accepts the block, a business block from before it, and null", () => {
    expect(isPrices(makePrices())).toBe(true);
    const c = checkSignals(withPrices())!;
    expect(c.invalid).toEqual([]);
    expect(c.signals.business?.prices?.tickers[0].symbol).toBe("TTWO");
    // a business block without `prices` (the collector before this change) is still valid
    const old = { ...makeSignals(), business: { steam_reviews: null, official: FALLBACK_SIGNALS.business!.official } };
    const o = checkSignals(old)!;
    expect(o.invalid).toEqual([]);
    expect(o.signals.business?.prices).toBeNull();
    expect(checkSignals(withPrices(null))!.signals.business).toBeNull(); // nothing usable left
  });
  it("drops malformed prices on their own and keeps the other parts", () => {
    const p = clone(makePrices()) as unknown as { tickers: { closes: unknown[] }[] };
    p.tickers[0].closes[3] = { date: "2026-07-06", close: "high" };
    const c = checkSignals(withPrices(p, { official: FALLBACK_SIGNALS.business!.official }))!;
    expect(c.invalid).toEqual(["business"]);
    expect(c.signals.business?.prices).toBeNull();
    expect(c.signals.business?.official?.figures.length).toBeGreaterThan(0);
    expect(c.signals.twitch).not.toBeNull();
  });
  it("rejects non-positive closes, a non-https source link and an unknown role", () => {
    const zero = clone(makePrices());
    zero.tickers[1].latest_close = 0;
    expect(isPrices(zero)).toBe(false);
    const js = clone(makePrices());
    js.source_url = "javascript:alert(1)";
    expect(checkBusiness({ prices: js }).malformed).toBe(true);
    const role = clone(makePrices()) as unknown as { tickers: { role: string }[] };
    role.tickers[0].role = "rival";
    expect(isPrices(role)).toBe(false);
  });
});

describe("prices adapter", () => {
  it("maps TTWO, QQQ, the peers and the comparison with QQQ", () => {
    const p = adaptPrices(makePrices())!;
    expect(p.subject.symbol).toBe("TTWO");
    expect(p.baseline?.symbol).toBe("QQQ");
    expect(p.peers.map((t) => t.symbol)).toEqual(["EA", "SONY"]);
    expect(p.subject.launchDay).toMatchObject({ from: "2026-11-18", to: "2026-11-19" });
    expect(p.subject.launchDay!.pct).toBeLessThan(-7);
    expect(p.subject.sinceLaunch).toMatchObject({ from: "2026-11-18", to: "2026-11-20" });
    const qqq = p.baseline!.launchDay!.pct;
    expect(p.vsBaseline.launchDay).toBeCloseTo(p.subject.launchDay!.pct - qqq, 3);
    expect(p.source).toBe("Synthetic test data");
  });
  it("is null with fewer than two TTWO closes, and without TTWO", () => {
    const one = makePrices({ from: "2026-11-20" });
    expect(one.tickers[0].closes).toHaveLength(1);
    expect(adaptPrices(one)).toBeNull();
    const none = clone(makePrices());
    none.tickers = none.tickers.filter((t) => t.symbol !== "TTWO");
    expect(adaptPrices(none)).toBeNull();
  });
  it("keeps the chart without a baseline", () => {
    const p = clone(makePrices());
    p.tickers = p.tickers.filter((t) => t.symbol !== "QQQ");
    p.subject_vs_baseline_launch_day = p.subject_vs_baseline_since_launch = null;
    const a = adaptPrices(p)!;
    expect(a.baseline).toBeNull();
    expect(a.vsBaseline).toEqual({ launchDay: null, sinceLaunch: null });
    expect(priceView(a, MILESTONES).rebasedOn).toBeNull();
  });
});

describe("prices in the page data", () => {
  it("the shipped fallback carries no sample prices: without real data the chart is hidden", () => {
    const fb = FALLBACK_SIGNALS.business?.prices ?? null;
    if (fb !== null) {
      // a real snapshot from the collector may be bundled later; a synthetic one never
      expect(isPrices(fb)).toBe(true);
      expect(fb.source).toBe("Alpha Vantage");
    }
    const data = resolvePageData(checkSignals(makeSignals()), FALLBACK_SIGNALS);
    if (fb === null) expect(data.prices).toBeNull();
  });
  it("uses live prices, and falls back per part", () => {
    const live = resolvePageData(checkSignals(withPrices()), FALLBACK_SIGNALS);
    expect(live.prices?.origin).toBe("live");
    expect(live.prices?.updatedAt).toBe("2026-11-20T22:30:12Z");
    const fallback = clone(FALLBACK_SIGNALS);
    fallback.business = { ...fallback.business!, prices: makePrices() };
    const fb = resolvePageData(checkSignals(makeSignals()), fallback);
    expect(fb.prices?.origin).toBe("fallback");
    expect(fb.official?.origin).toBe("fallback");
  });
  it("the 60s refresh updates prices when present and keeps them otherwise", () => {
    const prev = resolvePageData(checkSignals(withPrices()), FALLBACK_SIGNALS);
    const moved = clone(makePrices());
    moved.updated_at = "2026-11-23T22:30:09Z";
    expect(mergeLive(prev, withPrices(moved)).prices?.updatedAt).toBe("2026-11-23T22:30:09Z");
    expect(mergeLive(prev, makeSignals()).prices).toBe(prev.prices);
    expect(mergeLive(prev, null).prices).toBe(prev.prices);
  });
});

describe("price chart maths", () => {
  it("rebases QQQ to TTWO's first common close", () => {
    const v = priceView(adaptPrices(makePrices())!, MILESTONES);
    expect(v.rebasedOn).toBe("2026-07-01");
    expect(v.points[0].baseline).toBeCloseTo(v.points[0].close, 6);
    // QQQ +10 points from 500 is +2%, so rebased it is TTWO's first close x 1.02
    expect(v.points[10].baseline).toBeCloseTo(200 * 1.02, 6);
    expect(v.min).toBeLessThan(Math.min(...v.points.map((p) => p.close)));
    expect(v.max).toBeGreaterThan(Math.max(...v.points.map((p) => p.baseline ?? 0)));
  });
  it("rebases on the first day both have, and leaves the line empty before it", () => {
    const p = clone(makePrices());
    const qqq = p.tickers.find((t) => t.symbol === "QQQ")!;
    qqq.closes = qqq.closes.slice(5);
    const v = priceView(adaptPrices(p)!, MILESTONES);
    expect(v.rebasedOn).toBe(qqq.closes[0].date);
    expect(v.points.slice(0, 5).every((pt) => pt.baseline === null)).toBe(true);
    expect(v.points[5].baseline).toBeCloseTo(v.points[5].close, 6);
  });
  it("shows only the markers inside the data's range, on the next trading day", () => {
    // day one: about 100 trading days back, so only the launch is inside
    const dayOne = priceView(adaptPrices(makePrices())!, MILESTONES);
    expect(dayOne.markers.map((m) => m.label)).toEqual(["Launch"]);
    expect(dayOne.points[dayOne.markers[0].index].date).toBe("2026-11-19");
    // with history back to 2023: both trailers, the delays and the launch
    const long = priceView(adaptPrices(makePrices({ from: "2023-11-01" }))!, MILESTONES);
    expect(long.markers.map((m) => m.label)).toEqual(["Trailer 1", "Delay → May 26", "Trailer 2", "Delay → Nov 19", "Launch"]);
    // 2025-05-02 was a Friday: on the day itself; a weekend date moves to the Monday
    const t1 = long.markers[0];
    expect(long.points[t1.index].date).toBe("2023-12-05");
  });
  it("labels months, thinned to a few ticks", () => {
    const v = priceView(adaptPrices(makePrices())!, MILESTONES);
    expect(v.ticks.map((t) => t.label)).toEqual(["Jul 2026", "Aug", "Sep", "Oct", "Nov"]);
    const long = priceView(adaptPrices(makePrices({ from: "2023-11-01" }))!, MILESTONES);
    expect(long.ticks.length).toBeLessThanOrEqual(7);
    expect(long.ticks[0].label).toBe("Nov ’23");
    // a series that starts late in a month drops that month's label
    const late = priceView(adaptPrices(makePrices({ from: "2026-07-27" }))!, MILESTONES);
    expect(late.ticks[0].label).toBe("Aug 2026");
  });
  it("breaks the path at missing values", () => {
    expect(pricePath([1, 2, null, 4], { min: 0, max: 4 }, 300, 100)).toBe("M0.0 75.0 L100.0 50.0 M300.0 0.0");
  });
});

describe("price formatting", () => {
  it("prints dollars, percent and points with a real minus sign", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(signedPct(4)).toBe("+4.00%");
    expect(signedPct(-8)).toBe("−8.00%");
    expect(signedPct(-0.001)).toBe("0.00%");
    expect(signedPts(-9)).toBe("−9.0 pts");
    expect(signedPts(2.04)).toBe("+2.0 pts");
  });
});
