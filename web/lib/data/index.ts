export * from "./types";
export * from "./constants";
// The collector contract. Its nested types share names with the view models, so they sit
// under a namespace: SignalsSchema.SteamGame vs SteamGame.
export type { Signals } from "./signals.generated";
export type * as SignalsSchema from "./signals.generated";
export { TRAILERS } from "./trailers";
export { checkBusiness, checkSignals, isSignals } from "./guard";
export { adaptOfficial, adaptSteam, adaptSteamReviews, adaptTwitch, adaptWikipedia, adaptYouTube, mergeLive, resolvePageData } from "./adapt";
