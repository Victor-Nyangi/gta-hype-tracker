import { describe, expect, it } from "vitest";
import { steamPaths } from "@/lib/charts";
import { COMPARE_POINTS, compareGames, fromTwitch, GTA6_ID, resample24h } from "@/lib/compare";
import { COVERS, mockHypeData } from "@/lib/data";
import { LAUNCH_MS } from "@/lib/time";
import { twitchView } from "@/lib/twitch";

const H = 3600_000;

describe("compareGames", () => {
  it("puts GTA VI first, so it is the default selection, then every Steam game", async () => {
    const steam = await mockHypeData.steam();
    const games = compareGames(steam, await mockHypeData.twitch(), null);
    expect(games[0].id).toBe(GTA6_ID);
    expect(games[0].source).toBe("twitch");
    expect(games.slice(1).map((g) => g.id)).toEqual(steam.map((g) => g.id));
    expect(games.slice(1).every((g) => g.source === "steam")).toBe(true);
  });
  it("gives every game, GTA VI included, the same point count so the chart can morph", async () => {
    const games = compareGames(await mockHypeData.steam(), await mockHypeData.twitch(), LAUNCH_MS + 30 * H);
    for (const g of games) expect(g.series24h, g.id).toHaveLength(COMPARE_POINTS);
    const verts = (d: string) => (d.match(/[ML]/g) ?? []).length;
    for (const g of games) expect(verts(steamPaths(g.series24h, 1000, 260).line), g.id).toBe(COMPARE_POINTS);
  });
});

describe("fromTwitch", () => {
  it("matches the Signals card: same current viewers and peak, last 24h of the series", async () => {
    const tw = await mockHypeData.twitch();
    const now = LAUNCH_MS + 48 * H;
    const view = twitchView(tw, now);
    const g = fromTwitch(tw, now);
    expect(g.current).toBe(view.current);
    expect(g.allTimePeak).toBe(view.peak);
    expect(g.series24h).toEqual(tw.points.slice(24).map((p) => p.viewers));
    expect(g.peak24h).toBe(Math.max(...tw.points.slice(24).map((p) => p.viewers)));
    expect(g.cover).toBe(COVERS.gta6);
  });
  it("keeps 25 points while the window is still filling", async () => {
    const tw = await mockHypeData.twitch();
    const g = fromTwitch(tw, LAUNCH_MS + 3.5 * H);
    expect(g.series24h).toHaveLength(COMPARE_POINTS);
    // the newest point carries the illustrative live wobble (at most 0.4%)
    const h3 = tw.points.find((p) => p.hoursFromLaunch === 3)!.viewers;
    expect(Math.abs(g.series24h.at(-1)! / h3 - 1)).toBeLessThan(0.005);
    expect(g.series24h.slice(0, 3).every((v) => v !== null)).toBe(true);
  });
});

describe("resample24h", () => {
  it("interpolates between sparse samples and leaves hours before the first one empty", () => {
    const out = resample24h([
      { hoursFromLaunch: 10, viewers: 100 },
      { hoursFromLaunch: 12, viewers: 300 },
      { hoursFromLaunch: 13, viewers: 50 },
    ]);
    expect(out).toHaveLength(COMPARE_POINTS);
    expect(out.slice(-4)).toEqual([100, 200, 300, 50]);
    expect(out.slice(0, -4).every((v) => v === null)).toBe(true);
  });
  it("returns an empty grid for an empty series", () => {
    expect(resample24h([])).toEqual(Array(COMPARE_POINTS).fill(null));
  });
});
