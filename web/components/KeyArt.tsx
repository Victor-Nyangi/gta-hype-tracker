"use client";

import Image from "next/image";
import { useState } from "react";

const PRIMARY = { src: "/assets/hero-gif.webp", width: 1200, height: 480 };
const FALLBACK = { src: "/assets/gta-full-wide.png", width: 860, height: 484 };

/**
 * Full-bleed hero key art (design/README.md: hero-gif.webp, falling back to
 * gta-full-wide.png). Served through next/image, which re-encodes to AVIF/WebP. It is the
 * LCP element on phones, so it is preloaded from <head>.
 */
export function KeyArt() {
  const [img, setImg] = useState(PRIMARY);
  return (
    <Image
      src={img.src}
      alt=""
      fill
      sizes="100vw"
      preload
      fetchPriority="high"
      className="object-cover"
      onError={() => setImg((cur) => (cur === FALLBACK ? cur : FALLBACK))}
    />
  );
}
