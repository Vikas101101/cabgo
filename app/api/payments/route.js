import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";

// GET /api/payments → payments for the logged-in rider's rides
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Join payments with their ride, keeping only this rider's rides.
    // "!inner" means: skip payments whose ride doesn't match the filter.
    const { data, error } = await supabase
      .from("payments")
      .select("*, rides!inner(rider_id, pickup_address, dropoff_address)")
      .eq("rides.rider_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ payments: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/payments → create a payment record for a ride
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    const { ride_id } = await request.json();
    if (!ride_id) {
      return Response.json({ error: "Missing field: ride_id" }, { status: 400 });
    }

    // Find the ride, and make sure it belongs to this rider
    const { data: ride, error: rideError } = await supabase
      .from("rides")
      .select("id, rider_id, fare")
      .eq("id", ride_id)
      .maybeSingle();

    if (rideError) throw rideError;
    if (!ride || ride.rider_id !== user.id) {
      return Response.json({ error: "Ride not found" }, { status: 404 });
    }
    if (!ride.fare) {
      return Response.json({ error: "Ride has no fare yet" }, { status: 400 });
    }

    // The amount comes from the ride in OUR database,
    // never from the browser, so the price can't be tampered with.
    const { data, error } = await supabase
      .from("payments")
      .insert({ ride_id: ride.id, amount: ride.fare })
      .select()
      .single();

    if (error) throw error;

    return Response.json({ payment: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}