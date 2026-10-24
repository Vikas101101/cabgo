import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { distanceKm, MATCH_RADIUS_KM } from "@/lib/geo";

// GET /api/rides/available → open ride requests near the logged-in driver
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "driver") {
      return Response.json({ error: "Only drivers can do this" }, { status: 403 });
    }

    // Where is the driver, and are they online?
    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("is_online, current_lat, current_lng")
      .eq("user_id", user.id)
      .maybeSingle();
    if (driverError) throw driverError;

    // Offline or no location: nothing to show
    if (!driver?.is_online || driver.current_lat === null || driver.current_lng === null) {
      return Response.json({ rides: [] });
    }

    // All open requests. We choose the columns, so the rider's identity isn't sent.
    const { data, error } = await supabase
      .from("rides")
      .select(
        "id, pickup_address, pickup_lat, pickup_lng, dropoff_address, distance_km, duration_min, fare, ride_type, created_at"
      )
      .eq("status", "requested")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const here = { lat: driver.current_lat, lng: driver.current_lng };

    const rides = data
      .map((ride) => ({
        ...ride,
        pickup_distance_km:
          Math.round(distanceKm(here, { lat: ride.pickup_lat, lng: ride.pickup_lng }) * 10) / 10,
      }))
      .filter((ride) => ride.pickup_distance_km <= MATCH_RADIUS_KM)
      .sort((a, b) => a.pickup_distance_km - b.pickup_distance_km);

    return Response.json({ rides });
  } catch (err) {
    return fail(err);
  }
}