/**
 * A 24h Steam curve as SVG paths with exactly one vertex per point (25), so a game change
 * can morph one path into the next. Values are scaled to 1.15x the series' max, inside
 * a w x h box with 10 units of headroom (the prototype's linePath).
 *
 * data: gaps in a real series (null hours) carry the previous value forward, so the
 * vertex count never changes.
 */
export function steamPaths(series: (number | null)[], w: number, h: number): { line: string; area: string } {
  let prev = series.find((v) => v !== null) ?? 0;
  const vals = series.map((v) => (v === null ? prev : (prev = v)));
  const max = Math.max(1, ...vals) * 1.15;
  const line = vals
    .map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * w).toFixed(1)} ${(h - (v / max) * (h - 10)).toFixed(1)}`)
    .join(" ");
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}
