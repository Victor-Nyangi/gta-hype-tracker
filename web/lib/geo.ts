import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
// world-atlas@2.0.2 countries-110m (Natural Earth, public domain; ISC packaging), vendored
// so nothing is fetched from a CDN. Projected here, on the server, at build time.
import world from "@/public/geo/countries-110m.json";

export interface CountryPath {
  /** ISO 3166-1 numeric */
  id: number;
  d: string;
}

export const MAP_W = 960;
export const MAP_H = 470;

const ANTARCTICA = "010";

/** Country outlines in the Natural Earth projection, fitted to 960x470, Antarctica removed. */
export function countryPaths(): CountryPath[] {
  const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const all = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const fc: FeatureCollection<Geometry, { name: string }> = {
    type: "FeatureCollection",
    features: all.features.filter((f) => String(f.id) !== ANTARCTICA),
  };
  const path = geoPath(geoNaturalEarth1().fitSize([MAP_W, MAP_H], fc)).digits(0);
  return fc.features
    .map((f) => ({ id: Number(f.id), d: path(f) ?? "" }))
    .filter((c) => c.d && Number.isFinite(c.id));
}
