"use client";

import { scrollToSection } from "@/lib/scroll";

// The design system's large Button (14x26 padding, 15px/800, radius 8): primary is
// emerald, secondary orchid. Anchors, so they still jump to the section without JS.
const BASE =
  "inline-flex items-center gap-2 rounded-button border border-transparent px-[26px] py-3.5 text-[15px] font-extrabold transition-colors duration-150";

const go = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (scrollToSection(id)) e.preventDefault();
};

export function LaunchCtas() {
  return (
    <>
      <a
        href="#signals"
        onClick={go("signals")}
        className={`${BASE} bg-emerald text-emerald-ink hover:bg-emerald-hover hover:text-emerald-ink`}
      >
        See the live signals
      </a>
      <a
        href="#compare"
        onClick={go("compare")}
        className={`${BASE} bg-orchid text-[#f3e8ff] hover:bg-violet hover:text-[#f3e8ff]`}
      >
        Compare on Steam
      </a>
    </>
  );
}
