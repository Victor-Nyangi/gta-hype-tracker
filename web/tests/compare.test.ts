import { describe, expect, it } from "vitest";
import { steamPaths } from "@/lib/charts";
import { COMPARE_POINTS, compareGames, fromTwitch, GTA6_ID, leadingGaps, resample24h } from "@/lib/compare";
import { checkSignals, COVERS, resolvePageData, SHORT_NAMES } from "@/lib/data";
import { FALLBACK_SIGNALS } from "@/lib/data/load";
import { twitchView } from "@/lib/twitch";
import { makeSignals } from "./fixtures";

const page = (endHour = 24) => resolvePageData(checkSignals(makeSignals({ endHour })), FALLBACK_SIGNALS);

describe("compareGames", () => {
  it("puts GTA VI first, so it is the default selection, then every Steam game", () => {
    const d = page();
    const games = compareGames(d.steam, d.twitch);
    expect(games[0].id).toBe(GTA6_ID);
    expect(games[0].source).toBe("twitch");
    expect(games.slice(1).map((g) => g.id)).toEqual(d.steam!.data.games.map((g) => g.id));
    expect(games.slice(1).every((g) => g.source === "steam")).toBe(true);
  });
  it("gives every chip a short label and keeps the full name for the card", () => {
    const d = page();
    const games = compareGames(d.steam, d.twitch);
    expect(games.map((g) => g.short)).toEqual([
      "GTA VI",
      "GTA V",
      "Red Dead 2",
      "CS2",
      "Cyberpunk 2077",
      "Elden Ring",
      "Baldur's Gate 3",
      "GTA V Enhanced",
    ]);
    expect(games.map((g) => g.name)).toEqual(["Grand Theft Auto VI", ...d.steam!.data.games.map((g) => g.name)]);
    for (const g of games) expect(SHORT_NAMES[g.id], g.id).toBe(g.short);
  });
  it("gives every game, GTA VI included, the same point count so the chart can morph", () => {
    const d = page(30);
    const games = compareGames(d.steam, d.twitch);
    for (const g of games) expect(g.series24h, g.id).toHaveLength(COMPARE_POINTS);
    const verts = (d: string) => (d.match(/[ML]/g) ?? []).length;
    for (const g of games) expect(verts(steamPaths(g.series24h, 1000, 260).line), g.id).toBe(COMPARE_POINTS);
  });
  it("leaves out a source that is unavailable", () => {
    const d = page();
    expect(compareGames(d.steam, null).map((g) => g.id)).not.toContain(GTA6_ID);
    expect(compareGames(null, d.twitch).map((g) => g.id)).toEqual([GTA6_ID]);
  });
  it("labels Steam peaks that are only observed since tracking", () => {
    const d = page();
    const games = compareGames(d.steam, d.twitch);
    expect(games.find((g) => g.id === "gtav")?.peakSinceTracking).toBe(false);
    expect(games.find((g) => g.id === "gtav_enhanced")?.peakSinceTracking).toBe(true);
    expect(games.find((g) => g.id === "cs2")?.trackingSince).toBe("2026-11-19T18:47:01.653755Z");
  });
});

describe("fromTwitch", () => {
  it("matches the Signals card: same current viewers and peak", () => {
    const tw = page().twitch!;
    const view = twitchView(tw.data);
    const g = fromTwitch(tw);
    expect(g.current).toBe(view.current);
    expect(g.allTimePeak).toBe(view.peak);
    expect(g.peakSinceTracking).toBe(true);
    expect(g.cover).toBe(COVERS.gta6);
  });
  it("pads the left with empty hours when under 24h of data exists, and says since when", () => {
    const tw = page().twitch!; // tracked +14..+24: 11 hourly points
    const g = fromTwitch(tw);
    expect(g.series24h).toHaveLength(COMPARE_POINTS);
    expect(leadingGaps(g.series24h)).toBe(14);
    expect(g.series24h.slice(14)).toEqual(tw.data.points.map((p) => p.viewers));
    expect(g.trackingSince).toBe("2026-11-19T19:39:47.733374Z");
    // 24h peak from single snapshots, not hourly means
    expect(g.peak24h).toBe(Math.max(...tw.data.points.map((p) => p.maxViewers)));
    expect(g.origin).toBe("live");
  });
  it("fills the whole 24h once there is enough data", () => {
    const g = fromTwitch(page(40).twitch!);
    expect(leadingGaps(g.series24h)).toBe(0);
    // the 24h peak only looks at the last 24 hours
    expect(g.peak24h).toBeLessThan(g.allTimePeak!);
  });
});

describe("resample24h", () => {
  it("interpolates between sparse samples and leaves hours before the first one empty", () => {
    const out = resample24h([
      { hoursFromLaunch: 10, viewers: 100, maxViewers: 100 },
      { hoursFromLaunch: 12, viewers: 300, maxViewers: 300 },
      { hoursFromLaunch: 13, viewers: 50, maxViewers: 50 },
    ]);
    expect(out).toHaveLength(COMPARE_POINTS);
    expect(out.slice(-4)).toEqual([100, 200, 300, 50]);
    expect(out.slice(0, -4).every((v) => v === null)).toBe(true);
  });
  it("returns an empty grid for an empty series", () => {
    expect(resample24h([])).toEqual(Array(COMPARE_POINTS).fill(null));
  });
});
