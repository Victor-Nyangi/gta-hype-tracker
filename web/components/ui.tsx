import type { ReactNode } from "react";

/** A card (design/README.md: #1D1220, 1px #33223A border, radius 20, 28px padding). */
export const CARD = "rounded-card border border-border bg-card p-7";

/** 11px/700 uppercase eyebrow with 0.06em tracking. */
export const EYEBROW = "text-micro font-bold tracking-eyebrow uppercase";

/**
 * A secondary KPI: eyebrow label over a 28px/800 number, and an optional quiet note under
 * it (when, or what span the number covers). Use inside a <dl>.
 */
export function Kpi({
  label,
  value,
  note,
  className = "",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={`${EYEBROW} text-fg-3`}>{label}</dt>
      <dd className={`m-0 text-[28px] font-extrabold tabular-nums ${className}`}>{value}</dd>
      {note && <dd className="m-0 text-micro font-bold text-fg-3">{note}</dd>}
    </div>
  );
}
