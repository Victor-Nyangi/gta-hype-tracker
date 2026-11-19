// Generates lib/data/signals.generated.ts from the collector's JSON Schema.
// Run with `pnpm gen:signals` after `uv run collector schema` changes the schema.
import { readFile, writeFile } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const schemaPath = new URL("../../collector/schema/signals.schema.json", import.meta.url);
const outPath = new URL("../lib/data/signals.generated.ts", import.meta.url);

const schema = JSON.parse(await readFile(schemaPath, "utf8"));

// Pydantic gives every property a title, which json-schema-to-typescript turns into a
// named alias per field (GameId, GameId1, ...). Keep titles only on the models.
function stripPropertyTitles(node) {
  if (Array.isArray(node)) return node.forEach(stripPropertyTitles);
  if (!node || typeof node !== "object") return;
  for (const [key, child] of Object.entries(node)) {
    if (key === "properties") {
      for (const prop of Object.values(child)) {
        delete prop.title;
        stripPropertyTitles(prop);
      }
    } else {
      stripPropertyTitles(child);
    }
  }
}
stripPropertyTitles(schema);
const ts = await compile(schema, "Signals", {
  bannerComment:
    "/* Generated from collector/schema/signals.schema.json by scripts/gen-signals.mjs. Do not edit. */",
  additionalProperties: false,
  unreachableDefinitions: true,
  style: { semi: true, singleQuote: false },
});
await writeFile(outPath, ts);
console.log("wrote", outPath.pathname);
