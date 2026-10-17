import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";
import { getRoute, isValidPoint } from "@/lib/route";
import { RIDE_TYPES, calculateFare } from "@/lib/fare";

// GET /api/rides → list rides for the logged-in user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    let query = supabase
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false });

    if (user.role === "driver") {
      // Drivers see only rides assigned to them.
      // Open requests come from /api/rides/available (nearby only).
      query = query.eq("driver_id", user.id);
    } else {
      // Riders only see their own rides
      query = query.eq("rider_id", user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ rides: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/rides → a rider requests a new ride
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }
    if (user.role !== "rider") {
      return Response.json({ error: "Only riders can book rides" }, { status: 403 });
    }

    const { pickup, dropoff, ride_type } = await request.json();

    // 1. Check what the browser sent
    if (!RIDE_TYPES[ride_type]) {
      return Response.json({ error: "Choose a ride type" }, { status: 400 });
    }
    if (!isValidPoint(pickup) || !isValidPoint(dropoff)) {
      return Response.json({ error: "Choose a pickup and a drop-off" }, { status: 400 });
    }
    const pickupAddress = String(pickup.address ?? "").trim();
    const dropoffAddress = String(dropoff.address ?? "").trim();
    if (!pickupAddress || !dropoffAddress) {
      return Response.json({ error: "Choose a pickup and a drop-off" }, { status: 400 });
    }
    if (pickupAddress.length > 300 || dropoffAddress.length > 300) {
      return Response.json({ error: "Address is too long" }, { status: 400 });
    }

    // 2. One active ride at a time (also stops accidental double requests)
    const { data: active, error: activeError } = await supabase
      .from("rides")
      .select("id")
      .eq("rider_id", user.id)
      .in("status", ["requested", "accepted", "in_progress"])
      .limit(1);
    if (activeError) throw activeError;
    if (active.length > 0) {
      return Response.json(
        { error: "You already have an active ride." },
        { status: 409 }
      );
    }

    // 3. The SERVER works out distance, time and fare. We ignore any price from the browser.
    const route = await getRoute(pickup, dropoff);
    const fare = calculateFare(ride_type, route.distanceKm, route.durationMin);

    // 4. Save the ride
    const { data, error } = await supabase
      .from("rides")
      .insert({
        rider_id: user.id, // from the login, never from the browser
        pickup_address: pickupAddress,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoffAddress,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        distance_km: route.distanceKm,
        duration_min: route.durationMin,
        fare,
        ride_type,
        // status defaults to 'requested' in the database
      })
      .select()
      .single();
    if (error) throw error;

    return Response.json({ ride: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.status || 500 });
  }
}