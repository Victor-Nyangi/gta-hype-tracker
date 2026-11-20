"use client";

import { m, type Variants } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { EASE_ENTRANCE, EASE_REVEAL } from "@/lib/motion";

/*
 * Section entrance (design/README.md "Interactions & motion"): whileInView, once, ~12%
 * visible; opacity 0, y 80, scale .96, clipPath inset(100% 0 0 0) -> rest; 1200ms
 * cubic-bezier(.16,1,.3,1); siblings staggered by 110ms, up to 8.
 *
 * The resting hidden state is opacity only: Chrome's IntersectionObserver applies the
 * target's own clip-path, so an element parked at inset(100% 0 0 0) never reaches 12%
 * visible. The clip, offset and scale run as keyframes once the element is in view (as
 * the prototype does with WAAPI).
 *
 * Motion server-renders the hidden state inline. globals.css overrides it (!important)
 * when JS is off (no `.js` class), under prefers-reduced-motion and in print, so content
 * is always visible there.
 */
const ENTER: Variants = {
  hidden: { opacity: 0 },
  show: (i: number) => ({
    opacity: [0, 1],
    y: [80, 0],
    scale: [0.96, 1],
    clipPath: ["inset(100% 0% 0% 0%)", "inset(0% 0% 0% 0%)"],
    transition: { duration: 1.2, ease: EASE_ENTRANCE, delay: Math.min(i, 8) * 0.11 },
  }),
};

type RevealProps = {
  children: ReactNode;
  /** Position among siblings that enter together; sets the 110ms stagger. */
  index?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "li" | "section";
  id?: string;
};

export function Reveal({ children, index = 0, className, style, as = "div", id }: RevealProps) {
  const Tag = as === "li" ? m.li : as === "section" ? m.section : m.div;
  return (
    <Tag
      data-reveal=""
      id={id}
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.12 }}
      custom={index}
      variants={ENTER}
      inherit={false}
    >
      {children}
    </Tag>
  );
}

/*
 * Chart reveal (design/README.md): clipPath inset(0 100% 0 0) -> inset(0), 1800ms, 200ms
 * delay, cubic-bezier(.22,1,.36,1), once its box is ~20% visible (the prototype's value).
 * Hidden by opacity until then, for the same IntersectionObserver reason as above.
 */
const wipe = (from: string): Variants => ({
  wipeHidden: { opacity: 0 },
  wipeShow: {
    opacity: 1,
    clipPath: [from, "inset(0% 0% 0% 0%)"],
    transition: {
      clipPath: { duration: 1.8, delay: 0.2, ease: EASE_REVEAL },
      opacity: { duration: 0, delay: 0.2 },
    },
  },
});
const WIPE_X = wipe("inset(0% 100% 0% 0%)");
/** Top to bottom, for the phone timeline's vertical track. */
const WIPE_Y = wipe("inset(0% 0% 100% 0%)");

export function ChartReveal({
  children,
  className,
  axis = "x",
}: {
  children?: ReactNode;
  className?: string;
  axis?: "x" | "y";
}) {
  return (
    <m.div
      data-reveal=""
      aria-hidden={children ? undefined : true}
      className={className}
      initial="wipeHidden"
      whileInView="wipeShow"
      viewport={{ once: true, amount: 0.2 }}
      variants={axis === "x" ? WIPE_X : WIPE_Y}
      inherit={false}
    >
      {children}
    </m.div>
  );
}
