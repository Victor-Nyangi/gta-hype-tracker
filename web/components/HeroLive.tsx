"use client";

import { launchClock, pad2 } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { Badge } from "./Badge";

/*
 * The time-dependent parts of the hero. On the server (and without JS) they render the
 * post-launch state with placeholder digits: the page is only ever deployed after launch,
 * and the static shell must not contain a time read at build.
 */

export function LaunchBadge() {
  const now = useNow();
  const live = now === null || launchClock(now).live;
  return <Badge tone={live ? "success" : "warning"}>{live ? "Out now · Nov 19, 2026" : "Launching Nov 19, 2026"}</Badge>;
}

const UNITS = ["Days", "Hours", "Minutes", "Seconds"] as const;

export function LaunchClockBoxes() {
  const now = useNow();
  const c = now === null ? null : launchClock(now);
  const values = c ? [c.days, c.hours, c.minutes, c.seconds] : null;
  return (
    <div
      role="timer"
      aria-label={
        c
          ? `${c.days} days, ${c.hours} hours, ${c.minutes} minutes ${c.live ? "since launch" : "until launch"}`
          : "Time since launch"
      }
      className="grid grid-cols-[repeat(4,minmax(0,150px))] gap-3"
    >
      {UNITS.map((unit, i) => (
        <div
          key={unit}
          className="flex flex-col gap-1 rounded-clock border border-border bg-[rgba(29,18,32,0.72)] px-3.5 pt-4 pb-3"
        >
          <span
            aria-hidden="true"
            className="text-[clamp(34px,5vw,56px)] leading-none font-extrabold tracking-[-0.02em] tabular-nums"
          >
            {values ? pad2(values[i]) : "--"}
          </span>
          <span className="text-[11px] font-bold tracking-eyebrow text-fg-2 uppercase">{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function ClockCaption() {
  const now = useNow();
  const live = now === null || launchClock(now).live;
  return (
    <p className="m-0 text-[15px] text-fg-2">
      {live ? "Time since doors opened at midnight Eastern." : "Until doors open at midnight Eastern."}
    </p>
  );
}
