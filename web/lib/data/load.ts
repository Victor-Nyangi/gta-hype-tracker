import { hypeData } from ".";
import type { LanguageViews, SteamGame, TrailerSeries, TwitchSeries } from "./types";

export interface PageData {
  twitch: TwitchSeries;
  trailers: TrailerSeries[];
  wikipedia: LanguageViews[];
  steam: SteamGame[];
}

/**
 * Everything the page renders, in one cached call so the page stays in the static shell
 * (Cache Components). When the adapters go live, a cacheLife here sets the refresh rate.
 */
export async function loadPageData(): Promise<PageData> {
  "use cache";
  const [twitch, trailers, wikipedia, steam] = await Promise.all([
    hypeData.twitch(),
    hypeData.trailers(),
    hypeData.wikipedia(),
    hypeData.steam(),
  ]);
  return { twitch, trailers, wikipedia, steam };
}
