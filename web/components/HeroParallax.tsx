"use client";

import { m, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/*
 * Hero parallax (design/README.md "Interactions & motion"), p = scrollY / vh in 0..1:
 *   image: translateY(p*18%) scale(1 + p*.18), brightness(1 - p*.55)
 *   text:  translateY(-scrollY*.3), opacity 1 - scrollY / (.75vh)
 * Every transform is the identity at scrollY = 0 (and so on the server), and stays there
 * under reduced motion.
 */
const vh = () => (typeof window === "undefined" ? 1 : window.innerHeight || 1);
const scrolled = (y: number) => (prefersReducedMotion() ? 0 : y);

export function ParallaxImage({ children, className }: { children: ReactNode; className?: string }) {
  const { scrollY } = useScroll();
  const p = useTransform(scrollY, (y) => Math.min(1, Math.max(0, scrolled(y) / vh())));
  const y = useTransform(p, (v) => `${v * 18}%`);
  const scale = useTransform(p, (v) => 1 + v * 0.18);
  const filter = useTransform(p, (v) => (v === 0 ? "none" : `brightness(${1 - v * 0.55})`));
  return (
    <m.div aria-hidden="true" className={className} style={{ y, scale, filter }}>
      {children}
    </m.div>
  );
}

export function ParallaxText({ children, className }: { children: ReactNode; className?: string }) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, (v) => -scrolled(v) * 0.3);
  const opacity = useTransform(scrollY, (v) => Math.max(0, 1 - scrolled(v) / (0.75 * vh())));
  return (
    <m.div className={className} style={{ y, opacity }}>
      {children}
    </m.div>
  );
}
