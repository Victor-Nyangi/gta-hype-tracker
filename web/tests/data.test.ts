import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { steamPaths } from "@/lib/charts";
import { COVERS, mockHypeData, mockSignals, STEAM_GAMES } from "@/lib/data";
import { LAUNCH_MS } from "@/lib/time";
import { twitchView } from "@/lib/twitch";

const H = 3600_000;

describe("mock adapter", () => {
  it("covers every Steam app the collector samples, GTA V Enhanced included", async () => {
    const games = await mockHypeData.steam();
    expect(games.map((g) => g.appId)).toEqual([271590, 1174180, 730, 1091500, 1245620, 1086940, 3240220]);
    expect(games.map((g) => g.id)).toEqual(STEAM_GAMES.map((g) => g.id));
    for (const g of games) expect(g.series24h).toHaveLength(25);
    expect(games.find((g) => g.id === "gtav_enhanced")?.allTimePeak).toBeNull();
  });
  it("gives every game cover art that exists under public/, with alt text and a crop", async () => {
    const games = await mockHypeData.steam();
    for (const g of games) expect(g.cover, g.id).toBeDefined();
    for (const [id, c] of Object.entries(COVERS)) {
      expect(existsSync(join(__dirname, "../public", c.src)), `${id}: ${c.src}`).toBe(true);
      expect(c.alt.length, id).toBeGreaterThan(20);
      expect(c.position, id).toMatch(/^\d+% \d+%$/);
    }
  });
  it("gives 49 hourly Twitch points from -24h to +24h", async () => {
    const tw = await mockHypeData.twitch();
    expect(tw.points.map((p) => p.hoursFromLaunch)).toEqual(Array.from({ length: 49 }, (_, i) => i - 24));
  });
  it("orders languages by views, and every language maps to countries", async () => {
    const langs = await mockHypeData.wikipedia();
    const views = langs.map((l) => l.views);
    expect(views).toEqual([...views].sort((a, b) => b - a));
    for (const l of langs) expect(l.countries.length).toBeGreaterThan(0);
  });
  it("produces the collector's signals.json shape", () => {
    const s = mockSignals();
    expect(s.schema_version).toBe(1);
    expect(s.steam?.games).toHaveLength(7);
  });
});

describe("twitchView", () => {
  it("drops future hours and derives KPIs from what is shown (illustrative data)", async () => {
    const tw = await mockHypeData.twitch();
    const v = twitchView(tw, LAUNCH_MS + 10.5 * H);
    expect(v.points.at(-1)?.hoursFromLaunch).toBe(10);
    expect(v.peak).toBe(Math.max(...tw.points.filter((p) => p.hoursFromLaunch >= 0 && p.hoursFromLaunch <= 10).map((p) => p.viewers)));
  });
  it("keeps the whole window on the server and after +24h", async () => {
    const tw = await mockHypeData.twitch();
    expect(twitchView(tw, null).points).toHaveLength(49);
    expect(twitchView(tw, LAUNCH_MS + 48 * H).points).toHaveLength(49);
  });
  it("never shows fewer than two points", async () => {
    const tw = await mockHypeData.twitch();
    expect(twitchView(tw, LAUNCH_MS - 100 * H).points).toHaveLength(2);
  });
  it("uses the adapter's own KPIs for real data", async () => {
    const tw = { ...(await mockHypeData.twitch()), trackingSince: "2026-11-19T19:39:00Z", currentViewers: 7 };
    expect(twitchView(tw, LAUNCH_MS + 2 * H).current).toBe(7);
  });
});

describe("steamPaths", () => {
  it("keeps one vertex per point so paths can morph", () => {
    const a = steamPaths(Array.from({ length: 25 }, (_, i) => i * 10), 1000, 260);
    const b = steamPaths(Array.from({ length: 25 }, () => 5), 1000, 260);
    const verts = (d: string) => (d.match(/[ML]/g) ?? []).length;
    expect(verts(a.line)).toBe(25);
    expect(verts(b.line)).toBe(25);
    expect(verts(a.area)).toBe(verts(b.area));
  });
  it("carries the previous value over gaps", () => {
    const { line } = steamPaths([10, null, 10], 1000, 260);
    const ys = line.split(/[ML]/).filter(Boolean).map((p) => p.trim().split(" ")[1]);
    expect(new Set(ys).size).toBe(1);
  });
});
