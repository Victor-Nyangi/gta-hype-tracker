"use client";

import { m } from "motion/react";
import Image from "next/image";
import { useId, useState } from "react";
import type { SteamGame, TwitchSeries } from "@/lib/data";
import { steamPaths } from "@/lib/charts";
import { type CompareGame, compareGames } from "@/lib/compare";
import { comma, fmt } from "@/lib/format";
import { EASE_REVEAL, useReducedMotion } from "@/lib/motion";
import { useCountUp } from "@/lib/use-count-up";
import { useNow } from "@/lib/use-now";
import { Reveal } from "../Reveal";
import { SeenScope } from "../SeenScope";
import { CARD, EYEBROW, Kpi } from "../ui";

const W = 1000;
const H = 260;

function Chips({ games, selected, onPick }: { games: CompareGame[]; selected: string; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Pick a game" className="flex flex-wrap gap-2">
      {games.map((g) => {
        const on = g.id === selected;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            // the visible label comes first so voice control still matches it
            aria-label={g.short === g.name ? undefined : `${g.short} (${g.name})`}
            onClick={() => onPick(g.id)}
            className={`cursor-pointer rounded-pill border px-4 py-2.5 text-[13.5px] font-extrabold transition-all duration-[180ms] ease-reveal ${
              on
                ? "border-transparent bg-[linear-gradient(90deg,var(--color-orange),var(--color-pink))] text-ink"
                : "border-track bg-transparent text-fg-2 hover:border-fg-3 hover:text-fg"
            }`}
          >
            {g.short}
          </button>
        );
      })}
    </div>
  );
}

const LABELS = {
  steam: { now: "in-game now on Steam", ever: "All-time peak", chart: "Steam players" },
  twitch: { now: "watching on Twitch now", ever: "Peak since tracking", chart: "Twitch viewers" },
} as const;

function GameCard({ game }: { game: CompareGame }) {
  const reduced = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const label = LABELS[game.source];
  const now = useCountUp(game.current ?? 0);
  const day = useCountUp(game.peak24h ?? 0);
  const ever = useCountUp(game.allTimePeak ?? 0);
  const { line, area } = steamPaths(game.series24h, W, H);
  // design/README.md: the path morphs over 750ms, cubic-bezier(.22,1,.36,1)
  const morph = { duration: reduced ? 0 : 0.75, ease: EASE_REVEAL };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 text-[13px] font-bold text-fg-2">
            {game.name} · {label.now}
          </h3>
          <p className="m-0 text-[clamp(44px,6vw,68px)] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {game.current === null ? "—" : comma(now)}
          </p>
        </div>
        <dl className="m-0 flex gap-8">
          <Kpi label="24h peak" value={game.peak24h === null ? "—" : fmt(day)} />
          <Kpi label={label.ever} value={game.allTimePeak === null ? "—" : comma(ever)} className="text-orange" />
        </dl>
      </div>
      <div
        role="img"
        aria-label={`Chart: ${game.name} ${label.chart} over the last 24 hours.`}
        className="relative h-[260px]"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block size-full overflow-visible">
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-orange)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--color-orange)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <m.path initial={false} animate={{ d: area }} transition={morph} fill={`url(#${uid})`} />
          <m.path
            initial={false}
            animate={{ d: line }}
            transition={morph}
            fill="none"
            stroke="var(--color-orange)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div aria-hidden="true" className="flex justify-between text-micro font-bold text-fg-3">
        <span>24h ago</span>
        <span>18h</span>
        <span>12h</span>
        <span>6h</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function Cover({ game }: { game: CompareGame }) {
  if (game.cover) {
    return (
      <Image
        key={game.id}
        src={game.cover.src}
        alt={game.cover.alt}
        fill
        sizes="(min-width: 1328px) 411px, (min-width: 752px) 33vw, 100vw"
        className="object-cover"
        style={{ objectPosition: game.cover.position }}
      />
    );
  }
  // No art for this game yet: its name on a quiet sunset wash instead of an empty slot.
  return (
    <div className="flex size-full flex-col justify-end gap-2 bg-[radial-gradient(120%_90%_at_100%_0%,oklch(0.7_0.21_350/0.22),transparent_60%),radial-gradient(100%_80%_at_0%_100%,oklch(0.78_0.16_55/0.14),transparent_60%)] bg-card p-7">
      <span className={`${EYEBROW} text-fg-3`}>No cover art yet</span>
      <span className="font-display text-[clamp(32px,4vw,48px)] leading-[0.92] font-black tracking-[-0.01em] [font-stretch:68%]">
        {game.name}
      </span>
    </div>
  );
}

function PeakRow({
  game,
  max,
  on,
  onPick,
}: {
  game: SteamGame;
  max: number;
  on: boolean;
  onPick: () => void;
}) {
  const width = useCountUp(game.allTimePeak === null ? 0 : (game.allTimePeak / max) * 100);
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onPick}
        className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-0 bg-transparent p-0 text-left sm:grid-cols-[minmax(120px,200px)_1fr_90px] sm:gap-y-0"
      >
        <span className={`text-sm font-bold transition-colors ${on ? "text-fg" : "text-fg-3"}`}>{game.name}</span>
        <span
          aria-hidden="true"
          className="col-span-2 row-start-2 h-3 overflow-hidden rounded-pill bg-card-raised sm:col-span-1 sm:col-start-2 sm:row-start-1"
        >
          <span
            className={`block h-full rounded-pill transition-[background] duration-300 ${
              on ? "bg-[linear-gradient(90deg,var(--color-orange),var(--color-pink))]" : "bg-track"
            }`}
            style={{ width: `${width.toFixed(1)}%` }}
          />
        </span>
        <span className="col-start-2 row-start-1 text-right text-sm font-bold text-fg-2 tabular-nums sm:col-start-3">
          {game.allTimePeak === null ? "—" : fmt(game.allTimePeak)}
        </span>
      </button>
    </li>
  );
}

/**
 * Compare (design/README.md §3): chips, the selected game's card and cover, all-time peaks.
 * GTA VI leads and is selected by default; it is not on Steam, so its card shows the
 * Signals section's Twitch viewers. The all-time list stays Steam-only.
 */
export function Compare({ steam, twitch }: { steam: SteamGame[]; twitch: TwitchSeries }) {
  const games = compareGames(steam, twitch, useNow());
  const [selected, setSelected] = useState(games[0].id);
  const game = games.find((g) => g.id === selected) ?? games[0];
  const maxPeak = Math.max(...steam.map((g) => g.allTimePeak ?? 0));
  const byPeak = [...steam].sort((a, b) => (b.allTimePeak ?? -1) - (a.allTimePeak ?? -1));

  return (
    <section id="compare" aria-labelledby="compare-title">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-6 py-24">
        <Reveal className="flex flex-col gap-2">
          <p className={`m-0 ${EYEBROW} text-orange`}>Compare</p>
          <h2
            id="compare-title"
            className="m-0 font-display text-[clamp(40px,6vw,72px)] leading-none font-extrabold tracking-[-0.03em] [font-stretch:72%]"
          >
            Who else is still playing?
          </h2>
          <p className="m-0 max-w-[60ch] text-[15px] text-fg-2">
            Pick a title to see who&rsquo;s on it right now, and over the last 24 hours.
          </p>
        </Reveal>

        <Reveal className="flex flex-col gap-3">
          <Chips games={games} selected={game.id} onPick={setSelected} />
          <p className="m-0 text-[13px] text-fg-3">GTA VI isn&rsquo;t on Steam (it&rsquo;s console-only), so it shows Twitch viewers.</p>
        </Reveal>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6">
          <Reveal className={`${CARD} min-w-0 min-[752px]:col-span-2`}>
            <SeenScope>
              <GameCard game={game} />
            </SeenScope>
          </Reveal>
          <Reveal index={1} className="relative min-h-[340px] overflow-hidden rounded-card border border-border">
            <Cover game={game} />
          </Reveal>
        </div>

        <Reveal className={`${CARD} flex flex-col gap-3.5`}>
          <h3 className="m-0 text-[13px] font-bold text-fg-2">All-time Steam peaks</h3>
          <SeenScope>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {byPeak.map((g) => (
                <PeakRow
                  key={g.id}
                  game={g}
                  max={maxPeak}
                  on={g.id === game.id}
                  onPick={() => setSelected(g.id)}
                />
              ))}
            </ul>
          </SeenScope>
        </Reveal>
      </div>
    </section>
  );
}
