"use client";

import type { LanguageViews, TrailerSeries, TwitchSeries } from "@/lib/data";
import { comma, fmt } from "@/lib/format";
import { daysSince } from "@/lib/time";
import { twitchView } from "@/lib/twitch";
import { useNow } from "@/lib/use-now";

/**
 * Ticker (design/README.md §1): a full-width sunset bar whose content is duplicated and
 * scrolls translateX(0 -> -50%) over 38s, linear, forever. Static with reduced motion.
 */
export function Ticker({
  twitch,
  trailers,
  languages,
}: {
  twitch: TwitchSeries;
  trailers: TrailerSeries[];
  languages: LanguageViews[];
}) {
  const now = useNow();
  const tw = twitchView(twitch, now);
  const [t1, t2] = trailers;
  const items = [
    `${fmt(tw.current)} on Twitch right now`,
    `Peak ${fmt(tw.peak)} viewers`,
    `${t2.label}: ${fmt(t2.viewsByDay[0])} views in 24h`,
    `${comma(daysSince("2013-09-17", now))} days since GTA V`,
    `Wikipedia: ${languages.length} languages tracked`,
    "Vice City, Leonida",
    `${fmt(t1.viewsByDay[0])} ${t1.label} views day one`,
    "PS5 · Xbox Series X|S",
  ];

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
