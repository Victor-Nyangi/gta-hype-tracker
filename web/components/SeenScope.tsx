"use client";

import { useInView } from "motion/react";
import { createContext, useContext, useRef, type ReactNode } from "react";

/*
 * "Counters start only once their section has been seen" (design/README.md). A SeenScope
 * marks a block; count-ups inside it wait until it is first in view. Outside any scope
 * they start on mount.
 */
const SeenContext = createContext(true);

export const useSeen = () => useContext(SeenContext);

export function SeenScope({
  children,
  className,
  amount = 0.12,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount });
  return (
    <div ref={ref} className={className}>
      <SeenContext value={seen}>{children}</SeenContext>
    </div>
  );
}
