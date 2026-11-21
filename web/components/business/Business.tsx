"use client";

import type { OfficialFigure, ReviewEstimate, Sourced, SteamReviews } from "@/lib/data";
import { asOfLabel, comma, figureLabel, fmt, inScale, rangeLabel } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { CardBoundary, Unavailable } from "../live/CardBoundary";
import { Freshness } from "../live/Freshness";
import { useLive } from "../live/LiveSignals";
import { Reveal } from "../Reveal";
import { SeenScope } from "../SeenScope";
import { CARD, EYEBROW } from "../ui";
import { SharePriceChart } from "./SharePrices";

const TILE_COLORS = ["text-violet", "text-pink", "text-orange", "text-teal"] as const;
const QUALIFIER = { nearly: "Nearly", over: "Over" } as const;

function FigureTile({ figure, index }: { figure: OfficialFigure; index: number }) {
  const value = useCountUp(figure.value);
  const valueMax = useCountUp(figure.valueMax ?? 0);
  const label = figureLabel(figure, { value, valueMax: figure.valueMax === null ? null : valueMax });
  return (
    <Reveal
      as="li"
      index={index}
      className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-card p-6 shadow-sm"
    >
      <span className="text-[13px] font-bold text-fg-2">{figure.label}</span>
      <span className="flex flex-col gap-0.5">
        {figure.qualifier && <span className={`${EYEBROW} text-fg-3`}>{QUALIFIER[figure.qualifier]}</span>}
        <span
          className={`text-[52px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${TILE_COLORS[index % TILE_COLORS.length]}`}
        >
          {label}
          <span className="sr-only">{figure.unit === "units" ? " units" : ""}</span>
        </span>
      </span>
      <blockquote className="m-0 text-[13px] text-fg-3">&ldquo;{figure.quote}&rdquo;</blockquote>
      <a href={figure.sourceUrl} className="mt-auto text-micro font-bold tracking-[0.04em]">
        {figure.sourceTitle} · {asOfLabel(figure.asOf)}
      </a>
    </Reveal>
  );
}

function OfficialFigures({ official, pending }: { official: Sourced<OfficialFigure[]>; pending: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="m-0 text-[13px] font-bold text-fg-2">Reported by Take-Two</h3>
        <Freshness origin={official.origin} updatedAt={official.updatedAt} pending={pending} />
      </div>
      <SeenScope>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4 p-0">
          {official.data.map((f, i) => (
            <FigureTile key={f.key} figure={f} index={i} />
          ))}
        </ul>
      </SeenScope>
      <p className="m-0 text-micro text-fg-3">
        Take-Two&rsquo;s own figures, each linked to where it says so. GTA VI sales join them once Take-Two
        reports any.
      </p>
    </div>
  );
}

function EstimateRow({ game, max }: { game: ReviewEstimate; max: number }) {
  const low = useCountUp(game.estimate?.low ?? 0);
  const high = useCountUp(game.estimate?.high ?? 0);
  const left = (low / max) * 100;
  const width = Math.max(0, ((high - low) / max) * 100);
  const week = game.newReviews7d === null ? "" : ` · ${comma(game.newReviews7d)} in the last 7 days`;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(140px,220px)_1fr_100px] sm:gap-y-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold text-fg">{game.name}</span>
        <span className="text-micro text-fg-3">
          {fmt(game.totalReviews)} reviews{week}
        </span>
      </span>
      {game.estimate ? (
        <span
          aria-hidden="true"
          className="relative col-span-2 row-start-2 h-3 overflow-hidden rounded-pill bg-card-raised sm:col-span-1 sm:col-start-2 sm:row-start-1"
        >
          <span
            className="absolute inset-y-0 block rounded-pill bg-[linear-gradient(90deg,var(--color-orange),var(--color-pink))]"
            style={{ left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` }}
          />
        </span>
      ) : (
        <span className="col-span-2 row-start-2 text-micro text-fg-3 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          No estimate. {game.noEstimateReason}
        </span>
      )}
      <span className="col-start-2 row-start-1 text-right text-sm font-bold text-fg-2 tabular-nums sm:col-start-3">
        {game.estimate ? (
          <>
            {rangeLabel(low, high, game.estimate.high)}
            <span className="sr-only"> estimated copies sold on Steam</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">no estimate</span>
          </>
        )}
      </span>
    </li>
  );
}

function ReviewEstimates({ reviews, pending }: { reviews: Sourced<SteamReviews>; pending: boolean }) {
  const { games, method } = reviews.data;
  const max = Math.max(1, ...games.map((g) => g.estimate?.high ?? 0));
  const ranked = [...games].sort((a, b) => (b.estimate?.high ?? -1) - (a.estimate?.high ?? -1));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[13px] font-bold text-fg-2">
          Copies sold on Steam, <abbr title={method.name}>estimated</abbr> from reviews
        </h3>
        <Freshness origin={reviews.origin} updatedAt={reviews.updatedAt} pending={pending} />
      </div>
      <div aria-hidden="true" className="hidden justify-between text-micro font-bold text-fg-3 sm:flex sm:pl-[calc(220px+16px)] sm:pr-[calc(100px+16px)]">
        <span>0</span>
        <span>{inScale(max)}</span>
      </div>
      <SeenScope>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {ranked.map((g) => (
            <EstimateRow key={g.id} game={g} max={max} />
          ))}
        </ul>
      </SeenScope>
      <p className="m-0 text-micro text-fg-3">
        An estimate, not a sales figure: all-time Steam reviews &times; {method.low} to &times; {method.high}{" "}
        (the &ldquo;Boxleiter method&rdquo;; multiples from{" "}
        <a href={method.sources[0]}>Jake Birkett, 2018</a>
        {method.sources[1] && (
          <>
            {" "}
            and <a href={method.sources[1]}>VG Insights, 2021</a>
          </>
        )}
        ). Steam only, so console copies are not in it, and GTA VI, which isn&rsquo;t on Steam, isn&rsquo;t
        here at all.
      </p>
    </div>
  );
}

/**
 * Follow the money: Take-Two's share price against the market (Alpha Vantage daily closes,
 * via the collector), Take-Two's reported figures (curated in the collector, each with its
 * source) and estimated Steam sales from review counts. Each part is hidden on its own when
 * signals.json has no usable copy of it, live or in the fallback; the whole section when
 * none has.
 *
 * data: the price chart only appears once the collector has written `business.prices`; the
 * bundled fallback carries real data only, never a sample.
 */
export function Business() {
  const { data, pending } = useLive();
  const { official, reviews, prices } = data;
  if (!official && !reviews && !prices) return null;
  return (
    <section id="business" aria-labelledby="business-title" className="bg-band">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-6 py-24">
        <Reveal className="flex flex-col gap-2">
          <p className={`m-0 ${EYEBROW} text-teal`}>Business</p>
          <h2
            id="business-title"
            className="m-0 font-display text-[clamp(40px,6vw,72px)] leading-none font-extrabold tracking-[-0.03em] [font-stretch:72%]"
          >
            Follow the money.
          </h2>
          <p className="m-0 max-w-[60ch] text-[15px] text-fg-2">
            {prices ? "How Take-Two’s shares moved, what" : "What"} Take-Two has reported, and a rough read on
            everyone else&rsquo;s sales from their Steam reviews.
          </p>
        </Reveal>

        {prices && (
          <Reveal className={CARD}>
            <CardBoundary name="Take-Two share price">
              <SharePriceChart prices={prices} pending={pending} />
            </CardBoundary>
          </Reveal>
        )}

        <CardBoundary name="Reported by Take-Two">
          {official ? <OfficialFigures official={official} pending={pending} /> : <Unavailable name="Reported by Take-Two" />}
        </CardBoundary>

        <Reveal className={CARD}>
          <CardBoundary name="Estimated Steam sales">
            {reviews ? <ReviewEstimates reviews={reviews} pending={pending} /> : <Unavailable name="Estimated Steam sales" />}
          </CardBoundary>
        </Reveal>
      </div>
    </section>
  );
}
