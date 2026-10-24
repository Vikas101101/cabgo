import { getCurrentUser } from "@/lib/getCurrentUser";
import { fail, readJson } from "@/lib/http";
import { checkRateLimit } from "@/lib/rateLimit";
import { supabase } from "@/lib/supabase";
import { getRoute, isValidPoint } from "@/lib/route";
import { RIDE_TYPES, calculateFare } from "@/lib/fare";
import { distanceKm, MATCH_RADIUS_KM } from "@/lib/geo";
import { notifyUser } from "@/lib/realtime";

// GET /api/rides → the five newest rides, plus counts for the dashboard
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Riders see rides they booked, drivers see rides they drove
    const mine = user.role === "driver" ? "driver_id" : "rider_id";

    // A count asks the database for a NUMBER, so no ride rows travel at all
    const count = (statuses) => {
      let query = supabase
        .from("rides")
        .select("id", { count: "exact", head: true })
        .eq(mine, user.id);
      if (statuses) query = query.in("status", statuses);
      return query;
    };

    // The list and the three counts run at the same time
    const [recent, total, active, completed] = await Promise.all([
      supabase
        .from("rides")
        .select("id, status, pickup_address, dropoff_address, fare, created_at")
        .eq(mine, user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      count(null),
      count(["requested", "accepted", "in_progress"]),
      count(["completed"]),
    ]);

    for (const result of [recent, total, active, completed]) {
      if (result.error) throw result.error;
    }

    return Response.json({
      rides: recent.data ?? [],
      counts: {
        total: total.count ?? 0,
        active: active.count ?? 0,
        completed: completed.count ?? 0,
      },
    });
  } catch (err) {
    return fail(err);
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

    const limited = await checkRateLimit(`book:${user.id}`, 10, 60);
    if (limited) return limited;

    const { pickup, dropoff, ride_type } = await readJson(request);

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

    // 2. One active ride at a time
    const { data: active, error: activeError } = await supabase
      .from("rides")
      .select("id")
      .eq("rider_id", user.id)
      .in("status", ["requested", "accepted", "in_progress"])
      .limit(1);
    if (activeError) throw activeError;
    if (active.length > 0) {
      return Response.json({ error: "You already have an active ride." }, { status: 409 });
    }

    // 3. The SERVER works out distance, time and fare
    const route = await getRoute(pickup, dropoff);
    const fare = calculateFare(ride_type, route.distanceKm, route.durationMin);

    // 4. Save the ride
    const { data, error } = await supabase
      .from("rides")
      .insert({
        rider_id: user.id,
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
      })
      .select()
      .single();
    if (error) throw error;

    // 5. Ping nearby online drivers. Best effort: it never blocks the booking.
    try {
      const { data: drivers } = await supabase
        .from("drivers")
        .select("user_id, current_lat, current_lng")
        .eq("is_online", true)
        .not("current_lat", "is", null)
        .not("current_lng", "is", null)
        .limit(200);

      const nearby = (drivers ?? []).filter(
        (d) =>
          distanceKm(
            { lat: d.current_lat, lng: d.current_lng },
            { lat: pickup.lat, lng: pickup.lng }
          ) <= MATCH_RADIUS_KM
      );

      await Promise.all(nearby.map((d) => notifyUser(d.user_id, "new-request")));
    } catch (err) {
      console.warn("Could not notify drivers:", err.message);
    }

    return Response.json({ ride: data }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}