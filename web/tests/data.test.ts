import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { steamPaths } from "@/lib/charts";
import { leadingGaps } from "@/lib/compare";
import {
  adaptSteam,
  adaptWikipedia,
  adaptYouTube,
  checkSignals,
  COVERS,
  isSignals,
  LANGUAGE_COUNTRIES,
  mergeLive,
  resolvePageData,
  STEAM_GAMES,
} from "@/lib/data";
import { FALLBACK_SIGNALS, fetchSignals } from "@/lib/data/load";
import { twitchTicks, twitchView } from "@/lib/twitch";
import { clone, makeSignals } from "./fixtures";

const okFetch = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

describe("payload guard", () => {
  it("accepts the collector's shape, and the bundled fallback snapshot", () => {
    expect(isSignals(makeSignals())).toBe(true);
    expect(isSignals(FALLBACK_SIGNALS)).toBe(true);
  });
  it("rejects a payload whose envelope is wrong", () => {
    expect(checkSignals(null)).toBeNull();
    expect(checkSignals("signals")).toBeNull();
    expect(checkSignals({ ...makeSignals(), schema_version: 2 })).toBeNull();
    expect(checkSignals({ ...makeSignals(), generated_at: "yesterday" })).toBeNull();
  });
  it("drops a malformed source on its own and keeps the rest", () => {
    const s = clone(makeSignals()) as unknown as Record<string, Record<string, unknown>>;
    s.steam.games = [{ key: "cs2" }];
    const c = checkSignals(s)!;
    expect(c.invalid).toEqual(["steam"]);
    expect(c.signals.steam).toBeNull();
    expect(c.signals.twitch?.current_viewers).toBe(827_094);
  });
  it("rejects a Steam series that is not exactly 25 points, and non-integer counts", () => {
    const short = clone(makeSignals());
    short.steam!.games[0].series_24h.pop();
    expect(checkSignals(short)!.invalid).toEqual(["steam"]);
    const bad = clone(makeSignals());
    (bad.twitch as unknown as Record<string, unknown>).current_viewers = "827094";
    expect(checkSignals(bad)!.invalid).toEqual(["twitch"]);
  });
});

describe("loading with fallback", () => {
  it("falls back to the bundled snapshot when the fetch fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const checked = await fetchSignals("http://127.0.0.1:9/signals.json", failing);
    expect(checked).toBeNull();
    const data = resolvePageData(checked, FALLBACK_SIGNALS);
    expect(data.twitch?.origin).toBe("fallback");
    expect(data.steam?.origin).toBe("fallback");
    expect(data.twitch?.data.currentViewers).toBe(FALLBACK_SIGNALS.twitch!.current_viewers);
    expect(data.generatedAt).toBe(FALLBACK_SIGNALS.generated_at);
    warn.mockRestore();
  });
  it("rejects bad data (HTTP error, junk, wrong envelope) and falls back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const http500 = (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
    expect(await fetchSignals("u", http500)).toBeNull();
    expect(await fetchSignals("u", okFetch({ hello: "world" }))).toBeNull();
    const junk = (async () => new Response("<html>")) as unknown as typeof fetch;
    expect(await fetchSignals("u", junk)).toBeNull();
    expect(resolvePageData(null, FALLBACK_SIGNALS).wikipedia?.origin).toBe("fallback");
    warn.mockRestore();
  });
  it("falls back per source: a malformed steam block leaves Twitch live", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = clone(makeSignals()) as unknown as Record<string, unknown>;
    s.steam = { games: "nope" };
    const data = resolvePageData(await fetchSignals("u", okFetch(s)), FALLBACK_SIGNALS);
    expect(data.twitch?.origin).toBe("live");
    expect(data.twitch?.data.currentViewers).toBe(827_094);
    expect(data.steam?.origin).toBe("fallback");
    expect(data.youtube).toBeNull(); // off live and in the fallback: no card data, not "last known"
    warn.mockRestore();
  });
  it("keeps the numbers but labels them last known when a browser refresh fails", () => {
    const live = resolvePageData(checkSignals(makeSignals()), FALLBACK_SIGNALS);
    const failed = mergeLive(live, null);
    expect(failed.twitch?.origin).toBe("fallback");
    expect(failed.twitch?.data).toEqual(live.twitch?.data);
    expect(failed.wikipedia).toEqual(live.wikipedia);
    const next = makeSignals({ endHour: 25 });
    next.twitch!.current_viewers = 700_000;
    const refreshed = mergeLive(failed, next);
    expect(refreshed.twitch?.origin).toBe("live");
    expect(refreshed.twitch?.data.currentViewers).toBe(700_000);
    expect(mergeLive(live, { junk: true }).steam?.origin).toBe("fallback");
  });
});

describe("Steam adapter", () => {
  it("covers every Steam app the collector samples, GTA V Enhanced included, with cover art", () => {
    const steam = adaptSteam(makeSignals().steam!);
    expect(steam.games.map((g) => g.appId)).toEqual([271590, 1174180, 730, 1091500, 1245620, 1086940, 3240220]);
    expect(steam.games.map((g) => g.id)).toEqual(STEAM_GAMES.map((g) => g.id));
    for (const g of steam.games) expect(g.cover, g.id).toBeDefined();
  });
  it("keeps curated all-time peaks unless an observed peak is higher", () => {
    const s = makeSignals().steam!;
    s.games[1].observed_peak = 120_000; // rdr2: curated ~92,000
    const games = adaptSteam(s).games;
    const by = (id: string) => games.find((g) => g.id === id)!;
    expect(by("gtav").allTimePeak).toBe(364_548);
    expect(by("gtav").allTimePeakSource).toBe("curated");
    expect(by("rdr2").allTimePeak).toBe(120_000);
    expect(by("rdr2").allTimePeakSource).toBe("observed");
    // no curated figure for Enhanced: the observed peak, flagged as such
    expect(by("gtav_enhanced").allTimePeak).toBe(140_000);
    expect(by("gtav_enhanced").allTimePeakSource).toBe("observed");
  });
  it("keeps 25-point series with gaps: leading empty hours flat-start, inner gaps carry over", () => {
    const s = makeSignals().steam!;
    s.games[2].series_24h[18].players = null;
    const cs2 = adaptSteam(s).games[2];
    expect(cs2.series24h).toHaveLength(25);
    expect(leadingGaps(cs2.series24h)).toBe(13);
    expect(cs2.series24h[18]).toBeNull();
    const { line } = steamPaths(cs2.series24h, 1000, 260);
    const pts = line.split(/[ML]/).filter(Boolean).map((p) => p.trim().split(" ").map(Number));
    expect(pts).toHaveLength(25);
    expect(new Set(pts.slice(0, 14).map(([, y]) => y)).size).toBe(1); // flat start up to the first reading
    expect(pts[18][1]).toBe(pts[17][1]); // the gap carries the previous hour
  });
});

describe("Wikipedia and YouTube adapters", () => {
  it("orders languages by views and maps them to countries; unknown editions still list", () => {
    const { languages, total7d, windowEnd } = adaptWikipedia(makeSignals().wikipedia!);
    expect(languages.map((l) => l.code)).toEqual(["en", "fa", "xx"]);
    expect(languages[1]).toMatchObject({ name: "Persian", views: 200_000 });
    expect(languages[1].countries).toContain(364);
    expect(languages[2]).toMatchObject({ name: "xx", countries: [] });
    expect(total7d).toBe(1_300_000);
    expect(windowEnd).toBe("2026-11-18");
  });
  it("has a name and countries for every edition in the live snapshot", () => {
    for (const e of FALLBACK_SIGNALS.wikipedia?.editions ?? []) {
      expect(LANGUAGE_COUNTRIES[e.lang]?.countries.length, e.lang).toBeGreaterThan(0);
    }
  });
  it("treats YouTube with no videos as off", () => {
    expect(adaptYouTube({ updated_at: "2026-11-20T00:00:00Z", total_views: 0, videos: [] })).toBeNull();
  });
});

describe("cover art", () => {
  it("exists under public/, with alt text and a crop", () => {
    for (const [id, c] of Object.entries(COVERS)) {
      expect(c.src, id).toMatch(/^\/assets\/covers\//);
      expect(existsSync(join(__dirname, "../public", c.src)), `${id}: ${c.src}`).toBe(true);
      expect(c.alt.length, id).toBeGreaterThan(20);
      expect(c.position, id).toMatch(/^\d+% \d+%$/);
    }
  });
  it("is unique per game", () => {
    const srcs = Object.values(COVERS).map((c) => c.src);
    expect(new Set(srcs).size).toBe(srcs.length);
  });
});

describe("twitchView", () => {
  const series = (endHour = 24) => resolvePageData(checkSignals(makeSignals({ endHour })), FALLBACK_SIGNALS).twitch!.data;

  it("keeps the design's -24h..+24h window and draws only the tracked span", () => {
    const v = twitchView(series());
    expect([v.start, v.end]).toEqual([-24, 24]);
    expect(v.points.map((p) => p.hoursFromLaunch)).toEqual(Array.from({ length: 11 }, (_, i) => 14 + i));
    expect(v.trackingFrom).toBeCloseTo(14.66, 2); // 19:39:47 UTC
    expect(v.points[0].hoursFromLaunch).toBeLessThan(v.trackingFrom); // the 19:00 bucket
    expect(twitchTicks(v)).toEqual([-24, -12, 0, 12, 24]);
  });
  it("uses the collector's own KPIs", () => {
    const v = twitchView(series());
    expect(v.current).toBe(827_094);
    expect(v.peak).toBe(2_392_628);
    expect(v.hoursWatched).toBe(16_241_499);
  });
  it("slides the 48h window once the data runs past +24h", () => {
    const v = twitchView(series(30));
    expect([v.start, v.end]).toEqual([-18, 30]);
    expect(v.points.at(-1)?.hoursFromLaunch).toBe(30);
    expect(twitchTicks(v)).toEqual([-12, 0, 12, 24]);
    const late = twitchView(series(70));
    expect(late.points[0].hoursFromLaunch).toBe(22); // older hours leave the window
    expect(late.points).toHaveLength(49);
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
