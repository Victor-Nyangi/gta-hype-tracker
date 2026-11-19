export * from "./types";
export * from "./constants";
// The collector contract. Its nested types share names with the view models, so they sit
// under a namespace: SignalsSchema.SteamGame vs SteamGame.
export type { Signals } from "./signals.generated";
export type * as SignalsSchema from "./signals.generated";
export { mockHypeData, mockSignals } from "./mock";

import { mockHypeData } from "./mock";
import type { HypeData } from "./types";

/** The adapter the page uses. Swap for a signals.json-backed one when the collector is live. */
export const hypeData: HypeData = mockHypeData;
