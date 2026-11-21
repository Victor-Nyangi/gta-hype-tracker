/** Compact numbers as the prototype prints them: 4.20M, 760K, 9,876. */
export function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Whole number with thousands separators: 1,234,567. */
export const comma = (n: number): string => Math.round(n).toLocaleString("en-US");

/**
 * A YYYY-MM-DD date as "September 17, 2013" (long) or "Sep 17, 2013" (short). Formatted
 * in UTC so the server and every browser print the same string.
 */
export function formatDay(iso: string, month: "long" | "short" = "long"): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Signed hours with a real minus sign: "−12h", "+3h". */
export const signedHours = (h: number): string => (h < 0 ? `−${-h}h` : `+${h}h`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * An ISO time as "19:39 UTC, Nov 19" (or "19:39 UTC" with `date: false`). Always UTC, by
 * hand, so the server and every browser print the same string.
 */
export function utcStamp(iso: string, { date = true }: { date?: boolean } = {}): string {
  const d = new Date(iso);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  return date ? `${hm}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : hm;
}

/** How long ago, coarsely: "just now", "4 min ago", "10 h ago", "2 days ago". */
export function ago(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

const SCALES = [
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
] as const;

/**
 * `n` printed in `ref`'s unit: whole numbers from 10 of the unit up, one decimal below
 * (235M, 61M, 8.2B). `ref` defaults to `n`; pass the final value while counting up, so the
 * unit does not jump (0M, 120M, 235M rather than 0, 120K, 235M). Under 1,000: commas.
 */
export function inScale(n: number, ref = n): string {
  const scale = SCALES.find(([div]) => Math.abs(ref) >= div);
  if (!scale) return comma(n);
  const [div, suffix] = scale;
  return `${(n / div).toFixed(Math.abs(ref) / div >= 10 ? 0 : 1)}${suffix}`;
}

/**
 * A low–high range in the high end's unit: "24–43M", "8.0–8.2B". `ref` (default `high`)
 * fixes the unit, as for inScale.
 */
export function rangeLabel(low: number, high: number, ref = high): string {
  const hi = inScale(high, ref);
  const suffix = hi.replace(/[\d.,-]/g, "");
  return `${inScale(low, ref).replace(suffix, "")}–${hi}`;
}

type Figure = { value: number; valueMax: number | null; unit: "units" | "usd" };

/**
 * A reported figure: "235M", or "$8.0–8.2B" for a dollar range. `now` is the counting-up
 * value (default: the figure itself); the unit always comes from the figure.
 */
export function figureLabel(f: Figure, now: { value: number; valueMax: number | null } = f): string {
  const n =
    f.valueMax === null || now.valueMax === null
      ? inScale(now.value, f.value)
      : rangeLabel(now.value, now.valueMax, f.valueMax);
  return f.unit === "usd" ? `$${n}` : n;
}

/** A source's as-of: "2026-11" -> "Nov 2026", "2026-11-09" -> "Nov 9, 2026". */
export function asOfLabel(asOf: string): string {
  const [y, m, d] = asOf.split("-").map(Number);
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}

/** US dollars with cents: "$1,234.50". */
export const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A signed number with a real minus sign, fixed decimals: "+4.00", "−8.00", "0.00". */
function signed(n: number, digits: number): string {
  const s = Math.abs(n).toFixed(digits);
  if (Number(s) === 0) return s;
  return `${n < 0 ? "−" : "+"}${s}`;
}

/** A percent move: "+4.00%", "−8.00%". */
export const signedPct = (n: number): string => `${signed(n, 2)}%`;

/** Percentage points: "+2.0 pts", "−9.0 pts". */
export const signedPts = (n: number): string => `${signed(n, 1)} pts`;
