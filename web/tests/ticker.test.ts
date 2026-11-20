import { describe, expect, it } from "vitest";
import { checkSignals, resolvePageData } from "@/lib/data";
import { FALLBACK_SIGNALS } from "@/lib/data/load";
import { ago, utcStamp } from "@/lib/format";
import { tickerItems } from "@/lib/ticker";
import { makeSignals } from "./fixtures";

const NOW = Date.parse("2026-11-20T05:30:00Z");

describe("tickerItems", () => {
  it("omits YouTube items while YouTube is off", () => {
    const s = makeSignals();
    s.youtube = null;
    const items = tickerItems(resolvePageData(checkSignals(s), { ...FALLBACK_SIGNALS, youtube: null }), NOW);
    expect(items.some((t) => /youtube|trailer/i.test(t))).toBe(false);
  });
  it("omits them when YouTube is on but has no videos yet", () => {
    const s = makeSignals();
    s.youtube = { updated_at: "2026-11-20T05:00:00Z", total_views: 0, videos: [] };
    const items = tickerItems(resolvePageData(checkSignals(s), { ...FALLBACK_SIGNALS, youtube: null }), NOW);
    expect(items.some((t) => /youtube|trailer/i.test(t))).toBe(false);
  });
  it("adds them when YouTube has data", () => {
    const s = makeSignals();
    s.youtube = {
      updated_at: "2026-11-20T05:00:00Z",
      total_views: 400_000_000,
      videos: [
        { video_id: "QdBZY2fkU-0", label: "Trailer 1", views: 250_000_000, likes: null, comments: null, fetched_at: "2026-11-20T05:00:00Z" },
      ],
    };
    const items = tickerItems(resolvePageData(checkSignals(s), FALLBACK_SIGNALS), NOW);
    expect(items).toContain("Trailer 1: 250.00M views on YouTube");
  });
  it("derives the headline numbers from real values", () => {
    const items = tickerItems(resolvePageData(checkSignals(makeSignals()), FALLBACK_SIGNALS), NOW);
    expect(items).toContain("827K on Twitch right now");
    expect(items).toContain("Peak 2.39M viewers");
    expect(items).toContain("16.24M hours watched on Twitch");
    expect(items).toContain("1.30M Wikipedia views in 7 days, 3 languages");
    // GTA V + GTA V Enhanced on Steam (fixture: 10,000 + 70,000)
    expect(items).toContain("80K still in GTA V on Steam");
    expect(items.some((t) => /days since GTA V$/.test(t))).toBe(true);
  });
});

describe("freshness labels", () => {
  it("prints UTC stamps the same everywhere", () => {
    expect(utcStamp("2026-11-19T19:39:47.733374Z")).toBe("19:39 UTC, Nov 19");
    expect(utcStamp("2026-11-20T05:05:00Z", { date: false })).toBe("05:05 UTC");
  });
  it("says how long ago, coarsely", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(4 * 60_000)).toBe("4 min ago");
    expect(ago(10 * 3600_000)).toBe("10 h ago");
    expect(ago(72 * 3600_000)).toBe("3 days ago");
  });
});
