"use client";

import { useId, useState } from "react";
import type { TwitchSeries } from "@/lib/data";
import { comma, fmt, signedHours } from "@/lib/format";
import { twitchView } from "@/lib/twitch";
import { useCountUp } from "@/lib/use-count-up";
import { useNow } from "@/lib/use-now";
import { LiveDot } from "../LiveDot";
import { ChartReveal } from "../Reveal";
import { Kpi } from "../ui";

const W = 1000;
const H = 300;
const xs = (hour: number) => ((hour + 24) / 48) * W;

/**
 * Twitch card (design/README.md §2): KPIs, then a 300px chart of a 48h window
 * (-24h -> +24h) with a dashed "Doors open" marker at 50%, a pink area fading out, a 3px
 * violet -> pink -> orange line, a pulsing dot on the newest point, no future hours, and
 * a hover crosshair with a tooltip.
 */
export function TwitchCard({ series }: { series: TwitchSeries }) {
  const now = useNow();
  const view = twitchView(series, now);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const watching = useCountUp(view.current);
  const peak = useCountUp(view.peak);
  const hours = useCountUp(view.hoursWatched);

  // y scale from the whole window, so it does not jump as hours are added
  const max = Math.max(...series.points.map((p) => p.viewers)) * 1.12;
  const ys = (v: number) => H - (v / max) * (H - 10);
  const line = view.points
    .map((p, i) => `${i ? "L" : "M"}${xs(p.hoursFromLaunch).toFixed(1)} ${ys(p.viewers).toFixed(1)}`)
    .join(" ");
  const first = view.points[0];
  const last = view.points[view.points.length - 1];
  const area = `${line} L${xs(last.hoursFromLaunch).toFixed(1)} ${H} L${xs(first.hoursFromLaunch).toFixed(1)} ${H} Z`;

  const hovered = hover === null ? undefined : view.points.find((p) => p.hoursFromLaunch === hover);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * 48);
    setHover(Math.max(0, Math.min(48, i)) - 24);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 text-[13px] font-bold text-fg-2">Twitch concurrent viewers · GTA VI category</h3>
          <p className="m-0 flex flex-wrap items-baseline gap-x-3">
            <span className="text-[clamp(44px,6vw,68px)] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
              {comma(watching)}
            </span>
            <span className="text-sm font-extrabold text-pink">watching now</span>
          </p>
        </div>
        <dl className="m-0 flex gap-8">
          <Kpi label="Peak" value={fmt(peak)} className="text-orange" />
          <Kpi label="Hours watched" value={fmt(hours)} />
        </dl>
      </div>

      <div
        role="img"
        aria-label={`Chart: Twitch viewers in the GTA VI category from 24 hours before launch to now. Peak ${fmt(view.peak)}, now ${fmt(view.current)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="relative h-[300px] cursor-crosshair touch-pan-y"
      >
        <div aria-hidden="true" className="absolute inset-y-0 left-1/2 border-l border-dashed border-track" />
        <span
          aria-hidden="true"
          className="absolute top-0 left-1/2 translate-x-1.5 text-micro font-bold tracking-eyebrow text-fg-3 uppercase"
        >
          Doors open
        </span>

        <ChartReveal className="absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full overflow-visible">
            <defs>
              <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-pink)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--color-pink)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${uid}l`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-violet)" />
                <stop offset="60%" stopColor="var(--color-pink)" />
                <stop offset="100%" stopColor="var(--color-orange)" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${uid}f)`} />
            <path
              d={line}
              fill="none"
              stroke={`url(#${uid}l)`}
              strokeWidth={3}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </ChartReveal>

        <LiveDot
          className="absolute -mt-1.5 -ml-1.5 size-3! bg-orange!"
          style={{ left: `${xs(last.hoursFromLaunch) / 10}%`, top: `${ys(last.viewers) / 3}%` }}
        />

        {hovered && (
          <div aria-hidden="true" className="pointer-events-none">
            <div
              className="absolute inset-y-0 border-l border-fg opacity-50"
              style={{ left: `${xs(hovered.hoursFromLaunch) / 10}%` }}
            />
            <div
              className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-fg"
              style={{ left: `${xs(hovered.hoursFromLaunch) / 10}%`, top: `${ys(hovered.viewers) / 3}%` }}
            />
            <div
              className="absolute top-2 rounded-button border border-track bg-card-raised px-3 py-2 whitespace-nowrap shadow-md"
              style={{
                left: `${xs(hovered.hoursFromLaunch) / 10}%`,
                // centred mid-chart, sliding to left/right-aligned at the edges so it stays inside
                transform: `translateX(-${(xs(hovered.hoursFromLaunch) / 10).toFixed(1)}%)`,
              }}
            >
              <div className="text-base font-extrabold tabular-nums">{comma(hovered.viewers)} viewers</div>
              <div className="text-micro text-fg-3">
                {hovered.hoursFromLaunch === 0 ? "Launch" : `Launch ${signedHours(hovered.hoursFromLaunch)}`}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        aria-hidden="true"
        className="flex justify-between text-micro font-bold tracking-[0.04em] text-fg-3"
      >
        <span>−24h</span>
        <span>−12h</span>
        <span>Launch</span>
        <span>+12h</span>
        <span>+24h</span>
      </div>
    </div>
  );
}
