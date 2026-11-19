import type { ReactNode } from "react";

// The design system's Badge: 11px/700, uppercase, 0.04em tracking, pill, 4x10 padding.
const TONES = {
  neutral: "bg-card-raised text-fg-2",
  success: "bg-emerald text-emerald-ink",
  warning: "bg-warning text-warning-ink",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-pill px-2.5 py-1 text-[11px] leading-[1.4] font-bold tracking-badge uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
