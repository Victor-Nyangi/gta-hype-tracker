import type { CSSProperties } from "react";

/** The pulsing pink dot: an expanding 12px box-shadow ring over 1.6s (static if reduced motion). */
export function LiveDot({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`inline-block size-2 shrink-0 rounded-full bg-pink animate-pulse-ring ${className}`}
    />
  );
}
