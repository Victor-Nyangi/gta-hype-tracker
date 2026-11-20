"use client";

import { WAITS, type WaitCounter } from "@/lib/data";
import { comma, formatDay } from "@/lib/format";
import { daysSince } from "@/lib/time";
import { useCountUp } from "@/lib/use-count-up";
import { useNow } from "@/lib/use-now";
import { Reveal } from "../Reveal";
import { SeenScope } from "../SeenScope";

const COLOR: Record<WaitCounter["color"], string> = {
  violet: "text-violet",
  pink: "text-pink",
  orange: "text-orange",
  teal: "text-teal",
};

function WaitCard({ wait, now, index }: { wait: WaitCounter; now: number | null; index: number }) {
  const days = useCountUp(daysSince(wait.since, now));
  return (
    <Reveal
      as="li"
      index={index}
      className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-6 shadow-sm"
    >
      <span className="text-[13px] font-bold text-fg-2">{wait.label}</span>
      <span
        className={`text-[52px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${COLOR[wait.color]}`}
      >
        {comma(days)}
        <span className="sr-only"> days</span>
      </span>
      <span className="text-[13px] text-fg-3">{formatDay(wait.since)}</span>
    </Reveal>
  );
}

/** "The wait, in days" (design/README.md §1). */
export function WaitCounters() {
  const now = useNow();
  return (
    <section
      aria-labelledby="wait-title"
      className="mx-auto flex max-w-content flex-col gap-8 px-6 pt-20 pb-8"
    >
      <Reveal className="flex flex-col gap-2">
        <p className="m-0 text-micro font-bold tracking-eyebrow text-orange uppercase">The wait, in days</p>
        <h2
          id="wait-title"
          className="m-0 font-display text-[clamp(36px,5vw,56px)] font-bold tracking-[-0.02em] [font-stretch:72%]"
        >
          Thirteen years in the making.
        </h2>
      </Reveal>
      <SeenScope>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4 p-0">
          {WAITS.map((w, i) => (
            <WaitCard key={w.since} wait={w} now={now} index={i} />
          ))}
        </ul>
      </SeenScope>
    </section>
  );
}
