"use client";

import { useState, type ReactNode } from "react";
import type { LanguageViews, Origin } from "@/lib/data";
import { fmt, formatDay } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { Freshness } from "../live/Freshness";

function LanguageRow({
  lang,
  max,
  active,
  onEnter,
  onLeave,
}: {
  lang: LanguageViews;
  max: number;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const views = useCountUp(lang.views);
  const width = useCountUp((lang.views / max) * 100);
  return (
    <li
      tabIndex={0}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={`grid grid-cols-[92px_1fr_56px] items-center gap-3 rounded-button px-2 py-1.5 transition-colors duration-[120ms] ${
        active ? "bg-card-raised" : ""
      }`}
    >
      <span className="text-[13px] font-bold">{lang.name}</span>
      <span aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-card-raised">
        <span
          className="block h-full rounded-pill bg-[linear-gradient(90deg,var(--color-violet),var(--color-pink))]"
          style={{ width: `${width.toFixed(1)}%` }}
        />
      </span>
      <span className="text-right text-[13px] font-bold text-fg-2 tabular-nums">{fmt(views)}</span>
    </li>
  );
}

/**
 * Wikipedia views by language (design/README.md §2): the map (a server-rendered
 * <WorldMap>, passed in) and the top-12 list. Hovering or focusing a language sets
 * data-hover, which turns its countries orange and dims the rest in CSS.
 */
export function LanguageMap({
  map,
  languages,
  origin,
  updatedAt,
  windowEnd,
}: {
  map: ReactNode;
  languages: LanguageViews[];
  origin: Origin;
  updatedAt: string;
  /** Last day of the 7-day window (YYYY-MM-DD); Wikimedia publishes a day behind. */
  windowEnd: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...languages.map((l) => l.views));

  return (
    <div data-hover={hover ?? undefined} className="grid items-center gap-8 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 text-[13px] font-bold text-fg-2">
            Wikipedia pageviews by language · 7 days to {formatDay(windowEnd, "short").replace(/, \d{4}$/, "")}
          </h3>
          <p className="m-0 text-sm text-fg-3">
            Each language edition is mapped to where it is mostly read. Hover a language.
          </p>
          <Freshness origin={origin} updatedAt={updatedAt} />
        </div>
        {map}
      </div>
      <ol aria-label="Views by language, last 7 days" className="m-0 flex min-w-0 list-none flex-col gap-1 p-0">
        {languages.slice(0, 12).map((l) => (
          <LanguageRow
            key={l.code}
            lang={l}
            max={max}
            active={hover === l.code}
            onEnter={() => setHover(l.code)}
            onLeave={() => setHover((h) => (h === l.code ? null : h))}
          />
        ))}
      </ol>
    </div>
  );
}
