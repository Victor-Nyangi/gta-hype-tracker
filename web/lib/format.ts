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
