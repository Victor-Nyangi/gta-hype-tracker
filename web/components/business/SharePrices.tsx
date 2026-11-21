"use client";

import { useId, useState } from "react";
import { MILESTONES, type PriceMove, type SharePrices, type Sourced } from "@/lib/data";
import { formatDay, signedPct, signedPts, usd } from "@/lib/format";
import { pricePath, priceView } from "@/lib/prices";
import { useCountUp } from "@/lib/use-count-up";
import { Freshness } from "../live/Freshness";
import { ChartReveal } from "../Reveal";
import { SeenScope } from "../SeenScope";
import { EYEBROW } from "../ui";

const W = 1000;
const H = 280;
/** Where the y gridlines sit, as a share of the chart's height from the top. */
const GRID = [0.12, 0.5, 0.88];

const LABEL_TONE = { orange: "text-orange", pink: "text-pink", violet: "text-violet", muted: "text-fg-3" } as const;

const tone = (n: number | null) => (n === null ? "text-fg-3" : n >= 0 ? "text-teal" : "text-pink");

/** A stat chip: eyebrow, a counting-up value, and a quiet note under it. */
function Chip({
  label,
  value,
  format,
  note,
  className = "",
  wide = false,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  note: string;
  className?: string;
  /** Spans both columns of the phone grid. */
  wide?: boolean;
}) {
  const shown = useCountUp(value ?? 0);
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-button border border-border bg-card-raised px-4 py-3 ${wide ? "col-span-2 sm:col-span-1" : ""}`}
    >
      <dt className={`${EYEBROW} text-fg-3`}>{label}</dt>
      <dd className={`m-0 text-[24px] leading-tight font-extrabold tabular-nums ${className}`}>
        {value === null ? "—" : format(shown)}
      </dd>
      <dd className="m-0 text-micro font-bold text-fg-3">{note}</dd>
    </div>
  );
}

const span = (m: PriceMove) => `${formatDay(m.from, "short").replace(/, \d{4}$/, "")} → ${formatDay(m.to, "short").replace(/, \d{4}$/, "")}`;

/**
 * Take-Two's daily close with QQQ (the Nasdaq-100 ETF) rebased to the same starting value
 * as a muted comparison line, event markers from the launch timeline, and stat chips for
 * the latest close, the launch-day move and the move since launch, each against QQQ.
 */
export function SharePriceChart({ prices, pending }: { prices: Sourced<SharePrices>; pending: boolean }) {
  const p = prices.data;
  const { subject, baseline } = p;
  const view = priceView(p, MILESTONES);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const n = view.points.length;
  const pct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => (1 - (v - view.min) / (view.max - view.min || 1)) * 100;
  const line = pricePath(
    view.points.map((pt) => pt.close),
    view,
    W,
    H,
  );
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const base = pricePath(
    view.points.map((pt) => pt.baseline),
    view,
    W,
    H,
  );
  const last = view.points.at(-1)!;
  const hovered = hover === null ? undefined : view.points[hover];

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const qqqMove = (m: "launchDay" | "sinceLaunch") => baseline?.[m]?.pct ?? null;
  const vsNote = (m: "launchDay" | "sinceLaunch") => {
    const q = qqqMove(m);
    return q === null ? "QQQ not available" : `QQQ ${signedPct(q)}`;
  };
  const moveNote = (m: PriceMove | null, pending: string) => (m ? span(m) : pending);
  const latestDay = formatDay(subject.latestDate, "short");
  const peers = [...p.peers, ...(baseline ? [baseline] : [])].filter((t) => t.sinceLaunch);

  const summary =
    `Chart: ${subject.name} (${subject.symbol}) daily closes from ${formatDay(view.points[0].date, "short")} to ${latestDay}, ` +
    `latest ${usd(subject.latestClose)}` +
    (subject.sinceLaunch ? `, ${signedPct(subject.sinceLaunch.pct)} since the close before launch` : "") +
    (view.rebasedOn ? `. QQQ is drawn rebased to TTWO's close on ${formatDay(view.rebasedOn, "short")}.` : ".");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[13px] font-bold text-fg-2">
          {subject.name} ({subject.symbol}) share price
        </h3>
        <Freshness origin={prices.origin} updatedAt={prices.updatedAt} pending={pending} />
      </div>

      <SeenScope>
        {/* phones: the latest close across the top, then each move beside its QQQ comparison */}
        <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Chip
            label="Latest close"
            value={subject.latestClose}
            format={usd}
            note={latestDay}
            className="text-orange"
            wide
          />
          <Chip
            label="Launch day"
            value={subject.launchDay?.pct ?? null}
            format={signedPct}
            note={moveNote(subject.launchDay, "Needs the Nov 18 and 19 closes")}
            className={tone(subject.launchDay?.pct ?? null)}
          />
          <Chip
            label="Launch day vs QQQ"
            value={p.vsBaseline.launchDay}
            format={signedPts}
            note={vsNote("launchDay")}
            className={tone(p.vsBaseline.launchDay)}
          />
          <Chip
            label="Since launch"
            value={subject.sinceLaunch?.pct ?? null}
            format={signedPct}
            note={moveNote(subject.sinceLaunch, "Needs a close after Nov 18")}
            className={tone(subject.sinceLaunch?.pct ?? null)}
          />
          <Chip
            label="Since launch vs QQQ"
            value={p.vsBaseline.sinceLaunch}
            format={signedPts}
            note={vsNote("sinceLaunch")}
            className={tone(p.vsBaseline.sinceLaunch)}
          />
        </dl>
      </SeenScope>

      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-1 text-micro font-bold text-fg-3">
          <span className="inline-flex items-center gap-2">
            <span className="h-[3px] w-5 rounded-pill bg-[linear-gradient(90deg,var(--color-violet),var(--color-pink),var(--color-orange))]" />
            {subject.symbol} close
          </span>
          {view.rebasedOn && (
            <span className="inline-flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed border-fg-3" />
              QQQ, rebased to {subject.symbol} on {formatDay(view.rebasedOn, "short")}
            </span>
          )}
        </div>

        <div
          role="img"
          aria-label={summary}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          className="relative h-[280px] cursor-crosshair touch-pan-y"
        >
          {GRID.map((g) => (
            <div key={g} aria-hidden="true" className="absolute inset-x-0 border-t border-border" style={{ top: `${g * 100}%` }}>
              <span className="absolute top-1 left-0 rounded-sm bg-card/80 pr-1 text-micro font-bold text-fg-3 tabular-nums">
                {usd(view.max - g * (view.max - view.min)).replace(/\.\d+$/, "")}
              </span>
            </div>
          ))}

          {view.markers.map((m) => (
            <div key={m.date} aria-hidden="true">
              <div className="absolute inset-y-0 border-l border-dashed border-track" style={{ left: `${pct(m.index)}%` }} />
              <span
                className={`absolute top-0 text-micro font-bold tracking-eyebrow whitespace-nowrap uppercase ${LABEL_TONE[m.tone]}`}
                style={
                  // labels in the right third sit to the left of their line, so they stay inside
                  pct(m.index) > 66
                    ? { right: `${100 - pct(m.index)}%`, transform: "translateX(-6px)" }
                    : { left: `${pct(m.index)}%`, transform: "translateX(6px)" }
                }
              >
                {m.label}
              </span>
            </div>
          ))}

          <ChartReveal className="absolute inset-0">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full overflow-visible">
              <defs>
                <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-pink)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--color-pink)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`${uid}l`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-violet)" />
                  <stop offset="60%" stopColor="var(--color-pink)" />
                  <stop offset="100%" stopColor="var(--color-orange)" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${uid}f)`} />
              {base && (
                <path
                  d={base}
                  fill="none"
                  stroke="var(--color-fg-3)"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
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

          <span
            aria-hidden="true"
            className="absolute -mt-1.5 -ml-1.5 size-3 rounded-full bg-orange"
            style={{ left: `${pct(n - 1)}%`, top: `${yPct(last.close)}%` }}
          />

          {hovered && (
            <div aria-hidden="true" className="pointer-events-none">
              <div className="absolute inset-y-0 border-l border-fg opacity-50" style={{ left: `${pct(hover!)}%` }} />
              <div
                className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-fg"
                style={{ left: `${pct(hover!)}%`, top: `${yPct(hovered.close)}%` }}
              />
              <div
                className="absolute top-6 rounded-button border border-track bg-card-raised px-3 py-2 whitespace-nowrap shadow-md"
                style={{ left: `${pct(hover!)}%`, transform: `translateX(-${pct(hover!).toFixed(1)}%)` }}
              >
                <div className="text-base font-extrabold tabular-nums">
                  {subject.symbol} {usd(hovered.close)}
                </div>
                <div className="text-micro text-fg-3">
                  {formatDay(hovered.date, "short")} close
                  {hovered.baseline !== null && ` · QQQ rebased ${usd(hovered.baseline)}`}
                </div>
              </div>
            </div>
          )}
        </div>

        <div aria-hidden="true" className="relative h-4 text-micro font-bold tracking-[0.04em] text-fg-3">
          {view.ticks.map((t) => (
            <span
              key={t.index}
              className="absolute top-0 whitespace-nowrap"
              style={{ left: `${pct(t.index)}%`, transform: `translateX(-${pct(t.index).toFixed(1)}%)` }}
            >
              {/* "Jul 2026": the year only from sm up, where there is room for it */}
              {t.label.replace(/ \d{4}$/, "")}
              {/ \d{4}$/.test(t.label) && <span className="hidden sm:inline">{t.label.match(/ \d{4}$/)![0]}</span>}
            </span>
          ))}
        </div>
      </div>

      {peers.length > 0 && (
        <p className="m-0 text-[13px] text-fg-3">
          Since launch, for comparison:{" "}
          {peers.map((t, i) => (
            <span key={t.symbol}>
              {i > 0 && " · "}
              <abbr title={t.name} className="no-underline">
                {t.symbol}
              </abbr>{" "}
              <span className="font-bold text-fg-2 tabular-nums">{signedPct(t.sinceLaunch!.pct)}</span>
            </span>
          ))}
        </p>
      )}

      <p className="m-0 text-micro text-fg-3">
        Share prices are for context, not investment advice. Daily closes (unadjusted) from{" "}
        <a href={p.sourceUrl}>{p.source}</a>, latest close {latestDay}.
      </p>
    </div>
  );
}
