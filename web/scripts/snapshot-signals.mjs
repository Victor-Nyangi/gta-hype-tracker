// Saves the collector's current public signals.json as lib/data/fallback-signals.json: the
// last good snapshot the page falls back to when the live fetch fails or is malformed.
//
//   pnpm snapshot:signals                    # from SIGNALS_URL, else the public URL
//
// Refuses to write a payload that fails the same runtime check the page uses
// (lib/data/guard.ts, loaded through Node's TypeScript type stripping), so a bad snapshot
// never becomes the fallback.
import { writeFile } from "node:fs/promises";
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
await writeFile(outPath, `${JSON.stringify(raw, null, 2)}\n`);
const live = ["twitch", "steam", "youtube", "wikipedia"].filter((k) => raw[k] !== null);
console.log(`wrote ${outPath.pathname} (generated_at ${raw.generated_at}; sources: ${live.join(", ")})`);
