import { Badge } from "./Badge";
import { ParallaxImage, ParallaxText } from "./HeroParallax";
import { ClockCaption, LaunchBadge, LaunchClockBoxes } from "./HeroLive";
import { KeyArt } from "./KeyArt";

/**
 * Launch hero (design/README.md §1 "Hero"): key art on the right, text on the left,
 * a PlayStation-style scrim, and a soft-light sunset layer drifting over it.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative flex min-h-[clamp(560px,80vh,860px)] items-end overflow-hidden"
    >
      {/* key art; the scroll parallax zooms from 70% 40% */}
      <ParallaxImage className="absolute inset-0 origin-[70%_40%] will-change-transform">
        <KeyArt />
      </ParallaxImage>

      {/* scrim: on phones a bottom-up fade only, so the portrait crop keeps both faces clear
          (a left-hand gradient there would sit on Lucia); from 768px the side scrim too */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(18,10,20,0)_36%,rgba(18,10,20,0.72)_50%,rgba(18,10,20,0.9)_62%,#120a14_86%)] md:bg-[linear-gradient(90deg,#120a14_0%,rgba(18,10,20,0.88)_26%,rgba(18,10,20,0.3)_56%,rgba(18,10,20,0)_78%),linear-gradient(180deg,rgba(18,10,20,0)_50%,#120a14_98%)]"
      />

      {/* sunset overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-(image:--gradient-hero-overlay) bg-size-[300%_300%] opacity-40 mix-blend-soft-light animate-sunset-slow"
      />

      <ParallaxText className="relative mx-auto flex w-full max-w-content flex-col gap-7 px-6 pt-12 pb-16 will-change-transform">
        <div data-enter style={{ "--i": 0 } as React.CSSProperties} className="flex flex-wrap gap-2">
          <LaunchBadge />
          <Badge>PS5 · Xbox Series X|S</Badge>
        </div>

        <h1
          id="hero-title"
          data-enter
          style={{ "--i": 1 } as React.CSSProperties}
          className="m-0 max-w-[8ch] font-display text-[clamp(52px,7.5vw,116px)] leading-[0.88] font-black tracking-[-0.01em] [font-stretch:68%]"
        >
          <span>Miami,</span>{" "}
          <span className="block bg-(image:--gradient-hero-line) bg-size-[200%_100%] bg-clip-text pb-[0.08em] text-transparent animate-sunset-text">
            here we come.
          </span>
        </h1>

        <div data-enter style={{ "--i": 2 } as React.CSSProperties}>
          <LaunchClockBoxes />
        </div>

        <div data-enter style={{ "--i": 3 } as React.CSSProperties}>
          <ClockCaption />
        </div>
      </ParallaxText>
    </section>
  );
}
