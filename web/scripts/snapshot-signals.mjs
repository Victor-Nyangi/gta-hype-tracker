// Saves the collector's current public signals.json as lib/data/fallback-signals.json: the
// last good snapshot the page falls back to when the live fetch fails or is malformed.
//
//   pnpm snapshot:signals                    # from SIGNALS_URL, else the public URL
//
// Refuses to write a payload that fails the same runtime check the page uses
// (lib/data/guard.ts, loaded through Node's TypeScript type stripping), so a bad snapshot
// never becomes the fallback.
//
// `business` is optional (collectors from before it leave it out), and so is each of its
// parts (`steam_reviews`, `official`, `prices`). A part the live file lacks is kept from the
// previous snapshot, so refreshing the other sources does not drop it; each part carries
// its own updated_at, so the page still dates it. `prices` is only ever what the collector
// wrote: this script never invents one, so without real prices the page hides the chart.
import { readFile, writeFile } from "node:fs/promises";
import { checkSignals } from "../lib/data/guard.ts";

const DEFAULT_URL = "https://gta-data.nyangi.dev/signals.json";
const url = process.env.SIGNALS_URL || DEFAULT_URL;
const outPath = new URL("../lib/data/fallback-signals.json", import.meta.url);

const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
if (!res.ok) {
  console.error(`snapshot: ${url} answered ${res.status}`);
  process.exit(1);
}
const raw = await res.json();
const checked = checkSignals(raw);
if (!checked || checked.invalid.length > 0) {
  console.error(`snapshot: ${url} failed the payload check`, checked?.invalid ?? "(envelope)");
  process.exit(1);
}
const PARTS = ["steam_reviews", "official", "prices"];
let kept = "";
let prev = null;
try {
  prev = JSON.parse(await readFile(outPath, "utf8"));
} catch {
  // no previous snapshot: nothing to keep
}
const prevParts = prev?.business ? PARTS.filter((k) => prev.business[k] != null) : [];
const keptParts = [];
for (const k of prevParts) {
  if (raw.business?.[k] != null) continue;
  raw.business = { steam_reviews: null, official: null, ...raw.business, [k]: prev.business[k] };
  keptParts.push(k);
}
if (keptParts.length) kept = ` (business.${keptParts.join(", business.")} kept from the previous snapshot)`;
// what we keep was checked when it was written, but check the merged result again anyway
const merged = checkSignals(raw);
if (!merged || merged.invalid.length > 0) {
  console.error("snapshot: the merged payload failed the payload check", merged?.invalid ?? "(envelope)");
  process.exit(1);
}
await writeFile(outPath, `${JSON.stringify(raw, null, 2)}\n`);
const live = ["twitch", "steam", "youtube", "wikipedia", "business"].filter((k) => raw[k] != null);
console.log(`wrote ${outPath.pathname} (generated_at ${raw.generated_at}; sources: ${live.join(", ")})${kept}`);
