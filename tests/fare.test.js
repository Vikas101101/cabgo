import { describe, it, expect } from "vitest";
import { calculateFare, RIDE_TYPES } from "@/lib/fare";

// describe() groups related tests. it() is one test.
describe("calculateFare", () => {
  it("adds the base, distance and time charges", () => {
    // car: base 50 + (14 per km x 10 km) + (1.5 per min x 20 min) = 220
    expect(calculateFare("car", 10, 20)).toBe(220);
  });

  it("never goes below the minimum fare", () => {
    // A tiny trip would cost about 21, but the bike minimum is 40
    expect(calculateFare("bike", 0.1, 1)).toBe(RIDE_TYPES.bike.minimum);
  });

  it("rounds to whole rupees", () => {
    // auto: 30 + 10 x 3.33 + 1 x 7 = 70.3, which rounds to 70
    expect(calculateFare("auto", 3.33, 7)).toBe(70);
  });

  it("returns null for an unknown ride type", () => {
    expect(calculateFare("helicopter", 10, 10)).toBeNull();
  });

  it("makes bike cheaper than auto, and auto cheaper than car", () => {
    const bike = calculateFare("bike", 10, 20);
    const auto = calculateFare("auto", 10, 20);
    const car = calculateFare("car", 10, 20);
    expect(bike).toBeLessThan(auto);
    expect(auto).toBeLessThan(car);
  });
});