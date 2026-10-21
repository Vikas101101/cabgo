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
      .select(
        "id, ride_id, amount, currency, status, created_at, rides!inner(rider_id, pickup_address, dropoff_address)"
      )
      .eq("rides.rider_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return Response.json({ payments: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}