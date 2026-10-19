
import { describe, it, expect } from "vitest";
import { distanceKm, MATCH_RADIUS_KM } from "@/lib/geo";

const SHIVAJINAGAR = { lat: 18.5308, lng: 73.8475 };
const HINJEWADI = { lat: 18.5912, lng: 73.7389 };

describe("distanceKm", () => {
  it("is zero between a point and itself", () => {
    expect(distanceKm(SHIVAJINAGAR, SHIVAJINAGAR)).toBeCloseTo(0, 5);
  });

  it("gives a sensible straight-line distance across Pune", () => {
    // Roughly 13 km in a straight line
    const km = distanceKm(SHIVAJINAGAR, HINJEWADI);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(15);
  });

  it("is the same in both directions", () => {
    expect(distanceKm(SHIVAJINAGAR, HINJEWADI)).toBeCloseTo(
      distanceKm(HINJEWADI, SHIVAJINAGAR),
      8
    );
  });
});

describe("the nearby-driver rule", () => {
  it("counts a point about 1 km away as nearby", () => {
    // 0.01 degrees of latitude is about 1.1 km
    const near = { lat: SHIVAJINAGAR.lat + 0.01, lng: SHIVAJINAGAR.lng };
    expect(distanceKm(SHIVAJINAGAR, near)).toBeLessThanOrEqual(MATCH_RADIUS_KM);
  });

  it("counts a point across the city as too far", () => {
    expect(distanceKm(SHIVAJINAGAR, HINJEWADI)).toBeGreaterThan(MATCH_RADIUS_KM);
  });
});