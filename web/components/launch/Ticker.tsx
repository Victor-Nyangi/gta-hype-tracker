"use client";

import { tickerItems } from "@/lib/ticker";
import { useNow } from "@/lib/use-now";
import { CardBoundary } from "../live/CardBoundary";
import { useLive } from "../live/LiveSignals";

function TickerBar() {
  const { data } = useLive();
  const items = tickerItems(data, useNow());

  const run = (hidden: boolean) =>
    items.map((t, i) => (
      <li key={`${hidden}-${i}`} aria-hidden={hidden || undefined} className="inline-flex gap-12">
        {t}
        <span aria-hidden="true">✦</span>
      </li>
    ));

  return (
    <div className="overflow-hidden bg-(image:--gradient-sunset) whitespace-nowrap text-ink">
      <ul
        aria-label="Headline numbers"
        className="m-0 inline-flex list-none gap-12 py-3.5 pl-0 text-[15px] font-extrabold tracking-[0.04em] uppercase animate-marquee motion-reduce:animate-none"
      >
        {run(false)}
        {run(true)}
      </ul>
    </div>
  );
}

/**
 * Ticker (design/README.md §1): a full-width sunset bar whose content is duplicated and
 * scrolls translateX(0 -> -50%) over 38s, linear, forever. Static with reduced motion.
 */
export function Ticker() {
  return (
    <CardBoundary name="Headline numbers">
      <TickerBar />
    </CardBoundary>
  );
}
