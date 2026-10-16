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

  const res = await fetch(url, {
    headers: { "User-Agent": "CabGo-learning-project/1.0" }, // identifies our app
    signal: AbortSignal.timeout(10000), // give up after 10 seconds
  });
  if (!res.ok) throw new Error("Routing service is busy. Try again.");

  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    const err = new Error("No driving route found between these places.");
    err.status = 422;
    throw err;
  }

  const r = data.routes[0];
  return {
    distanceKm: Math.round(r.distance / 10) / 100, // metres -> km, 2 decimals
    durationMin: Math.round(r.duration / 6) / 10, // seconds -> minutes, 1 decimal
    // OSRM gives [lng, lat]. Leaflet wants [lat, lng], so we swap each pair.
    path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}