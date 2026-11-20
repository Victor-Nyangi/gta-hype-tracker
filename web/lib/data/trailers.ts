import type { TrailerSeries } from "./types";

/*
 * Trailer views over each trailer's first 30 days. Not a feed: YouTube's API only returns
 * today's total, so a first-30-days curve can only ever be curated, never sampled.
 *
 * data: these are the prototype's curves (design/reference, T1 / T2): day 0 sits at the
 * widely reported day-one figure for Trailer 1 (~93M YouTube views in 24 hours) and the
 * shape between milestones is illustrative. Replace with press-reported day-1 / week-1 /
 * day-30 figures per trailer when they are curated; the card labels them "reported
 * milestones" and says the in-between is not sampled.
 */

/** The prototype's deterministic noise. */
const rnd = (s: number) => {
  const x = Math.sin(s * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

const T1: number[] = Array.from(
  { length: 31 },
  (_, d) => (93 + (57 * Math.log(1 + d)) / Math.log(31) + (rnd(d + 7) - 0.5) * 1.5) * 1e6,
);
const T2: number[] = Array.from(
  { length: 31 },
  (_, d) => (112 + (66 * Math.log(1 + d)) / Math.log(31) + (rnd(d + 70) - 0.5) * 1.5) * 1e6,
);

/** Video ids match the collector's DEFAULT_YOUTUBE_VIDEOS, so live totals join on them. */
export const TRAILERS: TrailerSeries[] = [
  { id: "QdBZY2fkU-0", label: "Trailer 1", color: "violet", viewsByDay: T1 },
  { id: "VQRLujxTm3c", label: "Trailer 2", color: "orange", viewsByDay: T2 },
];
