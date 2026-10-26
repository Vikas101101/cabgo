import { supabase } from "@/lib/supabase";
import { distanceKm, MATCH_RADIUS_KM } from "@/lib/geo";
import { driverFreshCutoff } from "@/lib/rideRules";
import { notifyUser } from "@/lib/realtime";

// Pings every online driver who is close to a pickup point and was seen recently.
// Best effort: it never throws, so it can never break the booking that called it.
// exceptUserId skips one driver (for example, the one who just gave the ride back).
export async function notifyNearbyDrivers(pickup, { exceptUserId } = {}) {
  try {
    const { data: drivers, error } = await supabase
      .from("drivers")
      .select("user_id, current_lat, current_lng")
      .eq("is_online", true)
      .gte("last_seen_at", driverFreshCutoff())
      .not("current_lat", "is", null)
      .not("current_lng", "is", null)
      .limit(200);
    if (error) throw error;

    const nearby = (drivers ?? []).filter(
      (d) =>
        d.user_id !== exceptUserId &&
        distanceKm({ lat: d.current_lat, lng: d.current_lng }, pickup) <= MATCH_RADIUS_KM
    );

    await Promise.all(nearby.map((d) => notifyUser(d.user_id, "new-request")));
  } catch (err) {
    console.warn("Could not notify drivers:", err.message);
  }
}