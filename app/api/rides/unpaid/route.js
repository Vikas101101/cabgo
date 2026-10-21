import { getCurrentUser } from "@/lib/getCurrentUser";
import { supabase } from "@/lib/supabase";

// GET /api/rides/unpaid → the rider's completed rides that haven't been paid yet
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Not logged in" }, { status: 401 });
    }

    // Only riders pay. For anyone else, there's simply nothing to show.
    if (user.role !== "rider") {
      return Response.json({ rides: [], payer: null });
    }

    const payer = { name: user.name, email: user.email };

    const { data: rides, error } = await supabase
      .from("rides")
      .select("id, pickup_address, dropoff_address, fare, ride_type, distance_km")
      .eq("rider_id", user.id)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    if (rides.length === 0) {
      return Response.json({ rides: [], payer });
    }

    // Which of these already have a successful payment?
    const { data: paid, error: paidError } = await supabase
      .from("payments")
      .select("ride_id")
      .in("ride_id", rides.map((r) => r.id))
      .eq("status", "succeeded");
    if (paidError) throw paidError;

    const paidIds = new Set(paid.map((p) => p.ride_id));

    return Response.json({
      rides: rides.filter((r) => !paidIds.has(r.id)),
      payer,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}