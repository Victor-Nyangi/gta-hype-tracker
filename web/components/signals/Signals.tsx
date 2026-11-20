import Image, { getImageProps } from "next/image";
import type { PageData } from "@/lib/data/load";
import { Reveal } from "../Reveal";
import { SeenScope } from "../SeenScope";
import { CARD, EYEBROW } from "../ui";
import { LanguageMap } from "./LanguageMap";
import { MeshHeadline } from "./MeshHeadline";
import { TrailerCard } from "./TrailerCard";
import { TwitchCard } from "./TwitchCard";
import { WorldMap } from "./WorldMap";

// The mesh-headline fill: the key-art PNG (700 KB) through the image optimiser, which
// negotiates AVIF/WebP from the request's Accept header like any <img>.
const meshFill = getImageProps({
  src: "/assets/gta-full-wide.png",
  alt: "",
  width: 860,
  height: 484,
}).props.src;

/** Signals (design/README.md §2): a full-bleed #0C060E band with 96px vertical padding. */
export function Signals({ data }: { data: PageData }) {
  return (
    <section id="signals" aria-labelledby="signals-title" className="bg-band">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-6 py-24">
        <Reveal className="flex flex-col gap-2">
          <p className={`m-0 ${EYEBROW} text-pink`}>Signals</p>
          <MeshHeadline fill={meshFill} />
        </Reveal>

        <Reveal className={CARD}>
          <SeenScope>
            <TwitchCard series={data.twitch} />
          </SeenScope>
        </Reveal>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-6">
          <Reveal className={CARD}>
            <SeenScope>
              <TrailerCard trailers={data.trailers} />
            </SeenScope>
          </Reveal>
          <Reveal index={1} className="relative min-h-[380px] overflow-hidden rounded-card border border-border">
            <Image
              src="/assets/trailer-gif.webp"
              alt="GTA VI key art collage."
              fill
              sizes="(min-width: 1328px) 628px, (min-width: 916px) 50vw, 100vw"
              className="object-cover"
            />
          </Reveal>
        </div>

        <Reveal className={CARD}>
          <SeenScope>
            <LanguageMap map={<WorldMap languages={data.wikipedia} />} languages={data.wikipedia} />
          </SeenScope>
        </Reveal>
      </div>
    </section>
  );
}
