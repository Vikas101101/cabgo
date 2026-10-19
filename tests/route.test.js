import { describe, it, expect } from "vitest";
import { isValidPoint } from "@/lib/route";

describe("isValidPoint", () => {
  it("accepts a normal latitude and longitude", () => {
    expect(isValidPoint({ lat: 18.52, lng: 73.85 })).toBe(true);
  });

  it("accepts the edge values", () => {
    expect(isValidPoint({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidPoint({ lat: -90, lng: -180 })).toBe(true);
  });

  it("rejects missing values", () => {
    expect(isValidPoint(null)).toBeFalsy();
    expect(isValidPoint(undefined)).toBeFalsy();
    expect(isValidPoint({})).toBeFalsy();
    expect(isValidPoint({ lat: 18.5 })).toBeFalsy();
  });

  it("rejects numbers sent as text", () => {
    expect(isValidPoint({ lat: "18.5", lng: "73.8" })).toBeFalsy();
  });

  it("rejects out-of-range coordinates", () => {
    expect(isValidPoint({ lat: 91, lng: 73.8 })).toBeFalsy();
    expect(isValidPoint({ lat: 18.5, lng: 181 })).toBeFalsy();
  });
});