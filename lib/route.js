import { httpError } from "@/lib/http";

// Checks that a point looks like a real latitude/longitude pair.
export function isValidPoint(p) {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    p.lat >= -90 && p.lat <= 90 &&
    p.lng >= -180 && p.lng <= 180
  );
}

// Asks OSRM for the driving route between two points.
export async function getRoute(pickup, dropoff) {
  // OSRM wants longitude first, then latitude
  const coords = `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}`;
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson`;

  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "CabGo-learning-project/1.0" }, // identifies our app
      signal: AbortSignal.timeout(10000), // give up after 10 seconds
    });
  } catch {
    throw httpError(503, "Routing service is busy. Try again.");
  }

  const data = await res.json().catch(() => null);

  // The service says the two places aren't connected by road
  if (data?.code === "NoRoute" || data?.code === "NoSegment") {
    throw httpError(422, "No driving route found between these places.");
  }

  // Anything else unexpected means the service is having trouble
  if (!res.ok || data?.code !== "Ok" || !data.routes?.length) {
    throw httpError(503, "Routing service is busy. Try again.");
  }

  const r = data.routes[0];
  return {
    distanceKm: Math.round(r.distance / 10) / 100, // metres -> km, 2 decimals
    durationMin: Math.round(r.duration / 6) / 10, // seconds -> minutes, 1 decimal
    // OSRM gives [lng, lat]. Leaflet wants [lat, lng], so we swap each pair.
    path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}