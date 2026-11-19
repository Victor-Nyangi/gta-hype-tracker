/** Launch moment: midnight Eastern on 19 Nov 2026 (design/README.md). */
export const LAUNCH_ISO = "2026-11-19T05:00:00Z";
export const LAUNCH_MS = Date.parse(LAUNCH_ISO);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface LaunchClock {
  /** true once the launch moment has passed */
  live: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Days/hours/minutes/seconds since launch, or until it when `now` is before it. */
export function launchClock(now: number, launch = LAUNCH_MS): LaunchClock {
  const diff = now - launch;
  const a = Math.abs(diff);
  return {
    live: diff >= 0,
    days: Math.floor(a / DAY),
    hours: Math.floor(a / HOUR) % 24,
    minutes: Math.floor(a / MINUTE) % 60,
    seconds: Math.floor(a / SECOND) % 60,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** "Live · day 1 · 12:49:07" or "T-minus 3d 04:05:06" (the header status). */
export function statusLabel(c: LaunchClock): string {
  const hms = `${pad2(c.hours)}:${pad2(c.minutes)}:${pad2(c.seconds)}`;
  return c.live ? `Live · day ${c.days + 1} · ${hms}` : `T-minus ${c.days}d ${hms}`;
}
