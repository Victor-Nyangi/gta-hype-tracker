"use client";

import Image from "next/image";
import { useState } from "react";

// The handoff's hero-gif.webp was a 1200px copy and looked soft full-bleed.
const PRIMARY = { src: "/assets/hero-key-art.jpg", width: 3560, height: 1424 };
const FALLBACK = { src: "/assets/gta-full-wide.png", width: 860, height: 484 };

/**
 * Full-bleed hero key art (design/README.md: hero-gif.webp, here its full-resolution
 * original, falling back to gta-full-wide.png). Served through next/image, which re-encodes
 * to AVIF/WebP at quality 85 (allowed in next.config `images.qualities`). It is the LCP
 * element on phones, so it is preloaded from <head>.
 */
export function KeyArt() {
  const [img, setImg] = useState(PRIMARY);
  return (
    <Image
      src={img.src}
      alt=""
      fill
      sizes="100vw"
      quality={85}
      preload
      fetchPriority="high"
      className="object-cover"
      onError={() => setImg((cur) => (cur === FALLBACK ? cur : FALLBACK))}
    />
  );
}
