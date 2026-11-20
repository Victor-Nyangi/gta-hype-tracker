import type { CSSProperties } from "react";
import type { LanguageViews } from "@/lib/data";
import { countryPaths, MAP_H, MAP_W } from "@/lib/geo";

const MIX = (pct: number) => `color-mix(in oklch, var(--color-pink) ${Math.round(pct)}%, #2a1a2e)`;

/**
 * The language map's SVG, rendered on the server so its 177 paths never re-render on the
 * client. Fill: `color-mix(in oklch, pink (25 + k*75)%, #2A1A2E)`, k = sqrt(views / max);
 * dimmed while another language is hovered: (12 + k*20)%. See `.lang-map` in globals.css.
 */
export function WorldMap({ languages }: { languages: LanguageViews[] }) {
  const max = Math.max(...languages.map((l) => l.views));
  // data: language -> country is approximate; a country takes the first language listing it.
  const byCountry = new Map<number, LanguageViews>();
  for (const l of languages) for (const c of l.countries) if (!byCountry.has(c)) byCountry.set(c, l);

  const hoverRules = languages
    .map((l) => `[data-hover="${l.code}"] .lang-map path[data-l="${l.code}"]{fill:var(--color-orange)!important}`)
    .join("");

  return (
    <>
      <style>{hoverRules}</style>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        role="img"
        aria-label="World map: countries shaded by Wikipedia views of the GTA VI article in their main language."
        className="lang-map block h-auto w-full"
      >
        {countryPaths().map((c) => {
          const l = byCountry.get(c.id);
          if (!l) return <path key={c.id} d={c.d} />;
          const k = Math.sqrt(l.views / max);
          return (
            <path
              key={c.id}
              d={c.d}
              data-l={l.code}
              style={{ "--f": MIX(25 + k * 75), "--d": MIX(12 + k * 20) } as CSSProperties}
            />
          );
        })}
      </svg>
    </>
  );
}
