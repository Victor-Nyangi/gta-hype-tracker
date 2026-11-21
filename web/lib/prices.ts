import type { Milestone, SharePrices } from "./data/types";

/** One trading day on the chart: Take-Two's close and QQQ rebased to Take-Two's scale. */
export interface PricePoint {
  date: string;
  close: number;
  /** QQQ x (TTWO / QQQ on the first day both have a close); null where QQQ has none. */
  baseline: number | null;
}

export interface PriceMarker {
  label: string;
  date: string;
  tone: Milestone["tone"];
  /** Index into `points` of the first trading day on or after `date`. */
  index: number;
}

export interface PriceView {
  points: PricePoint[];
  /** Y domain, padded. */
  min: number;
  max: number;
  /** The day QQQ is rebased on (YYYY-MM-DD), or null without a baseline. */
  rebasedOn: string | null;
  markers: PriceMarker[];
  /** First trading day of each month, thinned to at most `maxTicks`. */
  ticks: { index: number; label: string }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What the share-price chart draws. X is the trading-day index (weekends and holidays take
 * no room, as on any price chart); markers sit on the first trading day on or after their
 * date and only when that date is inside the data's range.
 *
 * data: the collector fetches Alpha Vantage's free `compact` series (the latest 100 trading
 * days) and builds history from there, so at first the range starts in July 2026 and only
 * the launch marker is inside it.
 */
export function priceView(prices: SharePrices, milestones: Milestone[], maxTicks = 7): PriceView {
  const closes = prices.subject.closes;
  const qqq = new Map((prices.baseline?.closes ?? []).map((p) => [p.date, p.close]));
  const base = closes.find((p) => qqq.has(p.date));
  const scale = base ? base.close / qqq.get(base.date)! : null;
  const points: PricePoint[] = closes.map((p) => {
    const q = qqq.get(p.date);
    return { date: p.date, close: p.close, baseline: scale !== null && q !== undefined && p.date >= base!.date ? q * scale : null };
  });

  const values = points.flatMap((p) => (p.baseline === null ? [p.close] : [p.close, p.baseline]));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, hi * 0.01);

  const first = points[0].date;
  const last = points.at(-1)!.date;
  const markers = milestones
    .filter((m) => m.date >= first && m.date <= last)
    .map((m) => ({ label: m.label, date: m.date, tone: m.tone, index: points.findIndex((p) => p.date >= m.date) }));

  const months: { index: number; y: number; mo: number }[] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.date.slice(0, 7) === points[i - 1].date.slice(0, 7)) return;
    const [y, mo] = p.date.split("-").map(Number);
    months.push({ index: i, y, mo });
  });
  // the first month is usually partial: drop its label when the next one is under ~half a
  // month (10 trading days) away, so the two never collide
  if (months.length > 1 && months[1].index - months[0].index < 10) months.shift();
  const step = Math.ceil(months.length / maxTicks);
  // over more than a year every label carries its year ("Dec ’23"); otherwise only the
  // first and January do
  const long = months.length > 13;
  const ticks = months
    .filter((_, i) => i % step === 0)
    .map((m, i) => ({
      index: m.index,
      label: long
        ? `${MONTHS[m.mo - 1]} ’${String(m.y).slice(2)}`
        : i === 0 || m.mo === 1
          ? `${MONTHS[m.mo - 1]} ${m.y}`
          : MONTHS[m.mo - 1],
    }));

  return { points, min: Math.max(0, lo - pad), max: hi + pad, rebasedOn: base?.date ?? null, markers, ticks };
}

/** SVG path for one series in a w x h box; a null value breaks the line. */
export function pricePath(values: (number | null)[], view: Pick<PriceView, "min" | "max">, w: number, h: number): string {
  const n = values.length;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => h - ((v - view.min) / (view.max - view.min || 1)) * h;
  let out = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    out += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return out.trim();
}
