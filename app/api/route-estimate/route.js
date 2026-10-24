import { auth } from "@clerk/nextjs/server";
import { getRoute, isValidPoint } from "@/lib/route";
import { RIDE_TYPES, calculateFare } from "@/lib/fare";
import { fail, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/rateLimit";

// POST /api/route-estimate → route, distance, time and a fare for each ride type
export async function POST(request) {
  try {
    // Only logged-in users, so strangers can't use our server to call the routing service
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // The booking page asks once each time a place changes, so 30 a minute is plenty
    const limited = await checkRateLimit(`estimate:${userId}`, 30, 60);
    if (limited) return limited;

    const { pickup, dropoff } = await readJson(request);
    if (!isValidPoint(pickup) || !isValidPoint(dropoff)) {
      return Response.json({ error: "Invalid pickup or drop-off location" }, { status: 400 });
    }

    const route = await getRoute(pickup, dropoff);

    // One fare per ride type
    const options = Object.entries(RIDE_TYPES).map(([type, t]) => ({
      type,
      label: t.label,
      fare: calculateFare(type, route.distanceKm, route.durationMin),
    }));

    return Response.json({
      distance_km: route.distanceKm,
      duration_min: route.durationMin,
      path: route.path,
      options,
    });
  } catch (err) {
    return fail(err);
  }
}