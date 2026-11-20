import { describe, expect, it } from "vitest";
import { checkBusiness, checkSignals, isSignals, mergeLive, resolvePageData } from "@/lib/data";
import type { SignalsSchema } from "@/lib/data";
import { FALLBACK_SIGNALS } from "@/lib/data/load";
import { asOfLabel, figureLabel, inScale, rangeLabel } from "@/lib/format";
import { clone, makeSignals } from "./fixtures";

function business(): SignalsSchema.BusinessSignals {
  return {
    steam_reviews: {
      tracking_since: "2026-11-20T12:24:13Z",
      updated_at: "2026-11-20T12:24:13Z",
      method: {
        name: "Boxleiter method: estimated sales = all-time Steam reviews x 30 to x 55",
        multiplier_low: 30,
        multiplier_high: 55,
        sources: ["https://example.org/a", "https://example.org/b"],
      },
      games: [
        {
          key: "bg3",
          app_id: 1086940,
          name: "Baldur's Gate 3",
          total_reviews: 788_559,
          positive: 753_044,
          negative: 35_515,
          fetched_at: "2026-11-20T12:24:13Z",
          new_reviews_7d: 702,
          change_7d: null,
          change_7d_since: null,
          estimated_sales_low: 23_656_770,
          estimated_sales_high: 43_370_745,
          no_estimate_reason: null,
        },
        {
          key: "cs2",
          app_id: 730,
          name: "Counter-Strike 2",
          total_reviews: 10_773_436,
          positive: 9_268_858,
          negative: 1_504_578,
          fetched_at: "2026-11-20T12:24:13Z",
          new_reviews_7d: 16_021,
          change_7d: null,
          change_7d_since: null,
          estimated_sales_low: null,
          estimated_sales_high: null,
          no_estimate_reason: "Free to play: reviews do not track sales",
        },
      ],
    },
    official: {
      updated_at: "2026-11-20T12:00:00Z",
      figures: [
        {
          key: "gtav_units",
          label: "Grand Theft Auto V, units sold",
          value: 235_000_000,
          value_max: null,
          qualifier: "nearly",
          unit: "units",
          as_of: "2026-11",
          source_title: "Take-Two investor presentation, November 2026",
          source_url: "https://ir.take2games.com/static-files/x",
          quote: "Nearly 235 million units sold to date",
        },
      ],
    },
  };
}

const withBusiness = (b: unknown = business()) => ({ ...makeSignals(), business: b });

describe("business guard", () => {
  it("accepts the block, a v1 payload without it, and null", () => {
    expect(isSignals(withBusiness())).toBe(true);
    const v1 = makeSignals();
    expect("business" in v1).toBe(false);
    const c = checkSignals(v1)!;
    expect(c.invalid).toEqual([]);
    expect(c.signals.business).toBeNull();
    expect(checkSignals(withBusiness(null))!.invalid).toEqual([]);
  });
  it("the bundled fallback carries a valid business block", () => {
    expect(checkSignals(FALLBACK_SIGNALS)!.invalid).toEqual([]);
    expect(FALLBACK_SIGNALS.business?.official?.figures.length).toBeGreaterThan(0);
  });
  it("drops a malformed part on its own and keeps the other", () => {
    const b = clone(business()) as unknown as Record<string, Record<string, unknown>>;
    b.steam_reviews.games = [{ key: "bg3", total_reviews: "lots" }];
    const c = checkSignals(withBusiness(b))!;
    expect(c.invalid).toEqual(["business"]);
    expect(c.signals.business?.steam_reviews).toBeNull();
    expect(c.signals.business?.official?.figures[0].key).toBe("gtav_units");
    expect(c.signals.twitch).not.toBeNull(); // other sources untouched
  });
  it("rejects a block that is not an object, and a source link that is not https", () => {
    expect(checkBusiness("money")).toEqual({ business: null, malformed: true });
    const b = clone(business());
    b.official!.figures[0].source_url = "javascript:alert(1)";
    const { business: out, malformed } = checkBusiness(b);
    expect(malformed).toBe(true);
    expect(out?.official).toBeNull();
    expect(out?.steam_reviews).not.toBeNull();
  });
  it("is null when both parts are unusable", () => {
    const b = { steam_reviews: { nope: 1 }, official: null };
    expect(checkBusiness(b)).toEqual({ business: null, malformed: true });
  });
});

describe("business adapters", () => {
  it("maps live data, keeping an estimate whole or not at all", () => {
    const data = resolvePageData(checkSignals(withBusiness()), FALLBACK_SIGNALS);
    expect(data.reviews?.origin).toBe("live");
    const [bg3, cs2] = data.reviews!.data.games;
    expect(bg3.estimate).toEqual({ low: 23_656_770, high: 43_370_745 });
    expect(cs2.estimate).toBeNull();
    expect(cs2.noEstimateReason).toMatch(/Free to play/);
    expect(data.reviews!.data.method).toMatchObject({ low: 30, high: 55 });
    expect(data.official?.data[0]).toMatchObject({ qualifier: "nearly", asOf: "2026-11", unit: "units" });
  });
  it("falls back per part when the live payload has no business block", () => {
    const data = resolvePageData(checkSignals(makeSignals()), FALLBACK_SIGNALS);
    expect(data.twitch?.origin).toBe("live");
    expect(data.reviews?.origin).toBe("fallback");
    expect(data.official?.origin).toBe("fallback");
  });
  it("is null when neither the live payload nor the fallback has it", () => {
    const fallback = clone(FALLBACK_SIGNALS);
    delete fallback.business;
    const data = resolvePageData(checkSignals(makeSignals()), fallback);
    expect(data.reviews).toBeNull();
    expect(data.official).toBeNull();
  });
  it("the live refresh updates business when present and keeps it otherwise", () => {
    const prev = resolvePageData(null, FALLBACK_SIGNALS);
    const next = mergeLive(prev, withBusiness());
    expect(next.reviews?.origin).toBe("live");
    expect(next.reviews?.data.games[0].id).toBe("bg3");
    expect(mergeLive(prev, makeSignals()).official).toBe(prev.official);
    expect(mergeLive(prev, null).reviews).toBe(prev.reviews); // failed refresh: kept as is
  });
});

describe("money formatting", () => {
  it("prints in a fixed unit", () => {
    expect(inScale(235_000_000)).toBe("235M");
    expect(inScale(8_200_000_000)).toBe("8.2B");
    expect(inScale(61_342_980)).toBe("61M");
    expect(inScale(950)).toBe("950");
    // counting up towards 235M stays in M
    expect(inScale(120_000, 235_000_000)).toBe("0M");
    expect(inScale(4_000_000, 8_200_000_000)).toBe("0.0B");
  });
  it("prints ranges in the high end's unit", () => {
    expect(rangeLabel(23_656_770, 43_370_745)).toBe("24–43M");
    expect(rangeLabel(61_342_980, 112_462_130)).toBe("61–112M");
    expect(rangeLabel(900_000, 1_600_000)).toBe("0.9–1.6M");
    expect(rangeLabel(8e9, 8.2e9)).toBe("8.0–8.2B");
  });
  it("prints reported figures and their dates", () => {
    expect(figureLabel({ value: 235e6, valueMax: null, unit: "units" })).toBe("235M");
    expect(figureLabel({ value: 8e9, valueMax: 8.2e9, unit: "usd" })).toBe("$8.0–8.2B");
    // mid count-up, the unit comes from the figure
    expect(figureLabel({ value: 8e9, valueMax: 8.2e9, unit: "usd" }, { value: 4e9, valueMax: 4.1e9 })).toBe("$4.0–4.1B");
    expect(asOfLabel("2026-11")).toBe("Nov 2026");
    expect(asOfLabel("2026-11-09")).toBe("Nov 9, 2026");
  });
});
