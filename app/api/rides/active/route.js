import { requestCutoff } from "@/lib/rideRules";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { ratingSummary } from "@/lib/ratings";

// Show only a first name, for privacy
const firstName = (name) => (name ? name.split(" ")[0] : null);

// GET /api/rides/active → the logged-in user's current ride (rider or driver)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Drivers are found by driver_id, riders by rider_id
    const mine = user.role === "driver" ? "driver_id" : "rider_id";

    const { data, error } = await supabase
      .from("rides")
      .select(
        "id, status, pickup_address, dropoff_address, distance_km, duration_min, fare, ride_type, created_at, rider_id, driver_id"
      )
      .eq(mine, user.id)
      .in("status", ["requested", "accepted", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;

    if (data.length === 0) {
      return Response.json({ role: user.role, ride: null });
    }

        // A request that no driver answered in time is cancelled, and the rider is told
    if (
      user.role === "rider" &&
      data[0].status === "requested" &&
      Date.parse(data[0].created_at) < Date.parse(requestCutoff())
    ) {
      const { error: expireError } = await supabase
        .from("rides")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", data[0].id)
        .eq("status", "requested");
      if (expireError) throw expireError;

      return Response.json({ role: user.role, ride: null, expired: true });
    }

    // Keep the ids on the server, and send back only what the page needs
    const { rider_id, driver_id, ...ride } = data[0];

    let driver = null;
    let rider = null;

    // A rider sees the driver's first name and vehicle, once a driver has accepted
    if (user.role === "rider" && driver_id) {
      const { data: u } = await supabase
        .from("users").select("name").eq("id", driver_id).maybeSingle();
      const { data: d } = await supabase
        .from("drivers")
        .select("vehicle_model, vehicle_number, rating_sum, rating_count")
        .eq("user_id", driver_id)
        .maybeSingle();
      driver = {
        name: firstName(u?.name),
        vehicle_model: d?.vehicle_model ?? null,
        vehicle_number: d?.vehicle_number ?? null,
        rating: ratingSummary(d?.rating_sum, d?.rating_count),
      };
    }

    // A driver sees the rider's first name
    if (user.role === "driver") {
      const { data: u } = await supabase
        .from("users").select("name").eq("id", rider_id).maybeSingle();
      rider = { name: firstName(u?.name) };
    }

    return Response.json({ role: user.role, ride, driver, rider });
  } catch (err) {
    return fail(err);
  }
}