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
