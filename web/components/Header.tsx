"use client";

import { useCallback, useEffect, useState } from "react";
import { launchClock, statusLabel } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { LiveDot } from "./LiveDot";

export const SECTIONS = [
  { id: "launch", label: "Launch" },
  { id: "signals", label: "Signals" },
  { id: "compare", label: "Compare" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** design/README.md: tabs scroll to their section with a 64px offset ... */
const SCROLL_OFFSET = 64;
/** ... and the active tab follows the section whose top is <= 160px from the viewport top. */
const SPY_THRESHOLD = 160;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Header() {
  const [active, setActive] = useState<SectionId>("launch");
  const now = useNow();

  useEffect(() => {
    let raf = 0;
    const spy = () => {
      raf = 0;
      let current: SectionId = "launch";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= SPY_THRESHOLD) current = s.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    spy();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Links work as plain anchors without JS (scroll-padding-top keeps the 64px offset);
  // with JS they smooth-scroll. On a phone the header wraps to three rows, taller than
  // 64px, so the offset grows to keep the section's top in view.
  const go = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const offset = Math.max(SCROLL_OFFSET, (header?.offsetHeight ?? 0) + 10);
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
  }, []);

  const clock = now === null ? null : launchClock(now);

  return (
    <header data-site-header className="sticky top-0 z-20 border-b border-border bg-canvas">
      <div className="mx-auto flex max-w-content flex-wrap items-end justify-between gap-6 px-6 pt-3">
        <a href="#launch" onClick={(e) => go(e, "launch")} className="flex items-center gap-3 pb-3 text-fg hover:text-fg">
          <span
            aria-hidden="true"
            className="size-7 rounded-button bg-(image:--gradient-tile) bg-size-[200%_200%] animate-sunset"
          />
          <span className="font-display text-xl font-black [font-stretch:80%]">
            GTA <span className="text-pink">VI</span> Hype Tracker
          </span>
        </a>

        <nav aria-label="Sections" className="flex gap-1 border-b border-border">
          {SECTIONS.map((s) => {
            const isActive = s.id === active;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => go(e, s.id)}
                aria-current={isActive ? "true" : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-bold transition-colors duration-150 ${
                  isActive
                    ? "border-emerald text-fg hover:text-fg"
                    : "border-transparent text-fg-3 hover:text-fg-2"
                }`}
              >
                {s.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 pb-3 text-[13px] font-bold text-fg-2 tabular-nums">
          <LiveDot />
          <span aria-live="off">
            {clock ? statusLabel(clock) : "Live · day – · --:--:--"}
          </span>
        </div>
      </div>
    </header>
  );
}
