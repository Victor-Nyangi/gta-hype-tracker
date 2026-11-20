import type { PageData } from "./data/types";
import { comma, fmt } from "./format";
import { daysSince } from "./time";

const GTAV_APPS = ["gtav", "gtav_enhanced"];

/**
 * The ticker's headline numbers, from real values only. Items whose source is missing are
 * left out rather than shown as zero; YouTube items appear only when YouTube is sampled.
 */
export function tickerItems(data: PageData, now: number | null): string[] {
  const items: string[] = [];
  const tw = data.twitch?.data;
  if (tw) {
    items.push(`${fmt(tw.currentViewers)} on Twitch right now`);
    items.push(`Peak ${fmt(tw.peakViewers)} viewers`);
    items.push(`${fmt(tw.hoursWatched)} hours watched on Twitch`);
  }
  items.push(`${comma(daysSince("2013-09-17", now))} days since GTA V`);
  const wiki = data.wikipedia?.data;
  if (wiki) items.push(`${fmt(wiki.total7d)} Wikipedia views in 7 days, ${wiki.languages.length} languages`);
  items.push("Vice City, Leonida");
  const gtav = data.steam?.data.games.filter((g) => GTAV_APPS.includes(g.id) && g.currentPlayers !== null);
  if (gtav?.length) {
    items.push(`${fmt(gtav.reduce((s, g) => s + (g.currentPlayers ?? 0), 0))} still in GTA V on Steam`);
  }
  for (const v of data.youtube?.data.videos ?? []) items.push(`${v.label}: ${fmt(v.views)} views on YouTube`);
  items.push("PS5 · Xbox Series X|S");
  return items;
}
