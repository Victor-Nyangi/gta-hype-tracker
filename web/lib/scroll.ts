"use client";

import { prefersReducedMotion } from "./motion";

/** design/README.md: section links scroll with a 64px offset. */
const SCROLL_OFFSET = 64;

/**
 * Smooth-scroll to a section, below the sticky header. On a phone the header wraps and is
 * taller than 64px, so the offset grows to keep the section's top in view. Returns false
 * when the target is missing, so a plain anchor can do its default jump.
 */
export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const offset = Math.max(SCROLL_OFFSET, (header?.offsetHeight ?? 0) + 10);
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  history.replaceState(null, "", `#${id}`);
  return true;
}
