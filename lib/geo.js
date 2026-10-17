// Rides must be this close to a driver (in a straight line) to be offered to them.
export const MATCH_RADIUS_KM = 5;

const EARTH_RADIUS_KM = 6371;
const toRad = (degrees) => (degrees * Math.PI) / 180;

// Straight-line distance in km between two points like { lat, lng } (haversine formula)
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}