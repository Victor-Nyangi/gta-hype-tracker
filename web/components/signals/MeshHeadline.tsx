"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

const TYPE =
  "m-0 font-display text-[clamp(72px,15vw,240px)] leading-[0.86] font-black tracking-[-0.01em] [font-stretch:68%]";

/**
 * "The whole internet is watching." (design/README.md §2): the key art fills the letters
 * through background-clip:text, over an outline copy offset 6px/6px. With q = 0 -> 1 as
 * the headline crosses the viewport, background-position is `q*100% (25+q*50)%` and
 * background-size `(230 - q*90)% auto`. Frozen at q = 0 under reduced motion.
 *
 * `fill` is the optimised key-art URL (next/image), resolved on the server.
 */
export function MeshHeadline({ fill }: { fill: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  // progress = (vh - top) / (vh + height): 0 when the top enters, 1 when the bottom leaves
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const q = useTransform(scrollYProgress, (v) => (prefersReducedMotion() ? 0 : v));
  const backgroundPosition = useTransform(q, (v) => `${(v * 100).toFixed(1)}% ${(25 + v * 50).toFixed(1)}%`);
  const backgroundSize = useTransform(q, (v) => `${(230 - v * 90).toFixed(0)}% auto`);

  return (
    <div className="relative">
      <p
        aria-hidden="true"
        className={`${TYPE} pointer-events-none absolute inset-0 translate-x-1.5 translate-y-1.5 text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.18)]`}
      >
        The whole
        <br />
        internet is
        <br />
        watching.
      </p>
      <m.h2
        ref={ref}
        id="signals-title"
        style={{ backgroundImage: `url(${fill})`, backgroundPosition, backgroundSize }}
        className={`${TYPE} relative bg-clip-text pb-[0.06em] text-transparent`}
      >
        The whole
        <br />
        internet is
        <br />
        watching.
      </m.h2>
    </div>
  );
}
