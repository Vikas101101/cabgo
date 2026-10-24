import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { supabase } from "@/lib/supabase";
import { validateReview } from "@/lib/ratings";
import { notifyUser } from "@/lib/realtime";
import { checkRateLimit } from "@/lib/rateLimit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/reviews → a rider rates the driver of one completed ride
// Body: { "ride_id": "...", "rating": 1-5, "comment": "optional text" }
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "rider") {
      return Response.json({ error: "Only riders can rate drivers" }, { status: 403 });
    }

    const limited = await checkRateLimit(`review:${user.id}`, 10, 600);
    if (limited) return limited;

    // A broken request body gives a clear 400, not a crash
    const body = await readJson(request).catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!UUID.test(String(body.ride_id))) {
      return Response.json({ error: "Invalid ride id" }, { status: 400 });
    }

    const checked = validateReview(body);
    if (checked.error) {
      return Response.json({ error: checked.error }, { status: 400 });
    }

    // The ride must be this rider's, and completed
    const { data: ride, error: rideError } = await supabase
      .from("rides")
      .select("id, rider_id, driver_id, status")
      .eq("id", body.ride_id)
      .maybeSingle();
    if (rideError) throw rideError;

    // The same answer for "doesn't exist" and "not yours"
    if (!ride || ride.rider_id !== user.id) {
      return Response.json({ error: "Ride not found" }, { status: 404 });
    }
    if (ride.status !== "completed") {
      return Response.json({ error: "You can rate a ride once it's completed" }, { status: 409 });
    }
    if (!ride.driver_id) {
      return Response.json({ error: "This ride has no driver to rate" }, { status: 409 });
    }

    // The ids come from the ride in our database, never from the browser
    const { data, error } = await supabase
      .from("reviews")
      .insert({
        ride_id: ride.id,
        rider_id: user.id,
        driver_id: ride.driver_id,
        rating: checked.value.rating,
        comment: checked.value.comment,
      })
      .select("id, rating, comment, created_at")
      .single();

    if (error) {
      // 23505 = the unique rule: this ride already has a review
      if (error.code === "23505") {
        return Response.json({ error: "You've already rated this ride" }, { status: 409 });
      }
      throw error;
    }

    // Tell the driver (best effort)
    await notifyUser(ride.driver_id, "reviewed");

    return Response.json({ review: data }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}