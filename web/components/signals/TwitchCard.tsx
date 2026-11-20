"use client";

import { useId, useState } from "react";
import type { Sourced, TwitchSeries } from "@/lib/data/types";
import { comma, fmt, signedHours, utcStamp } from "@/lib/format";
import { twitchTicks, twitchView, WINDOW_HOURS } from "@/lib/twitch";
import { LAUNCH_MS } from "@/lib/time";
import { useCountUp } from "@/lib/use-count-up";
import { Unavailable } from "../live/CardBoundary";
import { Freshness } from "../live/Freshness";
import { useLive } from "../live/LiveSignals";
import { LiveDot } from "../LiveDot";
import { ChartReveal } from "../Reveal";
import { Kpi } from "../ui";

const W = 1000;
const H = 300;
const HOUR = 3600_000;

/**
 * Twitch card (design/README.md §2): KPIs, then a 300px chart of a 48h window with a dashed
 * "Doors open" marker, a pink area fading out, a 3px violet -> pink -> orange line, a
 * pulsing dot on the newest point, and a hover crosshair with a tooltip.
 *
 * Real data starts when the collector did (launch +14.6h), so only that span is drawn and
 * the empty part of the window says when tracking began.
 */
export function TwitchCard() {
  const { data, pending } = useLive();
  if (!data.twitch) return <Unavailable name="Twitch concurrent viewers · GTA VI category" />;
  return <TwitchChart twitch={data.twitch} pending={pending} />;
}

function TwitchChart({
  twitch,
  pending,
}: {
  twitch: Sourced<TwitchSeries>;
  pending: boolean;
}) {
  const series = twitch.data;
  const view = twitchView(series);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const watching = useCountUp(view.current);
  const peak = useCountUp(view.peak);
  const hours = useCountUp(view.hoursWatched);

  const xs = (hour: number) => ((hour - view.start) / WINDOW_HOURS) * W;
  const pct = (hour: number) => xs(hour) / 10;
  const max = Math.max(1, view.current, ...view.points.map((p) => p.viewers)) * 1.12;
  const ys = (v: number) => H - (v / max) * (H - 10);
  const line = view.points
    .map((p, i) => `${i ? "L" : "M"}${xs(p.hoursFromLaunch).toFixed(1)} ${ys(p.viewers).toFixed(1)}`)
    .join(" ");
  const first = view.points[0];
  const last = view.points.at(-1);
  const area =
    first && last
      ? `${line} L${xs(last.hoursFromLaunch).toFixed(1)} ${H} L${xs(first.hoursFromLaunch).toFixed(1)} ${H} Z`
      : "";

  const doors = view.start <= 0 && 0 <= view.end;
  // the empty, pre-tracking part of the window (from its left edge to tracking_since)
  const untracked = Math.min(Math.max(view.trackingFrom, view.start), view.end) - view.start;
  const showNote = untracked / WINDOW_HOURS >= 0.18;
  // the note sits left of the "Doors open" line when that side is wide enough, so the
  // dashed marker never runs through it
  const noteEnd = doors && -view.start / WINDOW_HOURS >= 0.18 ? Math.min(0, view.start + untracked) : view.start + untracked;

  const hovered = hover === null ? undefined : view.points.find((p) => p.hoursFromLaunch === hover);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * WINDOW_HOURS);
    setHover(Math.max(0, Math.min(WINDOW_HOURS, i)) + view.start);
  };
  const hourLabel = (h: number) =>
    `${h === 0 ? "Launch" : `Launch ${signedHours(h)}`} · ${utcStamp(new Date(LAUNCH_MS + h * HOUR).toISOString(), { date: false })}`;

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
          <Freshness origin={twitch.origin} updatedAt={twitch.updatedAt} pending={pending} />
        </div>
        <dl className="m-0 flex gap-8">
          <Kpi label="Peak" value={fmt(peak)} note={utcStamp(view.peakAt)} className="text-orange" />
          <Kpi label="Hours watched" value={fmt(hours)} note="since tracking began" />
        </dl>
      </div>

      <div
        role="img"
        aria-label={`Chart: Twitch viewers in the GTA VI category, hourly, from launch ${signedHours(view.start)} to ${signedHours(view.end)}. Tracking began ${utcStamp(series.trackingSince)}. Peak ${fmt(view.peak)}, now ${fmt(view.current)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="relative h-[300px] cursor-crosshair touch-pan-y"
      >
        {showNote && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgb(255_255_255/0.018)_10px_11px)]"
              style={{ width: `${pct(view.start + untracked)}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 flex items-center justify-center px-3"
              style={{ width: `${pct(noteEnd)}%` }}
            >
              <span className="text-center text-micro font-bold tracking-[0.04em] text-balance text-fg-3">
                Tracking since {utcStamp(series.trackingSince)}
              </span>
            </div>
          </>
        )}

        {doors && (
          <>
            <div aria-hidden="true" className="absolute inset-y-0 border-l border-dashed border-track" style={{ left: `${pct(0)}%` }} />
            <span
              aria-hidden="true"
              className="absolute top-0 translate-x-1.5 text-micro font-bold tracking-eyebrow text-fg-3 uppercase"
              style={{ left: `${pct(0)}%` }}
            >
              Doors open
            </span>
          </>
        )}

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
            {area && <path d={area} fill={`url(#${uid}f)`} />}
            {line && (
              <path
                d={line}
                fill="none"
                stroke={`url(#${uid}l)`}
                strokeWidth={3}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </ChartReveal>

        {last && (
          <LiveDot
            className="absolute -mt-1.5 -ml-1.5 size-3! bg-orange!"
            style={{ left: `${pct(last.hoursFromLaunch)}%`, top: `${ys(last.viewers) / 3}%` }}
          />
        )}

        {hovered && (
          <div aria-hidden="true" className="pointer-events-none">
            <div
              className="absolute inset-y-0 border-l border-fg opacity-50"
              style={{ left: `${pct(hovered.hoursFromLaunch)}%` }}
            />
            <div
              className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-fg"
              style={{ left: `${pct(hovered.hoursFromLaunch)}%`, top: `${ys(hovered.viewers) / 3}%` }}
            />
            <div
              className="absolute top-2 rounded-button border border-track bg-card-raised px-3 py-2 whitespace-nowrap shadow-md"
              style={{
                left: `${pct(hovered.hoursFromLaunch)}%`,
                // centred mid-chart, sliding to left/right-aligned at the edges so it stays inside
                transform: `translateX(-${pct(hovered.hoursFromLaunch).toFixed(1)}%)`,
              }}
            >
              <div className="text-base font-extrabold tabular-nums">{comma(hovered.viewers)} viewers</div>
              <div className="text-micro text-fg-3">{hourLabel(hovered.hoursFromLaunch)} · hourly mean</div>
            </div>
          </div>
        )}
      </div>

      <div aria-hidden="true" className="relative h-4 text-micro font-bold tracking-[0.04em] text-fg-3">
        {twitchTicks(view).map((h) => (
          <span
            key={h}
            className="absolute top-0 whitespace-nowrap"
            // left-aligned at the left edge, centred mid-axis, right-aligned at the right edge
            style={{ left: `${pct(h)}%`, transform: `translateX(-${pct(h).toFixed(1)}%)` }}
          >
            {h === 0 ? "Launch" : signedHours(h)}
          </span>
        ))}
      </div>
    </div>
  );
}
