"use client";

import type { TrailerSeries } from "@/lib/data";
import { fmt } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { Freshness } from "../live/Freshness";
import { useLive } from "../live/LiveSignals";
import { ChartReveal } from "../Reveal";

const W = 1000;
const H = 240;
const MAX = 200e6;
const GRID = [50, 100, 150, 200];

const STROKE: Record<TrailerSeries["color"], string> = {
  violet: "var(--color-violet)",
  orange: "var(--color-orange)",
};
const SWATCH: Record<TrailerSeries["color"], string> = { violet: "bg-violet", orange: "bg-orange" };

function linePath(vals: number[]) {
  return vals
    .map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * W).toFixed(1)} ${(H - (v / MAX) * (H - 10)).toFixed(1)}`)
    .join(" ");
}

function Legend({ trailer, live }: { trailer: TrailerSeries; live: number | undefined }) {
  const total = useCountUp(trailer.viewsByDay[trailer.viewsByDay.length - 1]);
  const now = useCountUp(live ?? 0);
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`h-[3px] w-3.5 rounded-[2px] ${SWATCH[trailer.color]}`} />
      {trailer.label} · {fmt(total)} by day 30
      {live !== undefined && <span className="text-fg-2">· {fmt(now)} now</span>}
    </li>
  );
}

/**
 * Trailer views (design/README.md §2): Trailer 1 (violet) and Trailer 2 (orange) over days
 * 0-30, gridlines at 50/100/150/200M, legend with the day-30 totals.
 *
 * The curves are curated, not sampled (lib/data/trailers.ts), so the card says "reported
 * milestones". Live YouTube totals join the legend only while the collector samples YouTube.
 */
export function TrailerCard() {
  const { data } = useLive();
  const { trailers, youtube } = data;
  const liveViews = new Map(youtube?.data.videos.map((v) => [v.id, v.views]));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[13px] font-bold text-fg-2">Trailer views · reported milestones, first 30 days</h3>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[13px] font-bold">
          {trailers.map((t) => (
            <Legend key={t.id} trailer={t} live={liveViews.get(t.id)} />
          ))}
        </ul>
        {youtube && <Freshness origin={youtube.origin} updatedAt={youtube.updatedAt} />}
      </div>
      <div
        role="img"
        aria-label={`Chart: reported cumulative YouTube views over each trailer's first 30 days. ${trailers
          .map((t) => `${t.label}: ${fmt(t.viewsByDay[t.viewsByDay.length - 1])} by day 30`)
          .join("; ")}.`}
        className="relative h-[240px]"
      >
        {GRID.map((m) => (
          <div
            key={m}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-card-raised"
            style={{ top: `${(H - ((m * 1e6) / MAX) * (H - 10)) / 2.4}%` }}
          >
            <span className="absolute right-0 -top-4 text-micro text-fg-3">{m}M</span>
          </div>
        ))}
        <ChartReveal className="absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full overflow-visible">
            {trailers.map((t) => (
              <path
                key={t.id}
                d={linePath(t.viewsByDay)}
                fill="none"
                stroke={STROKE[t.color]}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </ChartReveal>
      </div>
      <div aria-hidden="true" className="flex justify-between text-micro font-bold text-fg-3">
        <span>Day 0</span>
        <span>Day 10</span>
        <span>Day 20</span>
        <span>Day 30</span>
      </div>
      <p className="m-0 text-sm text-fg-3">
        Source: reported figures, not sampled here. Day 0 is the widely reported day-one count
        (Trailer 1: about 93M YouTube views in 24 hours); the line between milestones is
        illustrative.{youtube ? "" : " Live YouTube totals appear here once the tracker samples YouTube."}
      </p>
    </div>
  );
}
