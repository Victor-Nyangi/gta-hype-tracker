import type { CSSProperties } from "react";
import { MILESTONES, type Milestone } from "@/lib/data";
import { formatDay } from "@/lib/format";
import { ChartReveal, Reveal } from "../Reveal";
import { LaunchCtas } from "./LaunchCtas";

const DOT: Record<Milestone["tone"], string> = {
  violet: "bg-violet",
  pink: "bg-pink",
  muted: "bg-track",
  orange: "bg-orange",
};

const T0 = Date.parse(MILESTONES[0].date);
const T1 = Date.parse(MILESTONES[MILESTONES.length - 1].date);

type Placed = Milestone & { p: number; below: boolean; align: "center" | "end" | "start" };

/*
 * Milestones sit proportionally by date and alternate below/above the track. Two on the
 * same side less than ~6% apart (the May and November 2025 delays, four days and six
 * months after their neighbours) would print over each other, as they do in the
 * prototype; the earlier one is anchored to end at its dot and the later one to start at
 * its dot, so both stay readable.
 */
function place(): Placed[] {
  const placed: Placed[] = MILESTONES.map((m, i) => ({
    ...m,
    p: (Date.parse(m.date) - T0) / (T1 - T0),
    below: i % 2 === 0,
    align: "center",
  }));
  for (let i = 0; i + 2 < placed.length; i++) {
    const a = placed[i];
    const b = placed[i + 2];
    if (b.p - a.p < 0.06) {
      a.align = "end";
      b.align = "start";
    }
  }
  return placed;
}

const ALIGN = {
  center: "-translate-x-1/2 items-center text-center",
  end: "-translate-x-[calc(100%-7px)] items-end text-right",
  start: "-translate-x-[7px] items-start text-left",
} as const;

function Dot({ tone }: { tone: Milestone["tone"] }) {
  return <span aria-hidden="true" className={`size-3.5 shrink-0 rounded-full border-3 border-canvas ${DOT[tone]}`} />;
}

/** Road to launch (design/README.md §1): a 150px track, plus the two CTAs. */
export function Timeline() {
  const milestones = place();
  return (
    <section
      aria-labelledby="road-title"
      className="mx-auto flex max-w-content flex-col gap-6 px-6 pt-8 pb-24"
    >
      <Reveal>
        <h2 id="road-title" className="m-0 text-micro font-bold tracking-eyebrow text-pink uppercase">
          Road to launch
        </h2>
      </Reveal>

      {/* Tablet and up: the design's horizontal track. */}
      <Reveal className="relative hidden h-[150px] md:block">
        <div aria-hidden="true" className="absolute inset-x-0 top-[74px] h-0.5 bg-track" />
        <ChartReveal className="absolute inset-x-0 top-[73px] h-1 rounded-[4px] bg-[linear-gradient(90deg,var(--color-orchid),var(--color-pink),var(--color-orange))]" />
        <ol className="m-0 list-none p-0">
          {milestones.map((m) => (
            <li
              key={m.label}
              style={{ left: `calc(60px + (100% - 120px) * ${m.p.toFixed(4)})` } as CSSProperties}
              className={`absolute flex w-[120px] flex-col gap-1.5 ${m.below ? "top-[67px]" : "top-1.5"} ${ALIGN[m.align]}`}
            >
              {m.below && <Dot tone={m.tone} />}
              <span className="text-xs font-extrabold">{m.label}</span>
              <time dateTime={m.date} className="text-[11px] text-fg-3">
                {formatDay(m.date, "short")}
              </time>
              {!m.below && <Dot tone={m.tone} />}
            </li>
          ))}
        </ol>
      </Reveal>

      {/* Phones: seven labels cannot share 342px, so the track runs down the page. */}
      <Reveal className="relative md:hidden">
        <div aria-hidden="true" className="absolute top-2 bottom-2 left-1.5 w-0.5 bg-track" />
        <ChartReveal
          axis="y"
          className="absolute top-2 bottom-2 left-[5px] w-1 rounded-[4px] bg-[linear-gradient(180deg,var(--color-orchid),var(--color-pink),var(--color-orange))]"
        />
        <ol className="relative m-0 flex list-none flex-col gap-4 p-0">
          {milestones.map((m) => (
            <li key={m.label} className="flex items-start gap-3">
              <Dot tone={m.tone} />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-extrabold">{m.label}</span>
                <time dateTime={m.date} className="text-[11px] text-fg-3">
                  {formatDay(m.date, "short")}
                </time>
              </span>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="flex flex-wrap gap-3 pt-4">
        <LaunchCtas />
      </Reveal>
    </section>
  );
}
