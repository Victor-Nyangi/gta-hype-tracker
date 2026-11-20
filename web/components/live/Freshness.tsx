"use client";

import type { Origin } from "@/lib/data/types";
import { ago, utcStamp } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/**
 * A card's data age: "Updated 3 min ago" (live), or "Last known · 05:25 UTC, Nov 20" when
 * the card is showing the fallback snapshot or the last refresh failed. The server (and a
 * no-JS visit) prints the absolute time, since it cannot know when the page is read.
 *
 * `pending` (the browser's first refresh is in flight) shows a skeleton in place of the
 * label only; the numbers on the card stay as rendered.
 */
export function Freshness({
  origin,
  updatedAt,
  pending = false,
  className = "",
}: {
  origin: Origin;
  updatedAt: string;
  pending?: boolean;
  className?: string;
}) {
  const now = useNow();
  const base = `m-0 inline-flex items-center gap-1.5 text-micro font-bold tracking-[0.04em] ${className}`;

  if (pending) {
    return (
      <p className={base} role="status">
        <span aria-hidden="true" className="h-3 w-24 animate-pulse rounded-pill bg-card-raised" />
        <span className="sr-only">Refreshing</span>
      </p>
    );
  }
  if (origin === "fallback") {
    return (
      <p className={`${base} text-warning`}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
        Last known · {utcStamp(updatedAt)}
      </p>
    );
  }
  return (
    <p className={`${base} text-fg-3`}>
      <time dateTime={updatedAt} title={utcStamp(updatedAt)}>
        Updated {now === null ? utcStamp(updatedAt) : ago(now - Date.parse(updatedAt))}
      </time>
    </p>
  );
}
