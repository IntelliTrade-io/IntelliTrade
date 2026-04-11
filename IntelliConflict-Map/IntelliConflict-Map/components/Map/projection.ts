import {
  geoEqualEarth,
  geoGraticule10,
  geoPath,
  type GeoPath,
  type GeoProjection
} from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon
} from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import worldTopologySource from "@/data/world.topo.json";

type CountryProperties = {
  name?: string;
};

type WorldTopologyObjects = {
  countries: GeometryCollection<CountryProperties>;
  land: GeometryCollection;
};

const WORLD_TOPOLOGY = worldTopologySource as Topology<WorldTopologyObjects>;

export const WORLD_COUNTRIES = (
  feature(
    WORLD_TOPOLOGY,
    WORLD_TOPOLOGY.objects.countries
  ) as FeatureCollection<Polygon | MultiPolygon, CountryProperties>
).features;

export const WORLD_LAND = feature(
  WORLD_TOPOLOGY,
  WORLD_TOPOLOGY.objects.land
) as unknown as Feature<Polygon | MultiPolygon>;

export const WORLD_BORDERS = mesh(
  WORLD_TOPOLOGY,
  WORLD_TOPOLOGY.objects.countries,
  (left, right) => left !== right
);

export const WORLD_GRATICULE = geoGraticule10();

export function createWorldProjection(width: number, height: number) {
  const projection = geoEqualEarth();
  projection.fitExtent(
    [
      [32, 32],
      [Math.max(64, width - 32), Math.max(64, height - 32)]
    ],
    { type: "Sphere" }
  );

  return projection;
}

export function createProjectedPath(projection: GeoProjection): GeoPath {
  return geoPath(projection);
}

export function createViewportExtent(width: number, height: number) {
  return [
    [-width * 0.45, -height * 0.45],
    [width * 1.45, height * 1.45]
  ] as [[number, number], [number, number]];
}

export function projectCoordinates(
  projection: GeoProjection,
  coordinates: [number, number]
) {
  const point = projection(coordinates);

  if (!point) {
    return null;
  }

  return {
    x: point[0],
    y: point[1]
  };
}
