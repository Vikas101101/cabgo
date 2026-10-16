// Our ride types and their prices, in rupees.
// Fare = base + (per km x distance) + (per minute x time), but never below the minimum.
export const RIDE_TYPES = {
  bike: { label: "Bike", base: 20, perKm: 6, perMin: 0.5, minimum: 40 },
  auto: { label: "Auto", base: 30, perKm: 10, perMin: 1, minimum: 60 },
  car: { label: "Car", base: 50, perKm: 14, perMin: 1.5, minimum: 100 },
};

// Returns the fare in whole rupees, or null for an unknown ride type.
export function calculateFare(type, distanceKm, durationMin) {
  const t = RIDE_TYPES[type];
  if (!t) return null;

  const raw = t.base + t.perKm * distanceKm + t.perMin * durationMin;
  return Math.max(t.minimum, Math.round(raw));
}