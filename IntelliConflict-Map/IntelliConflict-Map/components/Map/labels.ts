import type { GeoProjection } from "d3-geo";

const STRATEGIC_LABELS = [
  { coordinates: [-101, 45], label: "North America" },
  { coordinates: [-58, -14], label: "South America" },
  { coordinates: [17, 53], label: "Europe" },
  { coordinates: [24, 6], label: "Africa" },
  { coordinates: [45, 30], label: "Middle East" },
  { coordinates: [78, 23], label: "India" },
  { coordinates: [104, 35], label: "China" },
  { coordinates: [134, -25], label: "Australia" }
] as const;

export function projectStrategicLabels(projection: GeoProjection) {
  return STRATEGIC_LABELS.flatMap((label) => {
    const projected = projection(label.coordinates as [number, number]);

    if (!projected) {
      return [];
    }

    return [
      {
        ...label,
        x: projected[0],
        y: projected[1]
      }
    ];
  });
}
