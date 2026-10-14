import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";

// GET /api/rides → list rides for the logged-in user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Start a query: all rides, newest first
    let query = supabase
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false });

    if (user.role === "driver") {
      // Drivers see open requests, plus rides assigned to them
      query = query.or(`status.eq.requested,driver_id.eq.${user.id}`);
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

    // Only riders can book rides
    if (user.role !== "rider") {
      return Response.json({ error: "Only riders can book rides" }, { status: 403 });
    }

    // Read the data the browser sent
    const body = await request.json();

    // Check that the important fields are present
    const required = [
      "pickup_address", "pickup_lat", "pickup_lng",
      "dropoff_address", "dropoff_lat", "dropoff_lng",
    ];
    for (const field of required) {
      if (body[field] === undefined || body[field] === "") {
        return Response.json({ error: `Missing field: ${field}` }, { status: 400 });
      }
    }

    // Save the ride. We set rider_id ourselves from the login,
    // so a user can never book a ride in someone else's name.
    const { data, error } = await supabase
      .from("rides")
      .insert({
        rider_id: user.id,
        pickup_address: body.pickup_address,
        pickup_lat: body.pickup_lat,
        pickup_lng: body.pickup_lng,
        dropoff_address: body.dropoff_address,
        dropoff_lat: body.dropoff_lat,
        dropoff_lng: body.dropoff_lng,
        distance_km: body.distance_km ?? null,
        duration_min: body.duration_min ?? null,
        fare: body.fare ?? null,
        // status defaults to 'requested' in the database
      })
      .select()
      .single();

    if (error) throw error;

    // 201 means "created successfully"
    return Response.json({ ride: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}