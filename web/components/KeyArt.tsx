"use client";

import Image, { getImageProps } from "next/image";
import { useState } from "react";
import { preload } from "react-dom";

// The handoff's hero-gif.webp was a 1200px copy and looked soft full-bleed.
const WIDE = "/assets/hero-key-art.jpg"; // 3560 x 1424
// Phones: a 900 x 1424 crop of the wide art (x 1800-2700, both characters, full height).
// A ~390 x 675 hero would otherwise show a 1690px-wide render of the wide art, i.e. an
// upscaled slice of whatever 828px rendition `sizes="100vw"` picked.
const NARROW = "/assets/hero-key-art-portrait.jpg";
const FALLBACK = "/assets/gta-full-wide.png"; // 860 x 484
const PHONE = "(max-width: 767px)";
const NOT_PHONE = "(min-width: 768px)";

const common = { alt: "", fill: true, sizes: "100vw", quality: 85 } as const;

/**
 * Full-bleed hero key art (design/README.md: hero-gif.webp, here its full-resolution
 * original, falling back to gta-full-wide.png), art-directed: a <picture> serves the
 * portrait crop below 768px and the wide art above. next/image re-encodes both to
 * AVIF/WebP at quality 85 (allowed in next.config `images.qualities`). It is the LCP
 * element on phones, so each variant is preloaded from <head> for its own media query.
 */
export function KeyArt() {
  const [failed, setFailed] = useState(false);
  const { props: wide } = getImageProps({ ...common, src: WIDE });
  const { props: narrow } = getImageProps({ ...common, src: NARROW });

  for (const [img, media] of [
    [narrow, PHONE],
    [wide, NOT_PHONE],
  ] as const) {
    preload(img.src, { as: "image", imageSrcSet: img.srcSet, imageSizes: img.sizes, media, fetchPriority: "high" });
  }

  if (failed) {
    return <Image src={FALLBACK} alt="" fill sizes="100vw" quality={85} className="object-cover" />;
  }
  return (
    <picture>
      <source media={PHONE} srcSet={narrow.srcSet} sizes={narrow.sizes} />
      <img
        {...wide}
        alt=""
        loading="eager"
        fetchPriority="high"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </picture>
  );
}
