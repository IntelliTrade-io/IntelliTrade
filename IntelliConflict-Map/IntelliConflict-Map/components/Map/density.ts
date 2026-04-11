export type DensityProfile = {
  filterId: string | null;
  opacityScale: number;
  radiusScale: number;
  tier: "balanced" | "full" | "minimal";
};

export function getDensityProfile(visibleCount: number): DensityProfile {
  if (visibleCount > 200) {
    return {
      filterId: null,
      opacityScale: 0.58,
      radiusScale: 0.72,
      tier: "minimal"
    };
  }

  if (visibleCount > 75) {
    return {
      filterId: "url(#map-density-glow-lite)",
      opacityScale: 0.78,
      radiusScale: 0.88,
      tier: "balanced"
    };
  }

  return {
    filterId: "url(#map-density-glow)",
    opacityScale: 1,
    radiusScale: 1,
    tier: "full"
  };
}
