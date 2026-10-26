import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/rateLimit";
import { supabase } from "@/lib/supabase";
import { distanceKm, MATCH_RADIUS_KM } from "@/lib/geo";
import { requestCutoff } from "@/lib/rideRules";
import { notifyNearbyDrivers } from "@/lib/matching";
import { notifyUser } from "@/lib/realtime";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/rides/<id> → do something to one ride.
// Body: { "action": "accept" | "start" | "complete" | "cancel" | "release" }
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;

    if (!UUID.test(id)) {
      return Response.json({ error: "Invalid ride id" }, { status: 400 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const { action } = await readJson(request);

    if (action === "accept") return await acceptRide(user, id);
    if (action === "start") return await moveRide(user, id, "accepted", "in_progress", "started");
    if (action === "complete") return await moveRide(user, id, "in_progress", "completed", "completed");
    if (action === "cancel") return await cancelRide(user, id);
    if (action === "release") return await releaseRide(user, id);

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}

// A driver moves THEIR OWN ride from one stage to the next, then pings the rider
async function moveRide(user, id, from, to, pingType) {
  if (user.role !== "driver") {
    return Response.json({ error: "Only drivers can do this" }, { status: 403 });
  }

  // Changes only if the ride is this driver's AND is in the expected stage
  const { data, error } = await supabase
    .from("rides")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("driver_id", user.id)
    .eq("status", from)
    .select("id, status, rider_id");
  if (error) throw error;

  if (data.length === 0) {
    return Response.json({ error: "This ride can't be changed right now" }, { status: 409 });
  }

  await notifyUser(data[0].rider_id, pingType);
  return Response.json({ ride: { id: data[0].id, status: data[0].status } });
}

// A rider cancels THEIR OWN ride before it starts, then pings the driver (if any)
async function cancelRide(user, id) {
  if (user.role !== "rider") {
    return Response.json({ error: "Only riders can cancel rides" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("rides")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("rider_id", user.id)
    .in("status", ["requested", "accepted"])
    .select("id, status, driver_id");
  if (error) throw error;

  if (data.length === 0) {
    return Response.json({ error: "This ride can't be cancelled" }, { status: 409 });
  }

  // Only rides that had a driver need a ping
  if (data[0].driver_id) {
    await notifyUser(data[0].driver_id, "cancelled");
  }
  return Response.json({ ride: { id: data[0].id, status: data[0].status } });
}

// A driver gives back a ride they accepted but haven't started.
// The ride goes back to "requested", and other drivers are told about it.
async function releaseRide(user, id) {
  if (user.role !== "driver") {
    return Response.json({ error: "Only drivers can do this" }, { status: 403 });
  }

  // Giving rides back over and over would spam riders, so it's limited
  const limited = await checkRateLimit(`release:${user.id}`, 6, 600);
  if (limited) return limited;

  const { data, error } = await supabase
    .from("rides")
    .update({ status: "requested", driver_id: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("driver_id", user.id)
    .eq("status", "accepted")
    .select("id, rider_id, pickup_lat, pickup_lng");
  if (error) throw error;

  if (data.length === 0) {
    return Response.json({ error: "This ride can't be given back" }, { status: 409 });
  }

  await notifyUser(data[0].rider_id, "released");
  await notifyNearbyDrivers(
    { lat: data[0].pickup_lat, lng: data[0].pickup_lng },
    { exceptUserId: user.id }
  );

  return Response.json({ ride: { id: data[0].id, status: "requested" } });
}

async function acceptRide(user, id) {
  if (user.role !== "driver") {
    return Response.json({ error: "Only drivers can accept rides" }, { status: 403 });
  }

  // The driver must be online with a location
  const { data: driver, error: driverError } = await supabase
    .from("drivers")
    .select("is_online, current_lat, current_lng")
    .eq("user_id", user.id)
    .maybeSingle();
  if (driverError) throw driverError;

  if (!driver?.is_online || driver.current_lat === null || driver.current_lng === null) {
    return Response.json({ error: "Go online and set your location first" }, { status: 400 });
  }

  // One active ride at a time
  const { data: busy, error: busyError } = await supabase
    .from("rides")
    .select("id")
    .eq("driver_id", user.id)
    .in("status", ["accepted", "in_progress"])
    .limit(1);
  if (busyError) throw busyError;
  if (busy.length > 0) {
    return Response.json({ error: "Finish your current ride first" }, { status: 409 });
  }

  // Is the ride still open, still fresh, and close enough?
  const { data: ride, error: rideError } = await supabase
    .from("rides")
    .select("id, status, pickup_lat, pickup_lng, created_at")
    .eq("id", id)
    .maybeSingle();
  if (rideError) throw rideError;

  if (!ride || ride.status !== "requested") {
    return Response.json({ error: "This ride is no longer available" }, { status: 409 });
  }
  if (Date.parse(ride.created_at) < Date.parse(requestCutoff())) {
    return Response.json({ error: "This request has expired" }, { status: 409 });
  }

  const km = distanceKm(
    { lat: driver.current_lat, lng: driver.current_lng },
    { lat: ride.pickup_lat, lng: ride.pickup_lng }
  );
  if (km > MATCH_RADIUS_KM) {
    return Response.json({ error: "This ride is too far from you" }, { status: 403 });
  }

  // Assign the driver ONLY IF the ride is still "requested" and still fresh
  const { data: updated, error: updateError } = await supabase
    .from("rides")
    .update({
      driver_id: user.id,
      status: "accepted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "requested")
    .gte("created_at", requestCutoff())
    .select("id, status, driver_id, rider_id");

  if (updateError) {
    // 23505 = the database's own one-active-ride rule. Two accepts sent at the same
    // instant by the same driver can't both succeed.
    if (updateError.code === "23505") {
      return Response.json({ error: "Finish your current ride first" }, { status: 409 });
    }
    throw updateError;
  }

  if (updated.length === 0) {
    return Response.json({ error: "Another driver just took this ride" }, { status: 409 });
  }

  await notifyUser(updated[0].rider_id, "accepted");
  return Response.json({
    ride: { id: updated[0].id, status: updated[0].status, driver_id: updated[0].driver_id },
  });
}